import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { postJournalEntry } from '../../common/financial/financial-posting.js';
import { generateBusinessDocumentNumber } from '../../common/financial/transaction-number.utils.js';
import {
  ACTIVITY_TYPES,
  AUDIT_OPERATIONS,
  changedFields,
  createAuditTransactionId,
  writeActivityLog,
  writeAuditLog,
} from '../../common/logging/business-logger.js';
import { PrismaService } from '../../database/prisma.service.js';
import { generateInventoryMovementNumber } from '../inventory/inventory-movement-number.utils.js';
import {
  generateFifoLayerNumber,
  recordInitialFifoIn,
} from '../purchasing/fifo-ledger.utils.js';
import type {
  CreateCustomerOpeningBalanceDto,
  CreateSupplierOpeningBalanceDto,
  OpeningBalanceCatalogQueryDto,
  SaveInventoryOpeningBalanceDto,
} from './dto/opening-balance.dto.js';
import { calculateInventoryOpeningAmounts } from './opening-balance.rules.js';

const ZERO = new Prisma.Decimal(0);

function apiValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Prisma.Decimal) return Number(value);
  if (Array.isArray(value)) return value.map(apiValue);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        apiValue(item),
      ]),
    );
  }
  return value;
}

function dateOnly(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function combinedNote(referenceNumber?: string, note?: string) {
  const parts = [
    referenceNumber?.trim() ? `Referensi lama: ${referenceNumber.trim()}` : '',
    note?.trim() ?? '',
  ].filter(Boolean);
  return parts.join(' | ') || undefined;
}

@Injectable()
export class OpeningBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  async createCustomer(actorId: bigint, dto: CreateCustomerOpeningBalanceDto) {
    const customerId = BigInt(dto.customerId);
    const amount = new Prisma.Decimal(dto.amount);
    const transactionId = createAuditTransactionId();
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`OPENING_AR:${customerId.toString()}`}))`;
      const customer = await tx.customer.findFirst({
        where: { customerId, isActive: true },
      });
      if (!customer) {
        throw new HttpException(
          'Customer tidak tersedia atau tidak aktif.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      const existing = await tx.salesInvoice.findFirst({
        where: {
          customerId,
          documentType: 'OPENING_BALANCE',
          status: { not: 'CANCELLED' },
        },
        select: { salesInvoiceNumber: true },
      });
      if (existing) {
        throw new HttpException(
          `Saldo awal customer sudah tercatat pada ${existing.salesInvoiceNumber}.`,
          HttpStatus.CONFLICT,
        );
      }
      const date = dateOnly(dto.openingBalanceDate);
      const note = combinedNote(dto.referenceNumber, dto.note);
      const invoice = await tx.salesInvoice.create({
        data: {
          salesInvoiceNumber: await generateBusinessDocumentNumber(
            tx,
            'OB-AR',
            date,
          ),
          customerId,
          partyType: 'CUSTOMER',
          customerName: customer.customerName,
          salesChannel: 'MANUAL',
          paymentType: 'CREDIT',
          invoiceDate: date,
          dueDate: dto.dueDate ? dateOnly(dto.dueDate) : undefined,
          invoiceTotal: amount,
          discountAmount: ZERO,
          itemDiscountTotal: ZERO,
          statusPayment: 'UNPAID',
          paidAmount: ZERO,
          outstandingAmount: amount,
          status: 'COMPLETED',
          documentType: 'OPENING_BALANCE',
          note,
          approvedAt: new Date(),
          approvedBy: actorId,
          createdBy: actorId,
        },
      });
      await tx.customerFinancialSummary.upsert({
        where: { customerId },
        create: {
          customerId,
          outstandingAmount: amount,
          currentAmount: amount,
        },
        update: {
          outstandingAmount: { increment: amount },
          currentAmount: { increment: amount },
        },
      });
      await tx.customerAccountTransaction.create({
        data: {
          transactionNumber: await generateBusinessDocumentNumber(
            tx,
            'AR',
            date,
          ),
          customerId,
          transactionType: 'OPENING_BALANCE',
          direction: 'IN',
          amount,
          referenceType: 'SALES_INVOICE',
          referenceId: invoice.salesInvoiceId,
          transactionDate: date,
          dueDate: invoice.dueDate,
          note,
          createdBy: actorId,
        },
      });
      await postJournalEntry(tx, {
        postingKey: `OPENING_BALANCE:AR:${invoice.salesInvoiceId}`,
        transactionDate: date,
        description: `Saldo awal piutang ${customer.customerName}`,
        sourceType: 'CUSTOMER_OPENING_BALANCE',
        sourceId: invoice.salesInvoiceId,
        sourceNumber: invoice.salesInvoiceNumber,
        createdBy: actorId,
        lines: [
          { chartAccountCode: '1201', debitAmount: amount },
          { chartAccountCode: '3901', creditAmount: amount },
        ],
      });
      await this.logHeader(
        tx,
        actorId,
        transactionId,
        'SALES',
        'CUSTOMER_OPENING_BALANCE',
        invoice.salesInvoiceId,
        invoice.salesInvoiceNumber,
        invoice,
      );
      return invoice;
    });
    return apiValue(result);
  }

  async createSupplier(actorId: bigint, dto: CreateSupplierOpeningBalanceDto) {
    const supplierId = BigInt(dto.supplierId);
    const amount = new Prisma.Decimal(dto.amount);
    const transactionId = createAuditTransactionId();
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`OPENING_AP:${supplierId.toString()}`}))`;
      const supplier = await tx.supplier.findFirst({
        where: { supplierId, isActive: true },
      });
      if (!supplier) {
        throw new HttpException(
          'Supplier tidak tersedia atau tidak aktif.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      const existing = await tx.purchaseInvoice.findFirst({
        where: {
          supplierId,
          documentType: 'OPENING_BALANCE',
          status: { not: 'CANCELLED' },
        },
        select: { purchaseInvoiceNumber: true },
      });
      if (existing) {
        throw new HttpException(
          `Saldo awal supplier sudah tercatat pada ${existing.purchaseInvoiceNumber}.`,
          HttpStatus.CONFLICT,
        );
      }
      const date = dateOnly(dto.openingBalanceDate);
      const note = combinedNote(dto.referenceNumber, dto.note);
      const invoice = await tx.purchaseInvoice.create({
        data: {
          purchaseInvoiceNumber: await generateBusinessDocumentNumber(
            tx,
            'OB-AP',
            date,
          ),
          supplierId,
          invoiceDate: date,
          dueDate: dto.dueDate ? dateOnly(dto.dueDate) : undefined,
          invoiceTotal: amount,
          discountAmount: ZERO,
          statusPayment: 'UNPAID',
          paidAmount: ZERO,
          outstandingAmount: amount,
          status: 'COMPLETED',
          documentType: 'OPENING_BALANCE',
          note,
          createdBy: actorId,
        },
      });
      await tx.supplierFinancialSummary.upsert({
        where: { supplierId },
        create: {
          supplierId,
          outstandingAmount: amount,
          currentAmount: amount,
        },
        update: {
          outstandingAmount: { increment: amount },
          currentAmount: { increment: amount },
        },
      });
      await tx.supplierAccountTransaction.create({
        data: {
          transactionNumber: await generateBusinessDocumentNumber(
            tx,
            'AP',
            date,
          ),
          supplierId,
          transactionType: 'OPENING_BALANCE',
          direction: 'IN',
          amount,
          referenceType: 'PURCHASE_INVOICE',
          referenceId: invoice.purchaseInvoiceId,
          transactionDate: date,
          dueDate: invoice.dueDate,
          note,
          createdBy: actorId,
        },
      });
      await postJournalEntry(tx, {
        postingKey: `OPENING_BALANCE:AP:${invoice.purchaseInvoiceId}`,
        transactionDate: date,
        description: `Saldo awal hutang ${supplier.supplierName}`,
        sourceType: 'SUPPLIER_OPENING_BALANCE',
        sourceId: invoice.purchaseInvoiceId,
        sourceNumber: invoice.purchaseInvoiceNumber,
        createdBy: actorId,
        lines: [
          { chartAccountCode: '3901', debitAmount: amount },
          { chartAccountCode: '2101', creditAmount: amount },
        ],
      });
      await this.logHeader(
        tx,
        actorId,
        transactionId,
        'PURCHASE',
        'SUPPLIER_OPENING_BALANCE',
        invoice.purchaseInvoiceId,
        invoice.purchaseInvoiceNumber,
        invoice,
      );
      return invoice;
    });
    return apiValue(result);
  }

  async inventoryCatalog(query: OpeningBalanceCatalogQueryDto) {
    const search = query.search?.trim();
    const baseWhere: Prisma.ProductWhereInput = {
      isActive: true,
      ...(search
        ? { productName: { contains: search, mode: 'insensitive' } }
        : {}),
    };
    const hasInventoryHistory: Prisma.ProductWhereInput = {
      OR: [
        { productUnits: { some: { fifoLayers: { some: {} } } } },
        { productUnits: { some: { inventoryMovements: { some: {} } } } },
        {
          productUnits: {
            some: {
              inventoryStocks: {
                some: {
                  OR: [
                    { actualQty: { not: ZERO } },
                    { availableQty: { not: ZERO } },
                    { packedQty: { not: ZERO } },
                  ],
                },
              },
            },
          },
        },
      ],
    };
    const scope = query.scope ?? 'ELIGIBLE';
    const where: Prisma.ProductWhereInput = {
      AND: [
        baseWhere,
        scope === 'HISTORY'
          ? hasInventoryHistory
          : { NOT: hasInventoryHistory },
      ],
    };
    const total = await this.prisma.product.count({ where });
    const all = query.limit === 'ALL';
    const limit = all ? total || 1 : Number(query.limit ?? 50);
    const page = all ? 1 : Number(query.page ?? 1);
    const products = await this.prisma.product.findMany({
      where,
      orderBy: [{ productName: 'asc' }, { productId: 'asc' }],
      skip: all ? undefined : (page - 1) * limit,
      take: all ? undefined : limit,
      include: {
        category: true,
        brand: true,
        productUnits: {
          where: { isActive: true },
          orderBy: [{ displayOrder: 'asc' }, { productUnitId: 'asc' }],
          include: {
            unit: true,
            guestPrices: { orderBy: { guestPriceId: 'desc' }, take: 1 },
            inventoryStocks: true,
            _count: { select: { fifoLayers: true, inventoryMovements: true } },
          },
        },
      },
    });
    return apiValue({
      data: products.map((product) => {
        const parent = product.productUnits.find((unit) => unit.isParent);
        const stock = parent?.inventoryStocks[0];
        const hasHistory = product.productUnits.some(
          (unit) =>
            unit._count.fifoLayers > 0 ||
            unit._count.inventoryMovements > 0 ||
            unit.inventoryStocks.some(
              (item) =>
                !item.actualQty.equals(ZERO) ||
                !item.availableQty.equals(ZERO) ||
                !item.packedQty.equals(ZERO),
            ),
        );
        return {
          productId: product.productId,
          productName: product.productName,
          categoryName: product.category.categoryName,
          brandName: product.brand?.brandName ?? null,
          parentProductUnitId: parent?.productUnitId ?? null,
          parentUnitName: parent?.unit.unitName ?? null,
          currentStock: stock?.actualQty ?? ZERO,
          hasHistory,
          units: product.productUnits.map((item) => ({
            productUnitId: item.productUnitId,
            unitName: item.unit.unitName,
            conversionFactor: item.conversionFactor,
            isParent: item.isParent,
            guestSuggestedPrice: item.guestPrices[0]?.suggestedPrice ?? null,
          })),
        };
      }),
      meta: {
        currentPage: page,
        pageSize: all ? total : limit,
        totalData: total,
        totalPage: all ? 1 : Math.max(1, Math.ceil(total / limit)),
      },
    });
  }

  async currentInventoryDraft(actorId: bigint) {
    const draft = await this.prisma.inventoryOpeningBalance.findFirst({
      where: { createdBy: actorId, status: 'DRAFT' },
      orderBy: { updatedAt: 'desc' },
      include: { details: { orderBy: { lineNumber: 'asc' } } },
    });
    return apiValue(draft);
  }

  async saveInventoryDraft(
    actorId: bigint,
    dto: SaveInventoryOpeningBalanceDto,
  ) {
    const transactionId = createAuditTransactionId();
    const result = await this.prisma.$transaction(async (tx) => {
      const normalized = await this.normalizeInventoryLines(tx, dto);
      let draft = await tx.inventoryOpeningBalance.findFirst({
        where: { createdBy: actorId, status: 'DRAFT' },
        orderBy: { updatedAt: 'desc' },
      });
      if (!draft) {
        const date = dateOnly(dto.openingBalanceDate);
        draft = await tx.inventoryOpeningBalance.create({
          data: {
            openingBalanceNumber: await generateBusinessDocumentNumber(
              tx,
              'OB-INV',
              date,
            ),
            openingBalanceDate: date,
            note: dto.note?.trim() || undefined,
            createdBy: actorId,
          },
        });
      } else {
        draft = await tx.inventoryOpeningBalance.update({
          where: { inventoryOpeningBalanceId: draft.inventoryOpeningBalanceId },
          data: {
            openingBalanceDate: dateOnly(dto.openingBalanceDate),
            note: dto.note?.trim() || null,
            updatedBy: actorId,
          },
        });
        await tx.inventoryOpeningBalanceDetail.deleteMany({
          where: { inventoryOpeningBalanceId: draft.inventoryOpeningBalanceId },
        });
      }
      if (normalized.length) {
        await tx.inventoryOpeningBalanceDetail.createMany({
          data: normalized.map((line) => ({
            inventoryOpeningBalanceId: draft.inventoryOpeningBalanceId,
            ...line,
          })),
        });
      }
      await writeActivityLog(tx, {
        userId: actorId,
        activityType: ACTIVITY_TYPES.UPDATE,
        module: 'FIFO',
        entityType: 'INVENTORY_OPENING_BALANCE',
        entityId: draft.inventoryOpeningBalanceId,
        entityNumber: draft.openingBalanceNumber,
        description: `Draft saldo awal persediaan disimpan (${normalized.length} produk terisi).`,
      });
      await writeAuditLog(tx, {
        userId: actorId,
        transactionId,
        module: 'FIFO',
        operation: AUDIT_OPERATIONS.UPDATE,
        entityType: 'INVENTORY_OPENING_BALANCE',
        entityId: draft.inventoryOpeningBalanceId,
        entityNumber: draft.openingBalanceNumber,
        source: 'Opening Balance Inventory Draft',
        changedFields: changedFields(null, draft),
      });
      return tx.inventoryOpeningBalance.findUnique({
        where: { inventoryOpeningBalanceId: draft.inventoryOpeningBalanceId },
        include: { details: { orderBy: { lineNumber: 'asc' } } },
      });
    });
    return apiValue(result);
  }

  async completeInventory(actorId: bigint, id: bigint) {
    const transactionId = createAuditTransactionId();
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT inventory_opening_balance_id FROM inventory_opening_balance WHERE inventory_opening_balance_id = ${id} FOR UPDATE`;
        const document = await tx.inventoryOpeningBalance.findUnique({
          where: { inventoryOpeningBalanceId: id },
          include: { details: { orderBy: { lineNumber: 'asc' } } },
        });
        if (!document)
          throw new HttpException(
            'Draft saldo awal tidak ditemukan.',
            HttpStatus.NOT_FOUND,
          );
        if (document.status !== 'DRAFT')
          throw new HttpException(
            'Hanya draft saldo awal yang dapat diselesaikan.',
            HttpStatus.CONFLICT,
          );
        if (!document.details.length)
          throw new HttpException(
            'Minimal satu produk atau harga guest harus diisi.',
            HttpStatus.UNPROCESSABLE_ENTITY,
          );

        let inventoryValue = ZERO;
        for (const line of document.details) {
          if (line.guestSuggestedPrice !== null) {
            const existingPrice = await tx.guestSuggestedPrice.findFirst({
              where: { productUnitId: line.selectedProductUnitId },
              orderBy: { guestPriceId: 'desc' },
            });
            if (existingPrice) {
              await tx.guestSuggestedPrice.update({
                where: { guestPriceId: existingPrice.guestPriceId },
                data: {
                  suggestedPrice: line.guestSuggestedPrice,
                  updatedBy: actorId,
                },
              });
            } else {
              await tx.guestSuggestedPrice.create({
                data: {
                  productUnitId: line.selectedProductUnitId,
                  suggestedPrice: line.guestSuggestedPrice,
                  createdBy: actorId,
                },
              });
            }
          }
          if (line.inputQuantity.lessThanOrEqualTo(ZERO)) continue;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`INVENTORY_STOCK:${line.parentProductUnitId.toString()}`}))`;
          const [stock, fifoCount, movementCount] = await Promise.all([
            tx.inventoryStock.findUnique({
              where: { productUnitId: line.parentProductUnitId },
            }),
            tx.fifoLayer.count({
              where: { productUnit: { productId: line.productId } },
            }),
            tx.inventoryMovement.count({
              where: { productUnit: { productId: line.productId } },
            }),
          ]);
          if (
            fifoCount > 0 ||
            movementCount > 0 ||
            (stock && !stock.actualQty.equals(ZERO))
          ) {
            throw new HttpException(
              'Salah satu produk sudah memiliki histori stok. Gunakan Stock Adjustment untuk koreksi.',
              HttpStatus.CONFLICT,
            );
          }
          const movement = await tx.inventoryMovement.create({
            data: {
              movementNumber: await generateInventoryMovementNumber(
                tx,
                'IN',
                document.openingBalanceDate,
              ),
              productUnitId: line.parentProductUnitId,
              direction: 'IN',
              quantity: line.parentQuantity,
              movementType: 'OPENING_BALANCE',
              originType: 'OPENING_BALANCE',
              originId: document.inventoryOpeningBalanceId,
              originNumber: document.openingBalanceNumber,
              movementDate: document.openingBalanceDate,
              note: document.note,
              createdBy: actorId,
            },
          });
          const layer = await tx.fifoLayer.create({
            data: {
              fifoLayerNumber: await generateFifoLayerNumber(
                tx,
                document.openingBalanceDate,
              ),
              productUnitId: line.parentProductUnitId,
              originType: 'OPENING_BALANCE',
              originInventoryMovementId: movement.inventoryMovementId,
              originId: document.inventoryOpeningBalanceId,
              originalQty: line.parentQuantity,
              remainingQty: line.parentQuantity,
              unitCost: line.parentUnitCost.toDecimalPlaces(2),
              originalCost: line.totalCost,
              remainingCost: line.totalCost,
              createdBy: actorId,
            },
          });
          await recordInitialFifoIn(tx, {
            fifoLayerId: layer.fifoLayerId,
            inventoryMovementId: movement.inventoryMovementId,
            quantity: line.parentQuantity,
            unitCost: line.parentUnitCost.toDecimalPlaces(2),
            totalCost: line.totalCost,
            createdBy: actorId,
          });
          await tx.inventoryStock.upsert({
            where: { productUnitId: line.parentProductUnitId },
            create: {
              productId: line.productId,
              productUnitId: line.parentProductUnitId,
              actualQty: line.parentQuantity,
              availableQty: line.parentQuantity,
              packedQty: ZERO,
            },
            update: {
              actualQty: { increment: line.parentQuantity },
              availableQty: { increment: line.parentQuantity },
            },
          });
          await tx.inventoryOpeningBalanceDetail.update({
            where: {
              inventoryOpeningBalanceDetailId:
                line.inventoryOpeningBalanceDetailId,
            },
            data: { inventoryMovementId: movement.inventoryMovementId },
          });
          inventoryValue = inventoryValue.add(line.totalCost);
        }
        if (inventoryValue.greaterThan(ZERO)) {
          await postJournalEntry(tx, {
            postingKey: `OPENING_BALANCE:INVENTORY:${document.inventoryOpeningBalanceId}`,
            transactionDate: document.openingBalanceDate,
            description: `Saldo awal persediaan ${document.openingBalanceNumber}`,
            sourceType: 'INVENTORY_OPENING_BALANCE',
            sourceId: document.inventoryOpeningBalanceId,
            sourceNumber: document.openingBalanceNumber,
            createdBy: actorId,
            lines: [
              { chartAccountCode: '1301', debitAmount: inventoryValue },
              { chartAccountCode: '3901', creditAmount: inventoryValue },
            ],
          });
        }
        const completed = await tx.inventoryOpeningBalance.update({
          where: { inventoryOpeningBalanceId: id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            completedBy: actorId,
            updatedBy: actorId,
          },
        });
        await writeActivityLog(tx, {
          userId: actorId,
          activityType: ACTIVITY_TYPES.UPDATE,
          module: 'FIFO',
          entityType: 'INVENTORY_OPENING_BALANCE',
          entityId: id,
          entityNumber: document.openingBalanceNumber,
          description: `Saldo awal persediaan ditetapkan senilai Rp ${inventoryValue.toFixed(2)}.`,
        });
        await writeAuditLog(tx, {
          userId: actorId,
          transactionId,
          module: 'FIFO',
          operation: AUDIT_OPERATIONS.UPDATE,
          entityType: 'INVENTORY_OPENING_BALANCE',
          entityId: id,
          entityNumber: document.openingBalanceNumber,
          source: 'Complete Inventory Opening Balance',
          changedFields: changedFields(document, completed, [
            'status',
            'completedAt',
            'completedBy',
          ]),
        });
        return { ...completed, inventoryValue };
      },
      { timeout: 120000 },
    );
    return apiValue(result);
  }

  async inventoryDetail(id: bigint) {
    const result = await this.prisma.inventoryOpeningBalance.findUnique({
      where: { inventoryOpeningBalanceId: id },
      include: {
        createdByUser: { select: { fullName: true } },
        completedByUser: { select: { fullName: true } },
        details: {
          orderBy: { lineNumber: 'asc' },
          include: {
            product: true,
            selectedUnit: { include: { unit: true } },
            parentUnit: { include: { unit: true } },
          },
        },
      },
    });
    if (!result)
      throw new HttpException(
        'Dokumen saldo awal tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    return apiValue(result);
  }

  private async normalizeInventoryLines(
    tx: Prisma.TransactionClient,
    dto: SaveInventoryOpeningBalanceDto,
  ) {
    const meaningfulLines = dto.lines.filter(
      (line) =>
        line.inputQuantity > 0 || line.guestSuggestedPrice !== undefined,
    );
    const ids = [
      ...new Set(
        meaningfulLines.map((line) => BigInt(line.selectedProductUnitId)),
      ),
    ];
    const units = await tx.productUnit.findMany({
      where: { productUnitId: { in: ids }, isActive: true },
      include: { product: true },
    });
    const unitById = new Map(
      units.map((unit) => [unit.productUnitId.toString(), unit]),
    );
    const productIds = [...new Set(units.map((unit) => unit.productId))];
    const parents = await tx.productUnit.findMany({
      where: { productId: { in: productIds }, isParent: true, isActive: true },
    });
    const parentByProduct = new Map(
      parents.map((unit) => [unit.productId.toString(), unit]),
    );
    const seen = new Set<string>();
    return meaningfulLines.map((line) => {
      const selected = unitById.get(line.selectedProductUnitId);
      const productId = BigInt(line.productId);
      if (
        !selected ||
        selected.productId !== productId ||
        !selected.product.isActive
      ) {
        throw new HttpException(
          'Produk atau unit saldo awal tidak valid.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      if (seen.has(line.productId))
        throw new HttpException(
          'Produk yang sama tidak boleh dicatat dua kali.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      seen.add(line.productId);
      const parent = parentByProduct.get(line.productId);
      if (
        !parent ||
        parent.conversionFactor.lessThanOrEqualTo(ZERO) ||
        selected.conversionFactor.lessThanOrEqualTo(ZERO)
      ) {
        throw new HttpException(
          `Unit parent ${selected.product.productName} belum valid.`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      const quantity = new Prisma.Decimal(line.inputQuantity);
      const inputUnitCost = new Prisma.Decimal(line.inputUnitCost);
      const { parentQuantity, totalCost, parentUnitCost } =
        calculateInventoryOpeningAmounts({
          quantity,
          inputUnitCost,
          selectedConversionFactor: selected.conversionFactor,
          parentConversionFactor: parent.conversionFactor,
        });
      return {
        lineNumber: line.lineNumber,
        productId,
        selectedProductUnitId: selected.productUnitId,
        inputQuantity: quantity,
        parentProductUnitId: parent.productUnitId,
        parentQuantity,
        inputUnitCost,
        parentUnitCost,
        totalCost,
        guestSuggestedPrice:
          line.guestSuggestedPrice === undefined
            ? null
            : new Prisma.Decimal(line.guestSuggestedPrice),
      };
    });
  }

  private async logHeader(
    tx: Prisma.TransactionClient,
    actorId: bigint,
    transactionId: string,
    module: string,
    entityType: string,
    entityId: bigint,
    entityNumber: string,
    entity: Record<string, unknown>,
  ) {
    await writeActivityLog(tx, {
      userId: actorId,
      activityType: ACTIVITY_TYPES.CREATE,
      module,
      entityType,
      entityId,
      entityNumber,
      description: `${entityType === 'CUSTOMER_OPENING_BALANCE' ? 'Saldo awal piutang customer' : 'Saldo awal hutang supplier'} dibuat.`,
    });
    await writeAuditLog(tx, {
      userId: actorId,
      transactionId,
      module,
      operation: AUDIT_OPERATIONS.CREATE,
      entityType,
      entityId,
      entityNumber,
      source: 'Opening Balance',
      changedFields: changedFields(null, entity),
    });
  }
}
