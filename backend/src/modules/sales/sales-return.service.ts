import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { generateBusinessDocumentNumber, generateFinancialAccountTransactionNumber } from '../../common/financial/transaction-number.utils.js';
import { generateInventoryMovementNumber } from '../inventory/inventory-movement-number.utils.js';
import { INVENTORY_MOVEMENT_TYPES, INVENTORY_ORIGIN_TYPES } from '../../common/inventory/inventory-origin.js';
import type { SaveSalesReturnDto } from './dto/sales.dto.js';
import { assertReturnQuantity, resolveReturnSettlement } from './sales-return.rules.js';
import { ACTIVITY_TYPES, AUDIT_OPERATIONS, changedFields, createAuditTransactionId, writeActivityLog, writeAuditLog } from '../../common/logging/business-logger.js';
import { SalesService } from './sales.service.js';

const ZERO = new Prisma.Decimal(0);

@Injectable()
export class SalesReturnService {
  constructor(private readonly prisma: PrismaService, private readonly sales: SalesService) {}

  async context(invoiceId: bigint) {
    const invoice = await this.prisma.salesInvoice.findUnique({
      where: { salesInvoiceId: invoiceId },
      include: {
        customer: true,
        details: {
          include: {
            productUnit: { include: { product: true, unit: true } },
            salesReturnDetails: {
              where: { salesReturn: { status: { not: 'CANCELLED' } } },
              select: { quantity: true, bonusQuantity: true },
            },
          },
        },
        returns: { where: { status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!invoice) throw new HttpException('Sales Invoice tidak ditemukan.', HttpStatus.NOT_FOUND);
    if (invoice.status !== 'COMPLETED') throw new HttpException('Hanya Sales Invoice COMPLETED yang dapat diretur.', HttpStatus.CONFLICT);
    return {
      salesInvoiceId: invoice.salesInvoiceId.toString(),
      salesInvoiceNumber: invoice.salesInvoiceNumber,
      customerId: invoice.customerId?.toString() ?? null,
      partyType: invoice.partyType,
      customerName: invoice.customerName ?? invoice.customer?.customerName ?? 'Guest',
      outstandingAmount: Number(invoice.outstandingAmount),
      details: invoice.details.map((detail) => {
        const returned = detail.salesReturnDetails.reduce((sum, row) => sum.add(row.quantity), ZERO);
        const returnedBonus = detail.salesReturnDetails.reduce((sum, row) => sum.add(row.bonusQuantity), ZERO);
        return {
          salesInvoiceDetailId: detail.salesInvoiceDetailId.toString(),
          productUnitId: detail.productUnitId.toString(),
          productName: detail.productUnit.product.productName,
          unitName: detail.productUnit.unit.unitName,
          soldQuantity: Number(detail.quantity),
          soldBonusQuantity: Number(detail.bonusQuantity),
          returnableQuantity: Number(detail.quantity.sub(returned)),
          returnableBonusQuantity: Number(detail.bonusQuantity.sub(returnedBonus)),
          unitPrice: Number(detail.unitPrice),
          discountAmount: Number(detail.discountAmount),
          subtotal: Number(detail.subtotal),
        };
      }),
      returns: invoice.returns.map((row) => ({
        salesReturnId: row.salesReturnId.toString(),
        salesReturnNumber: row.salesReturnNumber,
        status: row.status,
        resolutionType: row.resolutionType,
        returnDate: row.returnDate,
        returnTotal: Number(row.returnTotal),
      })),
    };
  }

  async list(page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.salesReturn.count(),
      this.prisma.salesReturn.findMany({
        orderBy: [{ returnDate: 'desc' }, { salesReturnId: 'desc' }],
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        include: { salesInvoice: true, customer: true, _count: { select: { details: true } } },
      }),
    ]);
    return {
      data: rows.map((row) => ({
        salesReturnId: row.salesReturnId.toString(), salesReturnNumber: row.salesReturnNumber,
        salesInvoiceId: row.salesInvoiceId.toString(), salesInvoiceNumber: row.salesInvoice.salesInvoiceNumber,
        customerName: row.customer?.customerName ?? row.salesInvoice.customerName ?? 'Guest',
        returnDate: row.returnDate, returnTotal: Number(row.returnTotal), status: row.status,
        resolutionType: row.resolutionType, refundAmount: Number(row.refundAmount), detailCount: row._count.details,
      })),
      meta: { page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) },
    };
  }

  async find(id: bigint) {
    const row = await this.prisma.salesReturn.findUnique({
      where: { salesReturnId: id },
      include: {
        salesInvoice: true, replacementSalesInvoice: true, customer: true, financialAccount: true,
        createdByUser: true, approvedByUser: true,
        details: { include: { productUnit: { include: { product: true, unit: true } } } },
      },
    });
    if (!row) throw new HttpException('Sales Return tidak ditemukan.', HttpStatus.NOT_FOUND);
    return {
      salesReturnId: row.salesReturnId.toString(), salesReturnNumber: row.salesReturnNumber,
      salesInvoiceId: row.salesInvoiceId.toString(), salesInvoiceNumber: row.salesInvoice.salesInvoiceNumber,
      replacementSalesInvoiceId: row.replacementSalesInvoiceId?.toString() ?? null,
      replacementSalesInvoiceNumber: row.replacementSalesInvoice?.salesInvoiceNumber ?? null,
      customerName: row.customer?.customerName ?? row.salesInvoice.customerName ?? 'Guest',
      returnDate: row.returnDate, returnTotal: Number(row.returnTotal), status: row.status,
      resolutionType: row.resolutionType, receivableOffsetAmount: Number(row.receivableOffsetAmount),
      replacementCreditAmount: Number(row.replacementCreditAmount), refundAmount: Number(row.refundAmount),
      refundAccountName: row.financialAccount?.accountName ?? null, refundPaymentMethod: row.refundPaymentMethod,
      note: row.note, createdByName: row.createdByUser.fullName, approvedAt: row.approvedAt,
      approvedByName: row.approvedByUser?.fullName ?? null,
      details: row.details.map((detail) => ({
        salesReturnDetailId: detail.salesReturnDetailId.toString(), productName: detail.productUnit.product.productName,
        unitName: detail.productUnit.unit.unitName, quantity: Number(detail.quantity),
        bonusQuantity: Number(detail.bonusQuantity), unitPrice: Number(detail.unitPrice),
        subtotal: Number(detail.subtotal), returnCostTotal: Number(detail.returnCostTotal), reason: detail.reason, note: detail.note,
      })),
    };
  }

  async create(actorId: bigint, invoiceId: bigint, dto: SaveSalesReturnDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT sales_invoice_id FROM sales_invoice WHERE sales_invoice_id = ${invoiceId} FOR UPDATE`;
      const invoice = await tx.salesInvoice.findUnique({
        where: { salesInvoiceId: invoiceId },
        include: { details: { include: { productUnit: true } } },
      });
      if (!invoice || invoice.status !== 'COMPLETED') throw new HttpException('Hanya Sales Invoice COMPLETED yang dapat diretur.', HttpStatus.CONFLICT);
      const requested = new Map(dto.items.map((item) => [item.salesInvoiceDetailId, item]));
      const detailIds = invoice.details.map((item) => item.salesInvoiceDetailId);
      const previous = await tx.salesReturnDetail.groupBy({
        by: ['salesInvoiceDetailId'], where: { salesInvoiceDetailId: { in: detailIds }, salesReturn: { status: { not: 'CANCELLED' } } },
        _sum: { quantity: true, bonusQuantity: true },
      });
      const previousMap = new Map(previous.map((row) => [row.salesInvoiceDetailId.toString(), row._sum]));
      const items = invoice.details.flatMap((detail) => {
        const item = requested.get(detail.salesInvoiceDetailId.toString());
        if (!item) return [];
        const quantity = new Prisma.Decimal(item.quantity);
        const bonusQuantity = new Prisma.Decimal(item.bonusQuantity);
        if (quantity.lessThan(0) || bonusQuantity.lessThan(0) || quantity.add(bonusQuantity).equals(0)) return [];
        const old = previousMap.get(detail.salesInvoiceDetailId.toString());
        assertReturnQuantity({ sold: detail.quantity, soldBonus: detail.bonusQuantity,
          previouslyReturned: old?.quantity ?? ZERO, previouslyReturnedBonus: old?.bonusQuantity ?? ZERO,
          requested: quantity, requestedBonus: bonusQuantity });
        const subtotal = detail.quantity.greaterThan(0)
          ? detail.subtotal.mul(quantity).div(detail.quantity).toDecimalPlaces(2)
          : ZERO;
        return [{ detail, item, quantity, bonusQuantity, subtotal }];
      });
      if (!items.length) throw new HttpException('Minimal satu barang harus diretur.', HttpStatus.UNPROCESSABLE_ENTITY);
      const number = await generateBusinessDocumentNumber(tx, 'SR', new Date(dto.returnDate));
      const header = await tx.salesReturn.create({
        data: {
          salesReturnNumber: number, salesInvoiceId: invoiceId, customerId: invoice.customerId,
          returnDate: new Date(dto.returnDate), returnTotal: items.reduce((sum, item) => sum.add(item.subtotal), ZERO),
          status: 'DRAFT', resolutionType: dto.resolutionType, note: dto.note?.trim() || null, createdBy: actorId,
          details: { create: items.map(({ detail, item, quantity, bonusQuantity, subtotal }) => ({
            salesInvoiceDetailId: detail.salesInvoiceDetailId, productUnitId: detail.productUnitId,
            quantity, bonusQuantity, unitPrice: detail.unitPrice, subtotal, reason: item.reason?.trim() || null,
            note: item.note?.trim() || null, createdBy: actorId,
          })) },
        },
      });
      await writeActivityLog(tx, { userId: actorId, activityType: ACTIVITY_TYPES.CREATE, module: 'SALES',
        entityType: 'SALES_RETURN', entityId: header.salesReturnId, entityNumber: number,
        description: `Membuat Sales Return ${number}` });
      await writeAuditLog(tx, { userId: actorId, transactionId: createAuditTransactionId(), module: 'SALES',
        operation: AUDIT_OPERATIONS.CREATE, entityType: 'SALES_RETURN', entityId: header.salesReturnId,
        entityNumber: number, source: 'API', changedFields: changedFields(null, header as unknown as Record<string, unknown>) });
      if (dto.status === 'COMPLETED') await this.completeTx(tx, actorId, header.salesReturnId, dto);
      return { salesReturnId: header.salesReturnId.toString(), salesReturnNumber: number };
    }, { timeout: 30_000 });
  }

  async complete(actorId: bigint, id: bigint, dto: SaveSalesReturnDto) {
    await this.prisma.$transaction(async (tx) => {
      await this.completeTx(tx, actorId, id, dto);
    }, { timeout: 30_000 });
    return this.find(id);
  }

  private async completeTx(tx: Prisma.TransactionClient, actorId: bigint, id: bigint, dto: SaveSalesReturnDto) {
    await tx.$queryRaw`SELECT sales_return_id FROM sales_return WHERE sales_return_id = ${id} FOR UPDATE`;
    const row = await tx.salesReturn.findUnique({
      where: { salesReturnId: id },
      include: { salesInvoice: true, details: { include: { productUnit: true } } },
    });
    if (!row) throw new HttpException('Sales Return tidak ditemukan.', HttpStatus.NOT_FOUND);
    if (row.status === 'COMPLETED') return;
    if (row.status !== 'DRAFT') throw new HttpException('Hanya Sales Return DRAFT yang dapat diselesaikan.', HttpStatus.CONFLICT);
    let totalCost = ZERO;
    for (const detail of row.details) {
      const sourceMovement = await tx.inventoryMovement.findUnique({ where: { salesInvoiceDetailId: detail.salesInvoiceDetailId } });
      if (!sourceMovement) throw new HttpException('Jejak FIFO Sales Invoice tidak ditemukan.', HttpStatus.CONFLICT);
      const restoreQty = detail.quantity.add(detail.bonusQuantity).mul(detail.productUnit.conversionFactor);
      const movement = await tx.inventoryMovement.create({ data: {
        movementNumber: await generateInventoryMovementNumber(tx, 'IN', row.returnDate),
        productUnitId: sourceMovement.productUnitId, direction: 'IN', quantity: restoreQty,
        movementType: INVENTORY_MOVEMENT_TYPES.SALES_RETURN_IN, originType: INVENTORY_ORIGIN_TYPES.SALES_RETURN,
        originId: id, originNumber: row.salesReturnNumber, salesReturnDetailId: detail.salesReturnDetailId,
        movementDate: row.returnDate, note: detail.note, createdBy: actorId,
      } });
      const allocations = await tx.fifoLayerTransaction.findMany({
        where: { inventoryMovementId: sourceMovement.inventoryMovementId, direction: 'OUT' },
        orderBy: { fifoLayerTransactionId: 'desc' }, include: { fifoLayer: true },
      });
      let remaining = restoreQty;
      let detailCost = ZERO;
      for (const allocation of allocations) {
        if (remaining.lessThanOrEqualTo(0)) break;
        const alreadyRestored = await tx.fifoLayerTransaction.aggregate({
          where: { fifoLayerId: allocation.fifoLayerId, direction: 'IN', inventoryMovement: { salesReturnDetail: { salesInvoiceDetailId: detail.salesInvoiceDetailId } } },
          _sum: { quantity: true },
        });
        const capacity = Prisma.Decimal.max(ZERO, allocation.quantity.sub(alreadyRestored._sum.quantity ?? ZERO));
        const take = Prisma.Decimal.min(remaining, capacity);
        if (take.lessThanOrEqualTo(0)) continue;
        await tx.$queryRaw`SELECT fifo_layer_id FROM fifo_layer WHERE fifo_layer_id = ${allocation.fifoLayerId} FOR UPDATE`;
        const layer = await tx.fifoLayer.findUniqueOrThrow({ where: { fifoLayerId: allocation.fifoLayerId } });
        const cost = take.mul(allocation.unitCost).toDecimalPlaces(2);
        await tx.fifoLayer.update({ where: { fifoLayerId: layer.fifoLayerId }, data: { remainingQty: { increment: take }, remainingCost: { increment: cost } } });
        await tx.fifoLayerTransaction.create({ data: {
          fifoLayerId: layer.fifoLayerId, inventoryMovementId: movement.inventoryMovementId, quantity: take,
          direction: 'IN', unitCost: allocation.unitCost, totalCost: cost,
          quantityBefore: layer.remainingQty, quantityAfter: layer.remainingQty.add(take), createdBy: actorId,
        } });
        detailCost = detailCost.add(cost); remaining = remaining.sub(take);
      }
      if (remaining.greaterThan(0)) throw new HttpException('Jumlah retur melebihi alokasi FIFO asli.', HttpStatus.CONFLICT);
      await tx.salesReturnDetail.update({ where: { salesReturnDetailId: detail.salesReturnDetailId }, data: { returnCostTotal: detailCost } });
      totalCost = totalCost.add(detailCost);
      await tx.inventoryStock.update({ where: { productUnitId: sourceMovement.productUnitId }, data: { actualQty: { increment: restoreQty }, availableQty: { increment: restoreQty } } });
    }
    const { receivableOffset: offset, residualCredit: residual } = resolveReturnSettlement(row.returnTotal, row.salesInvoice.outstandingAmount);
    let replacementCredit = ZERO;
    let replacementSalesInvoiceId: bigint | null = null;
    let cashRefund = row.resolutionType === 'REFUND' ? residual : ZERO;
    if (row.resolutionType === 'REPLACEMENT') {
      if (!dto.replacementInvoice) throw new HttpException('Data Sales Invoice barang pengganti wajib diisi.', HttpStatus.UNPROCESSABLE_ENTITY);
      const replacementDto = { ...dto.replacementInvoice, customerId: row.salesInvoice.customerId?.toString(),
        partyType: row.salesInvoice.partyType, customerName: row.salesInvoice.customerName ?? undefined,
        status: 'COMPLETED' as const, salesOrderId: undefined };
      const replacementTotal = await this.sales.quoteInvoiceTx(tx, replacementDto);
      replacementCredit = Prisma.Decimal.min(residual, replacementTotal);
      cashRefund = residual.sub(replacementCredit);
      const replacement = await this.sales.createInvoiceTx(tx, actorId, replacementDto, replacementCredit);
      replacementSalesInvoiceId = BigInt(replacement.salesInvoiceId);
    }
    if (row.customerId && offset.greaterThan(0)) {
      await tx.customerFinancialSummary.update({ where: { customerId: row.customerId }, data: { outstandingAmount: { decrement: offset }, currentAmount: { decrement: offset } } });
      await tx.customerAccountTransaction.create({ data: {
        transactionNumber: await generateBusinessDocumentNumber(tx, 'AR', row.returnDate), customerId: row.customerId,
        transactionType: 'SALES_RETURN', direction: 'OUT', amount: row.returnTotal,
        referenceType: 'SALES_RETURN', referenceId: id, transactionDate: row.returnDate, note: row.note, createdBy: actorId,
      } });
    }
    let financialTransactionId: bigint | null = null;
    if (cashRefund.greaterThan(0)) {
      if (!dto.financialAccountId) throw new HttpException('Akun Kas/Bank wajib dipilih untuk pengembalian uang.', HttpStatus.UNPROCESSABLE_ENTITY);
      const accountId = BigInt(dto.financialAccountId);
      const account = await tx.financialAccount.findUnique({ where: { financialAccountId: accountId } });
      if (!account?.isActive || account.currentBalance.lessThan(cashRefund)) throw new HttpException('Saldo akun pengembalian tidak mencukupi atau akun tidak aktif.', HttpStatus.CONFLICT);
      const method = dto.refundPaymentMethod === 'LAINNYA' ? dto.otherRefundPaymentMethod?.trim() : dto.refundPaymentMethod;
      if (!method) throw new HttpException('Metode pengembalian wajib dipilih.', HttpStatus.UNPROCESSABLE_ENTITY);
      const ft = await tx.financialAccountTransaction.create({ data: {
        transactionNumber: await generateFinancialAccountTransactionNumber(tx, row.returnDate), financialAccountId: accountId,
        transactionType: 'SALES_RETURN_REFUND', paymentMethod: method, direction: 'OUT', amount: cashRefund,
        referenceType: 'SALES_RETURN', referenceId: id, transactionDate: row.returnDate, note: row.note, createdBy: actorId,
      } });
      financialTransactionId = ft.financialAccountTransactionId;
      await tx.financialAccount.update({ where: { financialAccountId: accountId }, data: { currentBalance: { decrement: cashRefund }, updatedBy: actorId, updatedAt: new Date() } });
      if (row.customerId) await tx.customerAccountTransaction.create({ data: {
        transactionNumber: await generateBusinessDocumentNumber(tx, 'AR', row.returnDate), customerId: row.customerId,
        transactionType: 'SALES_RETURN_REFUND', direction: 'IN', amount: cashRefund,
        referenceType: 'SALES_RETURN', referenceId: id, transactionDate: row.returnDate, note: row.note, createdBy: actorId,
      } });
    }
    await tx.salesInvoice.update({ where: { salesInvoiceId: row.salesInvoiceId }, data: {
      outstandingAmount: row.salesInvoice.outstandingAmount.sub(offset),
      statusPayment: row.salesInvoice.outstandingAmount.sub(offset).equals(0) ? 'PAID' : row.salesInvoice.statusPayment,
    } });
    const completed = await tx.salesReturn.update({ where: { salesReturnId: id }, data: {
      status: 'COMPLETED', approvedAt: new Date(), approvedBy: actorId, receivableOffsetAmount: offset,
      replacementSalesInvoiceId,
      replacementCreditAmount: replacementCredit,
      refundAmount: cashRefund,
      financialAccountId: cashRefund.greaterThan(0) ? BigInt(dto.financialAccountId!) : null,
      financialAccountTransactionId: financialTransactionId,
      refundPaymentMethod: dto.refundPaymentMethod === 'LAINNYA' ? dto.otherRefundPaymentMethod?.trim() : dto.refundPaymentMethod,
    } });
    await writeActivityLog(tx, { userId: actorId, activityType: ACTIVITY_TYPES.UPDATE, module: 'SALES',
      entityType: 'SALES_RETURN', entityId: id, entityNumber: row.salesReturnNumber,
      description: `Menyelesaikan Sales Return ${row.salesReturnNumber}` });
    await writeAuditLog(tx, { userId: actorId, transactionId: createAuditTransactionId(), module: 'SALES',
      operation: AUDIT_OPERATIONS.UPDATE, entityType: 'SALES_RETURN', entityId: id,
      entityNumber: row.salesReturnNumber, source: 'API', changedFields: changedFields(row as unknown as Record<string, unknown>, completed as unknown as Record<string, unknown>) });
    void totalCost;
  }
}
