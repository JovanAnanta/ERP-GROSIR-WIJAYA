import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  CompletePurchaseReturnDto,
  SavePurchaseReturnDto,
} from './dto/purchasing.dto.js';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  effectiveRemainingUnitCost,
  toBaseQuantity,
} from './fifo-cost.utils.js';
import {
  generateFifoLayerNumber,
  recordInitialFifoIn,
} from './fifo-ledger.utils.js';
import { generateInventoryMovementNumber } from '../inventory/inventory-movement-number.utils.js';
import {
  ACTIVITY_TYPES,
  AUDIT_OPERATIONS,
  changedFields,
  createAuditTransactionId,
  writeAuditLog,
} from '../../common/logging/business-logger.js';

const ACTIVE_RETURN_STATUSES = ['READY', 'COMPLETED'] as const;
const PURCHASE_RETURN_FULL_INCLUDE = {
  supplier: { select: { supplierName: true } },
  purchaseInvoice: { select: { purchaseInvoiceNumber: true } },
  appliedPurchaseInvoice: { select: { purchaseInvoiceNumber: true } },
  financialAccount: { select: { accountName: true } },
  details: {
    include: { productUnit: { include: { unit: true, product: true } } },
  },
} satisfies Prisma.PurchaseReturnInclude;

type PurchaseReturnFull = Prisma.PurchaseReturnGetPayload<{
  include: typeof PURCHASE_RETURN_FULL_INCLUDE;
}>;

@Injectable()
export class PurchaseReturnService {
  constructor(private readonly prisma: PrismaService) {}

  private async generateReturnNumber(tx: Prisma.TransactionClient) {
    const now = new Date();
    const date = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear()).slice(-2)}`;
    const prefix = `PR-${date}-`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PR:${prefix}`}))`;
    const last = await tx.purchaseReturn.findFirst({
      where: { purchaseReturnNumber: { startsWith: prefix } },
      orderBy: { purchaseReturnNumber: 'desc' },
      select: { purchaseReturnNumber: true },
    });
    const sequence = last
      ? Number(last.purchaseReturnNumber.split('-')[2] ?? 0) + 1
      : 1;
    return `${prefix}${String(sequence).padStart(7, '0')}`;
  }

  private async generateFinancialTransactionNumber(
    tx: Prisma.TransactionClient,
  ) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('FAT:NUMBER'))`;
    const last = await tx.financialAccountTransaction.findFirst({
      where: { transactionNumber: { startsWith: 'FAT-' } },
      orderBy: { financialAccountTransactionId: 'desc' },
      select: { transactionNumber: true },
    });
    const lastTimestamp = last
      ? Number(last.transactionNumber.split('-')[1])
      : 0;
    return `FAT-${Math.max(Date.now(), lastTimestamp + 1)}-RETURN`;
  }

  private validateResolution(dto: SavePurchaseReturnDto) {
    if (dto.resolutionType === 'REPLACEMENT' && !dto.expectedResolutionDate) {
      throw new HttpException(
        'Estimasi barang pengganti wajib diisi.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async buildDetails(
    tx: Prisma.TransactionClient,
    dto: SavePurchaseReturnDto,
    excludeReturnId?: bigint,
  ) {
    this.validateResolution(dto);
    const invoiceId = BigInt(dto.purchaseInvoiceId);
    const invoice = await tx.purchaseInvoice.findUnique({
      where: { purchaseInvoiceId: invoiceId },
      include: {
        details: {
          include: {
            productUnit: {
              include: {
                product: {
                  include: { productUnits: { include: { unit: true } } },
                },
                unit: true,
              },
            },
          },
        },
      },
    });
    if (!invoice || invoice.status !== 'COMPLETED') {
      throw new HttpException(
        'Purchase Return hanya dapat dibuat dari Purchase Invoice COMPLETED.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const uniqueDetailIds = new Set(
      dto.items.map((item) => item.purchaseInvoiceDetailId),
    );
    if (uniqueDetailIds.size !== dto.items.length) {
      throw new HttpException(
        'Item retur tidak boleh duplikat.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const details = [];
    for (const item of dto.items) {
      const invoiceDetail = invoice.details.find(
        (detail) =>
          detail.purchaseInvoiceDetailId ===
          BigInt(item.purchaseInvoiceDetailId),
      );
      if (!invoiceDetail) {
        throw new HttpException(
          'Terdapat item yang bukan berasal dari Purchase Invoice tersebut.',
          HttpStatus.BAD_REQUEST,
        );
      }
      const returnUnit = invoiceDetail.productUnit.product.productUnits.find(
        (unit) =>
          unit.productUnitId === BigInt(item.productUnitId) && unit.isActive,
      );
      const parentUnit = invoiceDetail.productUnit.product.productUnits.find(
        (unit) => unit.isParent,
      );
      if (!returnUnit || !parentUnit) {
        throw new HttpException(
          'Unit retur tidak valid atau base unit produk tidak ditemukan.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const layers = await tx.fifoLayer.findMany({
        where: {
          originType: 'PURCHASE',
          originId: invoiceDetail.purchaseInvoiceDetailId,
          productUnitId: parentUnit.productUnitId,
        },
      });
      if (layers.length !== 1) {
        throw new HttpException(
          'Exact FIFO layer Purchase Invoice tidak ditemukan atau tidak unik.',
          HttpStatus.CONFLICT,
        );
      }
      const layer = layers[0];
      const baseQuantity = toBaseQuantity(
        new Prisma.Decimal(item.quantity),
        returnUnit.conversionFactor,
        parentUnit.conversionFactor,
      );
      const purchasedBaseQuantity = toBaseQuantity(
        invoiceDetail.quantity,
        invoiceDetail.productUnit.conversionFactor,
        parentUnit.conversionFactor,
      );
      const returned = await tx.purchaseReturnDetail.aggregate({
        where: {
          purchaseInvoiceDetailId: invoiceDetail.purchaseInvoiceDetailId,
          purchaseReturn: {
            status: { in: [...ACTIVE_RETURN_STATUSES] },
            ...(excludeReturnId
              ? { purchaseReturnId: { not: excludeReturnId } }
              : {}),
          },
        },
        _sum: { baseQuantity: true },
      });
      const returnedBaseQuantity =
        returned._sum.baseQuantity ?? new Prisma.Decimal(0);
      if (
        baseQuantity.greaterThan(
          purchasedBaseQuantity.sub(returnedBaseQuantity),
        )
      ) {
        throw new HttpException(
          `Qty retur ${invoiceDetail.productUnit.product.productName} melebihi sisa pembelian.`,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (baseQuantity.greaterThan(layer.remainingQty)) {
        throw new HttpException(
          `Qty retur ${invoiceDetail.productUnit.product.productName} melebihi exact FIFO yang tersedia.`,
          HttpStatus.CONFLICT,
        );
      }

      const fifoUnitCost = effectiveRemainingUnitCost(
        layer.remainingCost,
        layer.remainingQty,
        layer.originalCost,
        layer.originalQty,
      );
      const inventoryCostSubtotal = baseQuantity
        .mul(fifoUnitCost)
        .toDecimalPlaces(2);
      const commercialSubtotal = new Prisma.Decimal(item.quantity)
        .mul(item.unitCost)
        .toDecimalPlaces(2);
      details.push({
        purchaseInvoiceDetailId: invoiceDetail.purchaseInvoiceDetailId,
        productUnitId: returnUnit.productUnitId,
        fifoLayerId: layer.fifoLayerId,
        quantity: new Prisma.Decimal(item.quantity),
        baseQuantity,
        unitCost: new Prisma.Decimal(item.unitCost),
        fifoUnitCost,
        inventoryCostSubtotal,
        subtotal: commercialSubtotal,
      });
    }
    return { invoice, details };
  }

  async create(userId: bigint, dto: SavePurchaseReturnDto) {
    return this.prisma.$transaction(async (tx) => {
      const { invoice, details } = await this.buildDetails(tx, dto);
      const number = await this.generateReturnNumber(tx);
      const created = await tx.purchaseReturn.create({
        data: {
          purchaseReturnNumber: number,
          purchaseInvoiceId: invoice.purchaseInvoiceId,
          supplierId: invoice.supplierId,
          status: 'DRAFT',
          resolutionType: dto.resolutionType,
          returnDate: new Date(dto.returnDate),
          expectedResolutionDate: dto.expectedResolutionDate
            ? new Date(dto.expectedResolutionDate)
            : null,
          returnTotal: details.reduce(
            (sum, item) => sum.add(item.subtotal),
            new Prisma.Decimal(0),
          ),
          inventoryCostTotal: details.reduce(
            (sum, item) => sum.add(item.inventoryCostSubtotal),
            new Prisma.Decimal(0),
          ),
          reason: dto.reason.trim(),
          note: dto.note?.trim() || null,
          createdBy: userId,
          details: { create: details },
        },
      });
      const transactionId = createAuditTransactionId();
      const createdDetails = await tx.purchaseReturnDetail.findMany({
        where: { purchaseReturnId: created.purchaseReturnId },
      });
      await this.log(
        tx,
        created.purchaseReturnId,
        number,
        userId,
        'CREATE_RETURN',
        'Membuat draft Purchase Return',
        {
          operation: 'INSERT',
          before: null,
          after: {
            purchaseInvoiceId: created.purchaseInvoiceId,
            supplierId: created.supplierId,
            status: created.status,
            resolutionType: created.resolutionType,
            returnDate: created.returnDate,
            expectedResolutionDate: created.expectedResolutionDate,
            returnTotal: created.returnTotal,
            inventoryCostTotal: created.inventoryCostTotal,
            reason: created.reason,
            note: created.note,
          },
        },
        transactionId,
      );
      for (const detail of createdDetails)
        await writeAuditLog(tx, {
          userId,
          transactionId,
          module: 'PURCHASE',
          operation: AUDIT_OPERATIONS.CREATE,
          entityType: 'PURCHASE_RETURN_DETAIL',
          entityId: detail.purchaseReturnDetailId,
          entityNumber: number,
          source: 'Created via Purchase Return',
          changedFields: changedFields(null, detail, [
            'purchaseInvoiceDetailId',
            'productUnitId',
            'fifoLayerId',
            'quantity',
            'baseQuantity',
            'unitCost',
            'fifoUnitCost',
            'inventoryCostSubtotal',
            'subtotal',
          ]),
        });
      if (dto.status === 'READY') {
        await this.markReadyInTransaction(tx, created.purchaseReturnId, userId);
      }
      return this.findByIdInTransaction(tx, created.purchaseReturnId);
    });
  }

  async update(userId: bigint, id: string, dto: SavePurchaseReturnDto) {
    const returnId = BigInt(id);
    return this.prisma.$transaction(async (tx) => {
      await this.lockReturn(tx, returnId);
      const existing = await tx.purchaseReturn.findUnique({
        where: { purchaseReturnId: returnId },
        include: { details: true },
      });
      if (!existing)
        throw new HttpException(
          'Purchase Return tidak ditemukan.',
          HttpStatus.NOT_FOUND,
        );
      if (existing.status !== 'DRAFT') {
        throw new HttpException(
          'Hanya Purchase Return DRAFT yang dapat diedit.',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (existing.purchaseInvoiceId !== BigInt(dto.purchaseInvoiceId)) {
        throw new HttpException(
          'Referensi Purchase Invoice tidak dapat diubah.',
          HttpStatus.BAD_REQUEST,
        );
      }
      const { details } = await this.buildDetails(tx, dto, returnId);
      await tx.purchaseReturnDetail.deleteMany({
        where: { purchaseReturnId: returnId },
      });
      const transactionId = createAuditTransactionId();
      const updated = await tx.purchaseReturn.update({
        where: { purchaseReturnId: returnId },
        data: {
          resolutionType: dto.resolutionType,
          returnDate: new Date(dto.returnDate),
          expectedResolutionDate: dto.expectedResolutionDate
            ? new Date(dto.expectedResolutionDate)
            : null,
          returnTotal: details.reduce(
            (sum, item) => sum.add(item.subtotal),
            new Prisma.Decimal(0),
          ),
          inventoryCostTotal: details.reduce(
            (sum, item) => sum.add(item.inventoryCostSubtotal),
            new Prisma.Decimal(0),
          ),
          reason: dto.reason.trim(),
          note: dto.note?.trim() || null,
          updatedBy: userId,
          details: { create: details },
        },
        include: { details: true },
      });
      await this.log(
        tx,
        returnId,
        existing.purchaseReturnNumber,
        userId,
        'UPDATE_RETURN',
        'Memperbarui draft Purchase Return',
        {
          operation: 'UPDATE',
          before: {
            resolutionType: existing.resolutionType,
            returnDate: existing.returnDate.toISOString(),
            reason: existing.reason,
            note: existing.note,
          },
          after: {
            resolutionType: updated.resolutionType,
            returnDate: updated.returnDate,
            expectedResolutionDate: updated.expectedResolutionDate,
            returnTotal: updated.returnTotal,
            inventoryCostTotal: updated.inventoryCostTotal,
            reason: updated.reason,
            note: updated.note,
          },
        },
        transactionId,
      );
      for (const detail of existing.details)
        await writeAuditLog(tx, {
          userId,
          transactionId,
          module: 'PURCHASE',
          operation: AUDIT_OPERATIONS.DELETE,
          entityType: 'PURCHASE_RETURN_DETAIL',
          entityId: detail.purchaseReturnDetailId,
          entityNumber: existing.purchaseReturnNumber,
          source: 'Replaced via Purchase Return Update',
          changedFields: changedFields(detail, null, [
            'purchaseInvoiceDetailId',
            'productUnitId',
            'fifoLayerId',
            'quantity',
            'baseQuantity',
            'unitCost',
            'fifoUnitCost',
            'inventoryCostSubtotal',
            'subtotal',
          ]),
        });
      for (const detail of updated.details)
        await writeAuditLog(tx, {
          userId,
          transactionId,
          module: 'PURCHASE',
          operation: AUDIT_OPERATIONS.CREATE,
          entityType: 'PURCHASE_RETURN_DETAIL',
          entityId: detail.purchaseReturnDetailId,
          entityNumber: existing.purchaseReturnNumber,
          source: 'Replaced via Purchase Return Update',
          changedFields: changedFields(null, detail, [
            'purchaseInvoiceDetailId',
            'productUnitId',
            'fifoLayerId',
            'quantity',
            'baseQuantity',
            'unitCost',
            'fifoUnitCost',
            'inventoryCostSubtotal',
            'subtotal',
          ]),
        });
      if (dto.status === 'READY')
        await this.markReadyInTransaction(tx, returnId, userId);
      return this.findByIdInTransaction(tx, returnId);
    });
  }

  async markReady(userId: bigint, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const returnId = BigInt(id);
      await this.markReadyInTransaction(tx, returnId, userId);
      return this.findByIdInTransaction(tx, returnId);
    });
  }

  private async markReadyInTransaction(
    tx: Prisma.TransactionClient,
    returnId: bigint,
    userId: bigint,
  ) {
    await this.lockReturn(tx, returnId);
    const purchaseReturn = await tx.purchaseReturn.findUnique({
      where: { purchaseReturnId: returnId },
      include: {
        details: true,
        purchaseInvoice: { select: { outstandingAmount: true } },
      },
    });
    if (!purchaseReturn)
      throw new HttpException(
        'Purchase Return tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    if (purchaseReturn.status !== 'DRAFT') {
      throw new HttpException(
        'Hanya Purchase Return DRAFT yang dapat dibuat READY.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      purchaseReturn.resolutionType === 'CURRENT_INVOICE_DEDUCTION' &&
      purchaseReturn.returnTotal.greaterThan(
        purchaseReturn.purchaseInvoice.outstandingAmount,
      )
    ) {
      throw new HttpException(
        'Nilai retur melebihi outstanding PI. Pilih nilai lebih kecil atau metode penyelesaian lain.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const now = new Date();
    const transactionId = createAuditTransactionId();
    let inventoryCostTotal = new Prisma.Decimal(0);
    for (const detail of purchaseReturn.details) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RETURN_FIFO:${detail.fifoLayerId.toString()}`}))`;
      const layer = await tx.fifoLayer.findUnique({
        where: { fifoLayerId: detail.fifoLayerId },
      });
      if (!layer || layer.remainingQty.lessThan(detail.baseQuantity)) {
        throw new HttpException(
          'Exact FIFO tidak lagi mencukupi untuk retur.',
          HttpStatus.CONFLICT,
        );
      }
      const alreadyReturned = await tx.purchaseReturnDetail.aggregate({
        where: {
          purchaseInvoiceDetailId: detail.purchaseInvoiceDetailId,
          purchaseReturnId: { not: returnId },
          purchaseReturn: { status: { in: [...ACTIVE_RETURN_STATUSES] } },
        },
        _sum: { baseQuantity: true },
      });
      const invoiceDetail = await tx.purchaseInvoiceDetail.findUnique({
        where: { purchaseInvoiceDetailId: detail.purchaseInvoiceDetailId },
        include: {
          productUnit: {
            include: { product: { include: { productUnits: true } } },
          },
        },
      });
      if (!invoiceDetail)
        throw new HttpException(
          'Detail PI tidak ditemukan.',
          HttpStatus.CONFLICT,
        );
      const parent = invoiceDetail.productUnit.product.productUnits.find(
        (unit) => unit.isParent,
      );
      if (!parent)
        throw new HttpException(
          'Base unit tidak ditemukan.',
          HttpStatus.CONFLICT,
        );
      const purchasedBase = invoiceDetail.quantity
        .mul(invoiceDetail.productUnit.conversionFactor)
        .div(parent.conversionFactor);
      const returnedBase =
        alreadyReturned._sum.baseQuantity ?? new Prisma.Decimal(0);
      if (detail.baseQuantity.greaterThan(purchasedBase.sub(returnedBase))) {
        throw new HttpException(
          'Qty retur melebihi sisa PI.',
          HttpStatus.CONFLICT,
        );
      }
      const stock = await tx.inventoryStock.findFirst({
        where: { productUnitId: layer.productUnitId },
      });
      if (
        !stock ||
        stock.actualQty.lessThan(detail.baseQuantity) ||
        stock.availableQty.lessThan(detail.baseQuantity)
      ) {
        throw new HttpException(
          'Stok saat ini tidak mencukupi untuk Purchase Return.',
          HttpStatus.CONFLICT,
        );
      }
      const effectiveCost = effectiveRemainingUnitCost(
        layer.remainingCost,
        layer.remainingQty,
        layer.originalCost,
        layer.originalQty,
      );
      const cost = detail.baseQuantity.mul(effectiveCost).toDecimalPlaces(2);
      const movement = await tx.inventoryMovement.create({
        data: {
          movementNumber: await generateInventoryMovementNumber(tx, 'OUT', now),
          productUnitId: layer.productUnitId,
          direction: 'OUT',
          quantity: detail.baseQuantity,
          movementType: 'PURCHASE_RETURN',
          originType: 'PURCHASE_RETURN_DETAIL',
          originId: detail.purchaseReturnDetailId,
          originNumber: purchaseReturn.purchaseReturnNumber,
          movementDate: now,
          createdBy: userId,
        },
      });
      const fifoTransaction = await tx.fifoLayerTransaction.create({
        data: {
          fifoLayerId: layer.fifoLayerId,
          inventoryMovementId: movement.inventoryMovementId,
          quantity: detail.baseQuantity,
          direction: 'OUT',
          unitCost: effectiveCost,
          totalCost: cost,
          quantityBefore: layer.remainingQty,
          quantityAfter: layer.remainingQty.sub(detail.baseQuantity),
          createdBy: userId,
        },
      });
      const updatedLayer = await tx.fifoLayer.update({
        where: { fifoLayerId: layer.fifoLayerId },
        data: {
          remainingQty: { decrement: detail.baseQuantity },
          remainingCost: { decrement: cost },
        },
      });
      const updatedStock = await tx.inventoryStock.update({
        where: { inventoryStockId: stock.inventoryStockId },
        data: {
          actualQty: { decrement: detail.baseQuantity },
          availableQty: { decrement: detail.baseQuantity },
        },
      });
      const updatedDetail = await tx.purchaseReturnDetail.update({
        where: { purchaseReturnDetailId: detail.purchaseReturnDetailId },
        data: { fifoUnitCost: effectiveCost, inventoryCostSubtotal: cost },
      });
      await writeAuditLog(tx, {
        userId,
        transactionId,
        module: 'INVENTORY',
        operation: AUDIT_OPERATIONS.CREATE,
        entityType: 'INVENTORY_MOVEMENT',
        entityId: movement.inventoryMovementId,
        entityNumber: purchaseReturn.purchaseReturnNumber,
        source: 'Created via Purchase Return',
        changedFields: changedFields(null, movement, [
          'movementNumber',
          'productUnitId',
          'direction',
          'quantity',
          'movementType',
          'originType',
          'originId',
          'movementDate',
        ]),
      });
      await writeAuditLog(tx, {
        userId,
        transactionId,
        module: 'FIFO',
        operation: AUDIT_OPERATIONS.CREATE,
        entityType: 'FIFO_LAYER_TRANSACTION',
        entityId: fifoTransaction.fifoLayerTransactionId,
        entityNumber: purchaseReturn.purchaseReturnNumber,
        source: 'Created via Purchase Return',
        changedFields: changedFields(null, fifoTransaction, [
          'fifoLayerId',
          'inventoryMovementId',
          'quantity',
          'direction',
          'unitCost',
          'totalCost',
          'quantityBefore',
          'quantityAfter',
        ]),
      });
      await writeAuditLog(tx, {
        userId,
        transactionId,
        module: 'FIFO',
        operation: AUDIT_OPERATIONS.UPDATE,
        entityType: 'FIFO_LAYER',
        entityId: layer.fifoLayerId,
        entityNumber: layer.fifoLayerNumber,
        source: 'Updated via Purchase Return',
        changedFields: changedFields(layer, updatedLayer, [
          'remainingQty',
          'remainingCost',
        ]),
      });
      await writeAuditLog(tx, {
        userId,
        transactionId,
        module: 'INVENTORY',
        operation: AUDIT_OPERATIONS.UPDATE,
        entityType: 'INVENTORY_STOCK',
        entityId: stock.inventoryStockId,
        entityNumber: purchaseReturn.purchaseReturnNumber,
        source: 'Updated via Purchase Return',
        changedFields: changedFields(stock, updatedStock, [
          'actualQty',
          'availableQty',
        ]),
      });
      await writeAuditLog(tx, {
        userId,
        transactionId,
        module: 'PURCHASE',
        operation: AUDIT_OPERATIONS.UPDATE,
        entityType: 'PURCHASE_RETURN_DETAIL',
        entityId: detail.purchaseReturnDetailId,
        entityNumber: purchaseReturn.purchaseReturnNumber,
        source: 'Updated via Purchase Return',
        changedFields: changedFields(detail, updatedDetail, [
          'fifoUnitCost',
          'inventoryCostSubtotal',
        ]),
      });
      inventoryCostTotal = inventoryCostTotal.add(cost);
    }
    await tx.purchaseReturn.update({
      where: { purchaseReturnId: returnId },
      data: { status: 'READY', inventoryCostTotal, updatedBy: userId },
    });
    await this.log(
      tx,
      returnId,
      purchaseReturn.purchaseReturnNumber,
      userId,
      'READY_RETURN',
      'Barang retur telah diambil dan inventory/FIFO dikurangi',
      {
        operation: 'UPDATE',
        before: { status: 'DRAFT' },
        after: { status: 'READY' },
      },
      transactionId,
    );
  }

  async complete(userId: bigint, id: string, dto: CompletePurchaseReturnDto) {
    return this.prisma.$transaction(async (tx) => {
      const returnId = BigInt(id);
      const transactionId = createAuditTransactionId();
      await this.lockReturn(tx, returnId);
      const purchaseReturn = await tx.purchaseReturn.findUnique({
        where: { purchaseReturnId: returnId },
        include: {
          details: { include: { fifoLayer: true } },
          purchaseInvoice: true,
        },
      });
      if (!purchaseReturn)
        throw new HttpException(
          'Purchase Return tidak ditemukan.',
          HttpStatus.NOT_FOUND,
        );
      if (purchaseReturn.status !== 'READY') {
        throw new HttpException(
          'Hanya Purchase Return READY yang dapat diselesaikan.',
          HttpStatus.BAD_REQUEST,
        );
      }
      const now = new Date();
      if (purchaseReturn.resolutionType === 'REPLACEMENT') {
        for (const detail of purchaseReturn.details) {
          const movement = await tx.inventoryMovement.create({
            data: {
              movementNumber: await generateInventoryMovementNumber(
                tx,
                'IN',
                now,
              ),
              productUnitId: detail.fifoLayer.productUnitId,
              direction: 'IN',
              quantity: detail.baseQuantity,
              movementType: 'PURCHASE_RETURN_REPLACEMENT',
              originType: 'PURCHASE_RETURN_DETAIL',
              originId: detail.purchaseReturnDetailId,
              originNumber: purchaseReturn.purchaseReturnNumber,
              movementDate: now,
              createdBy: userId,
            },
          });
          const baseCost = detail.inventoryCostSubtotal.div(
            detail.baseQuantity,
          );
          const replacementLayer = await tx.fifoLayer.create({
            data: {
              fifoLayerNumber: await generateFifoLayerNumber(tx, now),
              productUnitId: detail.fifoLayer.productUnitId,
              originType: 'PURCHASE_RETURN_REPLACEMENT',
              originInventoryMovementId: movement.inventoryMovementId,
              originId: detail.purchaseReturnDetailId,
              originalQty: detail.baseQuantity,
              remainingQty: detail.baseQuantity,
              unitCost: baseCost,
              originalCost: detail.inventoryCostSubtotal,
              remainingCost: detail.inventoryCostSubtotal,
              createdBy: userId,
            },
          });
          const fifoTransaction = await recordInitialFifoIn(tx, {
            fifoLayerId: replacementLayer.fifoLayerId,
            inventoryMovementId: movement.inventoryMovementId,
            quantity: detail.baseQuantity,
            unitCost: baseCost,
            totalCost: detail.inventoryCostSubtotal,
            createdBy: userId,
          });
          const stock = await tx.inventoryStock.findFirst({
            where: { productUnitId: detail.fifoLayer.productUnitId },
          });
          if (!stock)
            throw new HttpException(
              'Inventory stock tidak ditemukan.',
              HttpStatus.CONFLICT,
            );
          const updatedStock = await tx.inventoryStock.update({
            where: { inventoryStockId: stock.inventoryStockId },
            data: {
              actualQty: { increment: detail.baseQuantity },
              availableQty: { increment: detail.baseQuantity },
            },
          });
          await writeAuditLog(tx, {
            userId,
            transactionId,
            module: 'INVENTORY',
            operation: AUDIT_OPERATIONS.CREATE,
            entityType: 'INVENTORY_MOVEMENT',
            entityId: movement.inventoryMovementId,
            entityNumber: purchaseReturn.purchaseReturnNumber,
            source: 'Created via Purchase Return Replacement',
            changedFields: changedFields(null, movement, [
              'movementNumber',
              'productUnitId',
              'direction',
              'quantity',
              'movementType',
              'originType',
              'originId',
              'movementDate',
            ]),
          });
          await writeAuditLog(tx, {
            userId,
            transactionId,
            module: 'FIFO',
            operation: AUDIT_OPERATIONS.CREATE,
            entityType: 'FIFO_LAYER',
            entityId: replacementLayer.fifoLayerId,
            entityNumber: replacementLayer.fifoLayerNumber,
            source: 'Created via Purchase Return Replacement',
            changedFields: changedFields(null, replacementLayer, [
              'productUnitId',
              'originType',
              'originInventoryMovementId',
              'originId',
              'originalQty',
              'remainingQty',
              'unitCost',
              'originalCost',
              'remainingCost',
            ]),
          });
          await writeAuditLog(tx, {
            userId,
            transactionId,
            module: 'FIFO',
            operation: AUDIT_OPERATIONS.CREATE,
            entityType: 'FIFO_LAYER_TRANSACTION',
            entityId: fifoTransaction.fifoLayerTransactionId,
            entityNumber: replacementLayer.fifoLayerNumber,
            source: 'Created via Purchase Return Replacement',
            changedFields: changedFields(null, fifoTransaction, [
              'fifoLayerId',
              'inventoryMovementId',
              'quantity',
              'direction',
              'unitCost',
              'totalCost',
              'quantityBefore',
              'quantityAfter',
            ]),
          });
          await writeAuditLog(tx, {
            userId,
            transactionId,
            module: 'INVENTORY',
            operation: AUDIT_OPERATIONS.UPDATE,
            entityType: 'INVENTORY_STOCK',
            entityId: stock.inventoryStockId,
            entityNumber: purchaseReturn.purchaseReturnNumber,
            source: 'Updated via Purchase Return Replacement',
            changedFields: changedFields(stock, updatedStock, [
              'actualQty',
              'availableQty',
            ]),
          });
        }
      } else if (
        purchaseReturn.resolutionType === 'CURRENT_INVOICE_DEDUCTION'
      ) {
        await tx.$queryRaw`SELECT purchase_invoice_id FROM purchase_invoice WHERE purchase_invoice_id = ${purchaseReturn.purchaseInvoiceId} FOR UPDATE`;
        const invoice = await tx.purchaseInvoice.findUnique({
          where: { purchaseInvoiceId: purchaseReturn.purchaseInvoiceId },
        });
        if (
          !invoice ||
          invoice.outstandingAmount.lessThan(purchaseReturn.returnTotal)
        ) {
          throw new HttpException(
            'Nilai retur melebihi outstanding Purchase Invoice.',
            HttpStatus.CONFLICT,
          );
        }
        const remaining = invoice.outstandingAmount.sub(
          purchaseReturn.returnTotal,
        );
        const updatedInvoice = await tx.purchaseInvoice.update({
          where: { purchaseInvoiceId: invoice.purchaseInvoiceId },
          data: {
            outstandingAmount: remaining,
            statusPayment: remaining.equals(0) ? 'PAID' : invoice.statusPayment,
          },
        });
        const summaryBefore = await tx.supplierFinancialSummary.findUnique({
          where: { supplierId: purchaseReturn.supplierId },
        });
        const summary = await tx.supplierFinancialSummary.updateMany({
          where: {
            supplierId: purchaseReturn.supplierId,
            outstandingAmount: { gte: purchaseReturn.returnTotal },
            currentAmount: { gte: purchaseReturn.returnTotal },
          },
          data: {
            outstandingAmount: { decrement: purchaseReturn.returnTotal },
            currentAmount: { decrement: purchaseReturn.returnTotal },
          },
        });
        if (summary.count !== 1)
          throw new HttpException(
            'Saldo hutang supplier tidak konsisten.',
            HttpStatus.CONFLICT,
          );
        const summaryAfter = await tx.supplierFinancialSummary.findUnique({
          where: { supplierId: purchaseReturn.supplierId },
        });
        const supplierTransaction = await tx.supplierAccountTransaction.create({
          data: {
            transactionNumber: `SAT-PR-${returnId}`,
            supplierId: purchaseReturn.supplierId,
            transactionType: 'PURCHASE_RETURN_DEDUCTION',
            direction: 'OUT',
            amount: purchaseReturn.returnTotal,
            referenceType: 'PURCHASE_RETURN',
            referenceId: returnId,
            transactionDate: now,
            note: purchaseReturn.note,
            createdBy: userId,
          },
        });
        await writeAuditLog(tx, {
          userId,
          transactionId,
          module: 'PURCHASE',
          operation: AUDIT_OPERATIONS.UPDATE,
          entityType: 'PURCHASE_INVOICE',
          entityId: invoice.purchaseInvoiceId,
          entityNumber: invoice.purchaseInvoiceNumber,
          source: 'Updated via Purchase Return Deduction',
          changedFields: changedFields(invoice, updatedInvoice, [
            'outstandingAmount',
            'statusPayment',
          ]),
        });
        if (summaryBefore && summaryAfter) {
          await writeAuditLog(tx, {
            userId,
            transactionId,
            module: 'FINANCIAL',
            operation: AUDIT_OPERATIONS.UPDATE,
            entityType: 'SUPPLIER_FINANCIAL_SUMMARY',
            entityId: summaryBefore.supplierFinancialId,
            entityNumber: purchaseReturn.purchaseReturnNumber,
            source: 'Updated via Purchase Return Deduction',
            changedFields: changedFields(summaryBefore, summaryAfter, [
              'outstandingAmount',
              'currentAmount',
            ]),
          });
        }
        await writeAuditLog(tx, {
          userId,
          transactionId,
          module: 'FINANCIAL',
          operation: AUDIT_OPERATIONS.CREATE,
          entityType: 'SUPPLIER_ACCOUNT_TRANSACTION',
          entityId: supplierTransaction.supplierAccountTransactionId,
          entityNumber: supplierTransaction.transactionNumber,
          source: 'Created via Purchase Return Deduction',
          changedFields: changedFields(null, supplierTransaction, [
            'supplierId',
            'transactionType',
            'direction',
            'amount',
            'referenceType',
            'referenceId',
            'transactionDate',
          ]),
        });
      } else if (purchaseReturn.resolutionType === 'NEXT_INVOICE_DEDUCTION') {
        if (!dto.appliedPurchaseInvoiceId) {
          throw new HttpException(
            'PI penerapan potongan wajib dipilih.',
            HttpStatus.BAD_REQUEST,
          );
        }
        const appliedId = BigInt(dto.appliedPurchaseInvoiceId);
        const applied = await tx.purchaseInvoice.findUnique({
          where: { purchaseInvoiceId: appliedId },
        });
        if (
          !applied ||
          applied.status !== 'COMPLETED' ||
          applied.supplierId !== purchaseReturn.supplierId ||
          appliedId === purchaseReturn.purchaseInvoiceId
        ) {
          throw new HttpException(
            'PI penerapan potongan tidak valid.',
            HttpStatus.BAD_REQUEST,
          );
        }
        await tx.purchaseReturn.update({
          where: { purchaseReturnId: returnId },
          data: { appliedPurchaseInvoiceId: appliedId },
        });
      } else if (purchaseReturn.resolutionType === 'CASHBACK') {
        if (!dto.financialAccountId || !dto.paymentMethod)
          throw new HttpException(
            'Metode cashback dan akun kas/bank wajib dipilih.',
            HttpStatus.BAD_REQUEST,
          );
        const accountId = BigInt(dto.financialAccountId);
        const account = await tx.financialAccount.findUnique({
          where: { financialAccountId: accountId },
        });
        if (!account?.isActive)
          throw new HttpException(
            'Akun kas/bank tidak valid.',
            HttpStatus.BAD_REQUEST,
          );
        const updatedAccount = await tx.financialAccount.update({
          where: { financialAccountId: accountId },
          data: {
            currentBalance: { increment: purchaseReturn.returnTotal },
            updatedAt: now,
            updatedBy: userId,
          },
        });
        const financialTransaction =
          await tx.financialAccountTransaction.create({
            data: {
              transactionNumber:
                await this.generateFinancialTransactionNumber(tx),
              financialAccountId: accountId,
              transactionType: 'PURCHASE_RETURN_CASHBACK',
              paymentMethod: dto.paymentMethod,
              direction: 'IN',
              amount: purchaseReturn.returnTotal,
              referenceType: 'PURCHASE_RETURN',
              referenceId: returnId,
              transactionDate: now,
              note: purchaseReturn.note,
              createdBy: userId,
            },
          });
        await tx.purchaseReturn.update({
          where: { purchaseReturnId: returnId },
          data: { financialAccountId: accountId },
        });
        await writeAuditLog(tx, {
          userId,
          transactionId,
          module: 'FINANCIAL',
          operation: AUDIT_OPERATIONS.UPDATE,
          entityType: 'FINANCIAL_ACCOUNT',
          entityId: account.financialAccountId,
          entityNumber: account.accountName,
          source: 'Updated via Purchase Return Cashback',
          changedFields: changedFields(account, updatedAccount, [
            'currentBalance',
          ]),
        });
        await writeAuditLog(tx, {
          userId,
          transactionId,
          module: 'FINANCIAL',
          operation: AUDIT_OPERATIONS.CREATE,
          entityType: 'FINANCIAL_ACCOUNT_TRANSACTION',
          entityId: financialTransaction.financialAccountTransactionId,
          entityNumber: financialTransaction.transactionNumber,
          source: 'Created via Purchase Return Cashback',
          changedFields: changedFields(null, financialTransaction, [
            'financialAccountId',
            'transactionType',
            'paymentMethod',
            'direction',
            'amount',
            'referenceType',
            'referenceId',
            'transactionDate',
          ]),
        });
      }
      const completedReturn = await tx.purchaseReturn.update({
        where: { purchaseReturnId: returnId },
        data: { status: 'COMPLETED', updatedBy: userId },
      });
      await this.log(
        tx,
        returnId,
        purchaseReturn.purchaseReturnNumber,
        userId,
        'COMPLETE_RETURN',
        'Menyelesaikan Purchase Return',
        {
          operation: 'UPDATE',
          before: {
            status: purchaseReturn.status,
            appliedPurchaseInvoiceId: purchaseReturn.appliedPurchaseInvoiceId,
            financialAccountId: purchaseReturn.financialAccountId,
          },
          after: {
            status: completedReturn.status,
            appliedPurchaseInvoiceId: completedReturn.appliedPurchaseInvoiceId,
            financialAccountId: completedReturn.financialAccountId,
          },
        },
        transactionId,
      );
      return this.findByIdInTransaction(tx, returnId);
    });
  }

  async cancel(userId: bigint, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const returnId = BigInt(id);
      const transactionId = createAuditTransactionId();
      await this.lockReturn(tx, returnId);
      const purchaseReturn = await tx.purchaseReturn.findUnique({
        where: { purchaseReturnId: returnId },
        include: { details: { include: { fifoLayer: true } } },
      });
      if (!purchaseReturn)
        throw new HttpException(
          'Purchase Return tidak ditemukan.',
          HttpStatus.NOT_FOUND,
        );
      if (!['DRAFT', 'READY'].includes(purchaseReturn.status)) {
        throw new HttpException(
          'Purchase Return COMPLETED tidak dapat dibatalkan.',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (purchaseReturn.status === 'READY') {
        const now = new Date();
        for (const detail of purchaseReturn.details) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RETURN_FIFO:${detail.fifoLayerId.toString()}`}))`;
          const layer = await tx.fifoLayer.findUnique({
            where: { fifoLayerId: detail.fifoLayerId },
          });
          if (!layer)
            throw new HttpException(
              'Exact FIFO tidak ditemukan.',
              HttpStatus.CONFLICT,
            );
          const movement = await tx.inventoryMovement.create({
            data: {
              movementNumber: await generateInventoryMovementNumber(
                tx,
                'IN',
                now,
              ),
              productUnitId: layer.productUnitId,
              direction: 'IN',
              quantity: detail.baseQuantity,
              movementType: 'PURCHASE_RETURN_CANCEL',
              originType: 'PURCHASE_RETURN_DETAIL',
              originId: detail.purchaseReturnDetailId,
              originNumber: purchaseReturn.purchaseReturnNumber,
              movementDate: now,
              createdBy: userId,
            },
          });
          const fifoTransaction = await tx.fifoLayerTransaction.create({
            data: {
              fifoLayerId: layer.fifoLayerId,
              inventoryMovementId: movement.inventoryMovementId,
              quantity: detail.baseQuantity,
              direction: 'IN',
              unitCost: detail.fifoUnitCost,
              totalCost: detail.inventoryCostSubtotal,
              quantityBefore: layer.remainingQty,
              quantityAfter: layer.remainingQty.add(detail.baseQuantity),
              createdBy: userId,
            },
          });
          const updatedLayer = await tx.fifoLayer.update({
            where: { fifoLayerId: layer.fifoLayerId },
            data: {
              remainingQty: { increment: detail.baseQuantity },
              remainingCost: { increment: detail.inventoryCostSubtotal },
            },
          });
          const stock = await tx.inventoryStock.findFirst({
            where: { productUnitId: layer.productUnitId },
          });
          if (!stock)
            throw new HttpException(
              'Inventory stock tidak ditemukan.',
              HttpStatus.CONFLICT,
            );
          const updatedStock = await tx.inventoryStock.update({
            where: { inventoryStockId: stock.inventoryStockId },
            data: {
              actualQty: { increment: detail.baseQuantity },
              availableQty: { increment: detail.baseQuantity },
            },
          });
          await writeAuditLog(tx, {
            userId,
            transactionId,
            module: 'INVENTORY',
            operation: AUDIT_OPERATIONS.CREATE,
            entityType: 'INVENTORY_MOVEMENT',
            entityId: movement.inventoryMovementId,
            entityNumber: purchaseReturn.purchaseReturnNumber,
            source: 'Created via Purchase Return Cancellation',
            changedFields: changedFields(null, movement, [
              'movementNumber',
              'productUnitId',
              'direction',
              'quantity',
              'movementType',
              'originType',
              'originId',
              'movementDate',
            ]),
          });
          await writeAuditLog(tx, {
            userId,
            transactionId,
            module: 'FIFO',
            operation: AUDIT_OPERATIONS.CREATE,
            entityType: 'FIFO_LAYER_TRANSACTION',
            entityId: fifoTransaction.fifoLayerTransactionId,
            entityNumber: layer.fifoLayerNumber,
            source: 'Created via Purchase Return Cancellation',
            changedFields: changedFields(null, fifoTransaction, [
              'fifoLayerId',
              'inventoryMovementId',
              'quantity',
              'direction',
              'unitCost',
              'totalCost',
              'quantityBefore',
              'quantityAfter',
            ]),
          });
          await writeAuditLog(tx, {
            userId,
            transactionId,
            module: 'FIFO',
            operation: AUDIT_OPERATIONS.UPDATE,
            entityType: 'FIFO_LAYER',
            entityId: layer.fifoLayerId,
            entityNumber: layer.fifoLayerNumber,
            source: 'Updated via Purchase Return Cancellation',
            changedFields: changedFields(layer, updatedLayer, [
              'remainingQty',
              'remainingCost',
            ]),
          });
          await writeAuditLog(tx, {
            userId,
            transactionId,
            module: 'INVENTORY',
            operation: AUDIT_OPERATIONS.UPDATE,
            entityType: 'INVENTORY_STOCK',
            entityId: stock.inventoryStockId,
            entityNumber: purchaseReturn.purchaseReturnNumber,
            source: 'Updated via Purchase Return Cancellation',
            changedFields: changedFields(stock, updatedStock, [
              'actualQty',
              'availableQty',
            ]),
          });
        }
      }
      const cancelledReturn = await tx.purchaseReturn.update({
        where: { purchaseReturnId: returnId },
        data: { status: 'CANCELLED', updatedBy: userId },
      });
      await this.log(
        tx,
        returnId,
        purchaseReturn.purchaseReturnNumber,
        userId,
        'CANCEL_RETURN',
        'Membatalkan Purchase Return',
        {
          operation: 'UPDATE',
          before: { status: purchaseReturn.status },
          after: { status: cancelledReturn.status },
        },
        transactionId,
      );
      return { success: true };
    });
  }

  async getInvoiceContext(invoiceId: string) {
    const invoice = await this.prisma.purchaseInvoice.findUnique({
      where: { purchaseInvoiceId: BigInt(invoiceId) },
      include: {
        supplier: { select: { supplierName: true } },
        details: {
          include: {
            productUnit: {
              include: {
                unit: true,
                product: {
                  include: { productUnits: { include: { unit: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!invoice || invoice.status !== 'COMPLETED')
      throw new HttpException(
        'PI COMPLETED tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    const items = [];
    for (const detail of invoice.details) {
      const parent = detail.productUnit.product.productUnits.find(
        (unit) => unit.isParent,
      );
      if (!parent) continue;
      const layer = await this.prisma.fifoLayer.findFirst({
        where: {
          originType: 'PURCHASE',
          originId: detail.purchaseInvoiceDetailId,
          productUnitId: parent.productUnitId,
        },
      });
      if (!layer) continue;
      const returned = await this.prisma.purchaseReturnDetail.aggregate({
        where: {
          purchaseInvoiceDetailId: detail.purchaseInvoiceDetailId,
          purchaseReturn: { status: { in: [...ACTIVE_RETURN_STATUSES] } },
        },
        _sum: { baseQuantity: true },
      });
      const purchasedBase = toBaseQuantity(
        detail.quantity,
        detail.productUnit.conversionFactor,
        parent.conversionFactor,
      );
      const returnedBase = returned._sum.baseQuantity ?? new Prisma.Decimal(0);
      const stock = await this.prisma.inventoryStock.findFirst({
        where: { productUnitId: parent.productUnitId },
      });
      const maxBase = Prisma.Decimal.min(
        purchasedBase.sub(returnedBase),
        layer.remainingQty,
        stock?.availableQty ?? 0,
      );
      const baseCost = effectiveRemainingUnitCost(
        layer.remainingCost,
        layer.remainingQty,
        layer.originalCost,
        layer.originalQty,
      );
      items.push({
        purchaseInvoiceDetailId: detail.purchaseInvoiceDetailId.toString(),
        originalProductUnitId: detail.productUnitId.toString(),
        productName: detail.productUnit.product.productName,
        purchasedQty: Number(detail.quantity),
        purchasedUnitName: detail.productUnit.unit.unitName,
        returnedBaseQty: Number(returnedBase),
        maxBaseQty: Number(Prisma.Decimal.max(maxBase, 0)),
        fifoBaseUnitCost: Number(baseCost),
        units: detail.productUnit.product.productUnits
          .filter((unit) => unit.isActive)
          .map((unit) => ({
            productUnitId: unit.productUnitId.toString(),
            unitName: unit.unit.unitName,
            conversionFactor: Number(
              unit.conversionFactor.div(parent.conversionFactor),
            ),
            defaultReturnUnitCost: Number(
              baseCost
                .mul(unit.conversionFactor)
                .div(parent.conversionFactor)
                .toDecimalPlaces(2),
            ),
          })),
      });
    }
    return {
      purchaseInvoiceId: invoice.purchaseInvoiceId.toString(),
      purchaseInvoiceNumber: invoice.purchaseInvoiceNumber,
      supplierId: invoice.supplierId.toString(),
      supplierName: invoice.supplier.supplierName,
      invoiceDate: invoice.invoiceDate,
      outstandingAmount: Number(invoice.outstandingAmount),
      items,
    };
  }

  async findByInvoice(invoiceId: string) {
    const rows = await this.prisma.purchaseReturn.findMany({
      where: {
        purchaseInvoiceId: BigInt(invoiceId),
        status: { not: 'CANCELLED' },
      },
      orderBy: { createdAt: 'desc' },
      include: PURCHASE_RETURN_FULL_INCLUDE,
    });
    return rows.map((row) => this.serialize(row));
  }

  async getCompletionOptions(id: string) {
    const purchaseReturn = await this.prisma.purchaseReturn.findUnique({
      where: { purchaseReturnId: BigInt(id) },
      select: { purchaseInvoiceId: true, supplierId: true },
    });
    if (!purchaseReturn)
      throw new HttpException(
        'Purchase Return tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    const invoices = await this.prisma.purchaseInvoice.findMany({
      where: {
        supplierId: purchaseReturn.supplierId,
        status: 'COMPLETED',
        purchaseInvoiceId: { not: purchaseReturn.purchaseInvoiceId },
      },
      orderBy: { invoiceDate: 'desc' },
      take: 100,
      select: {
        purchaseInvoiceId: true,
        purchaseInvoiceNumber: true,
        invoiceDate: true,
        invoiceTotal: true,
      },
    });
    return invoices.map((invoice) => ({
      purchaseInvoiceId: invoice.purchaseInvoiceId.toString(),
      purchaseInvoiceNumber: invoice.purchaseInvoiceNumber,
      invoiceDate: invoice.invoiceDate,
      invoiceTotal: Number(invoice.invoiceTotal),
    }));
  }

  async findById(id: string) {
    const row = await this.prisma.purchaseReturn.findUnique({
      where: { purchaseReturnId: BigInt(id) },
      include: PURCHASE_RETURN_FULL_INCLUDE,
    });
    if (!row || row.status === 'CANCELLED')
      throw new HttpException(
        'Purchase Return tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    return this.serialize(row);
  }

  private async findByIdInTransaction(
    tx: Prisma.TransactionClient,
    id: bigint,
  ) {
    const row = await tx.purchaseReturn.findUnique({
      where: { purchaseReturnId: id },
      include: PURCHASE_RETURN_FULL_INCLUDE,
    });
    if (!row || row.status === 'CANCELLED') {
      throw new HttpException(
        'Purchase Return tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.serialize(row);
  }

  private serialize(row: PurchaseReturnFull) {
    return {
      ...row,
      purchaseReturnId: row.purchaseReturnId.toString(),
      purchaseInvoiceId: row.purchaseInvoiceId.toString(),
      supplierId: row.supplierId.toString(),
      financialAccountId: row.financialAccountId?.toString() ?? null,
      appliedPurchaseInvoiceId:
        row.appliedPurchaseInvoiceId?.toString() ?? null,
      createdBy: row.createdBy.toString(),
      updatedBy: row.updatedBy?.toString() ?? null,
      returnTotal: Number(row.returnTotal),
      inventoryCostTotal: Number(row.inventoryCostTotal),
      supplierName: row.supplier?.supplierName,
      purchaseInvoiceNumber: row.purchaseInvoice?.purchaseInvoiceNumber,
      appliedPurchaseInvoiceNumber:
        row.appliedPurchaseInvoice?.purchaseInvoiceNumber,
      financialAccountName: row.financialAccount?.accountName,
      details: row.details.map((detail) => ({
        ...detail,
        purchaseReturnDetailId: detail.purchaseReturnDetailId.toString(),
        purchaseReturnId: detail.purchaseReturnId.toString(),
        purchaseInvoiceDetailId: detail.purchaseInvoiceDetailId.toString(),
        productUnitId: detail.productUnitId.toString(),
        fifoLayerId: detail.fifoLayerId.toString(),
        quantity: Number(detail.quantity),
        baseQuantity: Number(detail.baseQuantity),
        unitCost: Number(detail.unitCost),
        fifoUnitCost: Number(detail.fifoUnitCost),
        inventoryCostSubtotal: Number(detail.inventoryCostSubtotal),
        subtotal: Number(detail.subtotal),
        productName: detail.productUnit.product.productName,
        unitName: detail.productUnit.unit.unitName,
      })),
    };
  }

  private async lockReturn(tx: Prisma.TransactionClient, id: bigint) {
    await tx.$queryRaw`SELECT purchase_return_id FROM purchase_return WHERE purchase_return_id = ${id} FOR UPDATE`;
  }

  private async log(
    tx: Prisma.TransactionClient,
    id: bigint,
    number: string,
    userId: bigint,
    action: string,
    description: string,
    auditChanges: {
      operation: string;
      before: Record<string, unknown> | null;
      after: Record<string, unknown> | null;
    },
    transactionId = createAuditTransactionId(),
  ) {
    const now = new Date();
    await tx.activityLog.create({
      data: {
        userId,
        activityType:
          action === 'CREATE_RETURN'
            ? ACTIVITY_TYPES.CREATE
            : ACTIVITY_TYPES.UPDATE,
        module: 'PURCHASE',
        entityType: 'PURCHASE_RETURN',
        entityId: id,
        entityNumber: number,
        description,
        createdAt: now,
      },
    });
    await tx.auditLog.create({
      data: {
        userId,
        action:
          action === 'CREATE_RETURN'
            ? AUDIT_OPERATIONS.CREATE
            : AUDIT_OPERATIONS.UPDATE,
        transactionId,
        module: 'PURCHASE',
        source:
          action === 'CREATE_RETURN'
            ? 'Created via Purchase Return'
            : 'Updated via Purchase Return',
        entityType: 'PURCHASE_RETURN',
        entityId: id,
        entityNumber: number,
        changedFields: changedFields(auditChanges.before, auditChanges.after),
        createdAt: now,
      },
    });
  }
}
