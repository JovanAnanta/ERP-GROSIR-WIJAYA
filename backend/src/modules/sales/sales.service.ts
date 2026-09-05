import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  Prisma,
  SalesInvoiceStatus,
  SalesOrderStatus,
  SalesPaymentStatus,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  ACTIVITY_TYPES,
  AUDIT_OPERATIONS,
  changedFields,
  createAuditTransactionId,
  writeActivityLog,
  writeAuditLog,
} from '../../common/logging/business-logger.js';
import {
  generateBusinessDocumentNumber,
  generateFinancialAccountTransactionNumber,
} from '../../common/financial/transaction-number.utils.js';
import { generateInventoryMovementNumber } from '../inventory/inventory-movement-number.utils.js';
import { consumeFifoLayers } from '../../common/inventory/fifo-consumption.utils.js';
import {
  INVENTORY_MOVEMENT_TYPES,
  INVENTORY_ORIGIN_TYPES,
} from '../../common/inventory/inventory-origin.js';
import type {
  ChangeSalesInvoiceStatusDto,
  CustomerOutstandingQueryDto,
  InitialSalesPaymentDto,
  ProcessSalesInvoiceDto,
  ReceiveSalesPaymentDto,
  SalesItemDto,
  SalesListQueryDto,
  SaveSalesInvoiceDto,
  SaveSalesOrderDto,
} from './dto/sales.dto.js';
import {
  assertGuestPaymentIsUnpaidOrPaid,
  assertValidSourceAllocation,
  assertValidSalesPayment,
  calculateSalesLineSubtotal,
  resolveSalesPaymentStatus,
  resolveSalesPaymentType,
  resolveSalesInvoiceTerms,
} from './sales-rules.utils.js';

const ZERO = new Prisma.Decimal(0);

type PreparedItem = {
  dto: SalesItemDto;
  productUnitId: bigint;
  productId: bigint;
  productName: string;
  unitName: string;
  parentProductUnitId: bigint;
  baseQuantity: Prisma.Decimal;
  baseBonusQuantity: Prisma.Decimal;
  quantity: Prisma.Decimal;
  bonusQuantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  subtotal: Prisma.Decimal;
};

type OrderMapInput = {
  salesOrderId: bigint;
  salesOrderNumber: string;
  customerId: bigint | null;
  customerName: string | null;
  customer?: { customerName: string } | null;
  orderDate: Date;
  status: SalesOrderStatus;
  salesChannel: string;
  itemDiscountTotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  orderTotal: Prisma.Decimal;
  note: string | null;
  createdAt: Date;
  createdByUser?: { fullName: string };
  details?: Array<{
    salesOrderDetailId: bigint;
    productUnitId: bigint;
    productUnit: {
      product: { productName: string };
      unit: { unitName: string };
    };
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    bonusQuantity: Prisma.Decimal;
    subtotal: Prisma.Decimal;
    note: string | null;
    salesInvoiceDetails: Array<{
      quantity: Prisma.Decimal;
      bonusQuantity: Prisma.Decimal;
      salesInvoice?: {
        salesInvoiceId: bigint;
        salesInvoiceNumber: string;
        status: SalesInvoiceStatus;
      };
    }>;
  }>;
};

type InvoiceMapInput = {
  salesInvoiceId: bigint;
  salesInvoiceNumber: string;
  salesOrderId: bigint | null;
  salesOrder?: { salesOrderNumber: string } | null;
  customerId: bigint | null;
  customer?: { customerName: string } | null;
  customerName: string | null;
  partyType: string;
  salesChannel: string;
  paymentType: string;
  invoiceDate: Date;
  dueDate: Date | null;
  invoiceTotal: Prisma.Decimal;
  itemDiscountTotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  outstandingAmount: Prisma.Decimal;
  statusPayment: SalesPaymentStatus;
  status: SalesInvoiceStatus;
  note: string | null;
  createdAt: Date;
  createdByUser?: { fullName: string };
  _count?: { details: number; payments: number };
  details?: Array<{
    salesInvoiceDetailId: bigint;
    salesOrderDetailId: bigint | null;
    productUnitId: bigint;
    productUnit: {
      product: { productName: string };
      unit: { unitName: string };
    };
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    bonusQuantity: Prisma.Decimal;
    subtotal: Prisma.Decimal;
    note: string | null;
  }>;
  payments?: Array<{
    salesPaymentId: bigint;
    paymentNumber: string;
    paymentDate: Date;
    paymentMethod: string;
    financialAccountId: bigint;
    financialAccount: { accountName: string };
    paymentAmount: Prisma.Decimal;
    referenceNumber: string | null;
    note: string | null;
    createdByUser: { fullName: string };
    holding: { status: string } | null;
  }>;
};

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  private clean(value?: string) {
    const result = value?.trim();
    return result || null;
  }

  private async prepareItems(
    tx: Prisma.TransactionClient,
    items: SalesItemDto[],
  ): Promise<PreparedItem[]> {
    const ids = items.map((item) => {
      try {
        return BigInt(item.productUnitId);
      } catch {
        throw new HttpException(
          'Unit produk tidak valid.',
          HttpStatus.BAD_REQUEST,
        );
      }
    });
    if (new Set(ids.map(String)).size !== ids.length) {
      throw new HttpException(
        'Produk dengan satuan yang sama tidak boleh diduplikasi dalam satu dokumen.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const units = await tx.productUnit.findMany({
      where: {
        productUnitId: { in: ids },
        isActive: true,
        product: { isActive: true },
      },
      include: { unit: true, product: true, parentUnit: true },
    });
    const map = new Map(
      units.map((unit) => [unit.productUnitId.toString(), unit]),
    );
    return items.map((item) => {
      const unit = map.get(item.productUnitId);
      if (!unit) {
        throw new HttpException(
          'Terdapat produk atau satuan yang tidak aktif/tidak ditemukan.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      const parentId = unit.isParent
        ? unit.productUnitId
        : unit.parentProductUnitId;
      if (!parentId || (!unit.isParent && !unit.parentUnit)) {
        throw new HttpException(
          `Satuan parent untuk ${unit.product.productName} belum terkonfigurasi.`,
          HttpStatus.CONFLICT,
        );
      }
      const quantity = new Prisma.Decimal(item.quantity);
      const bonusQuantity = new Prisma.Decimal(item.bonusQuantity ?? 0);
      const unitPrice = new Prisma.Decimal(item.unitPrice);
      const discountAmount = new Prisma.Decimal(item.discountAmount ?? 0);
      const gross = quantity.mul(unitPrice).toDecimalPlaces(2);
      if (discountAmount.greaterThan(gross)) {
        throw new HttpException(
          `Diskon item ${unit.product.productName} melebihi nilai barang.`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      const parentFactor = unit.isParent
        ? unit.conversionFactor
        : unit.parentUnit!.conversionFactor;
      return {
        dto: item,
        productUnitId: unit.productUnitId,
        productId: unit.productId,
        productName: unit.product.productName,
        unitName: unit.unit.unitName,
        parentProductUnitId: parentId,
        baseQuantity: quantity.mul(unit.conversionFactor).div(parentFactor),
        baseBonusQuantity: bonusQuantity
          .mul(unit.conversionFactor)
          .div(parentFactor),
        quantity,
        bonusQuantity,
        unitPrice,
        discountAmount,
        subtotal: calculateSalesLineSubtotal(
          quantity,
          unitPrice,
          discountAmount,
        ),
      };
    });
  }

  private totals(items: PreparedItem[], invoiceDiscount: number) {
    const itemDiscountTotal = items.reduce(
      (sum, item) => sum.add(item.discountAmount),
      ZERO,
    );
    const subtotal = items.reduce((sum, item) => sum.add(item.subtotal), ZERO);
    const discountAmount = new Prisma.Decimal(invoiceDiscount ?? 0);
    if (discountAmount.greaterThan(subtotal)) {
      throw new HttpException(
        'Diskon dokumen tidak boleh melebihi subtotal.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return {
      itemDiscountTotal: itemDiscountTotal.toDecimalPlaces(2),
      discountAmount: discountAmount.toDecimalPlaces(2),
      grandTotal: subtotal.sub(discountAmount).toDecimalPlaces(2),
    };
  }

  private groupBase(items: PreparedItem[]) {
    const grouped = new Map<
      string,
      {
        productUnitId: bigint;
        productId: bigint;
        quantity: Prisma.Decimal;
        names: string[];
      }
    >();
    for (const item of items) {
      const key = item.parentProductUnitId.toString();
      const previous = grouped.get(key);
      const quantity = item.baseQuantity.add(item.baseBonusQuantity);
      if (previous) {
        previous.quantity = previous.quantity.add(quantity);
        previous.names.push(item.productName);
      } else {
        grouped.set(key, {
          productUnitId: item.parentProductUnitId,
          productId: item.productId,
          quantity,
          names: [item.productName],
        });
      }
    }
    return [...grouped.values()].sort((a, b) =>
      a.productUnitId < b.productUnitId
        ? -1
        : a.productUnitId > b.productUnitId
          ? 1
          : 0,
    );
  }

  private async lockStocks(
    tx: Prisma.TransactionClient,
    productUnitIds: bigint[],
  ) {
    for (const id of [...new Set(productUnitIds.map(String))].sort()) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`INVENTORY_STOCK:${id}`}))`;
      await tx.$queryRaw`SELECT inventory_stock_id FROM inventory_stock WHERE product_unit_id = ${BigInt(id)} FOR UPDATE`;
    }
  }

  private async reserve(
    tx: Prisma.TransactionClient,
    items: PreparedItem[],
    status: 'DRAFT' | 'READY',
  ) {
    const groups = this.groupBase(items);
    await this.lockStocks(
      tx,
      groups.map((group) => group.productUnitId),
    );
    for (const group of groups) {
      const updated = await tx.inventoryStock.updateMany({
        where: {
          productUnitId: group.productUnitId,
          availableQty: { gte: group.quantity },
        },
        data: {
          availableQty: { decrement: group.quantity },
          ...(status === 'READY'
            ? { packedQty: { increment: group.quantity } }
            : {}),
        },
      });
      if (updated.count !== 1) {
        throw new HttpException(
          `Stok tersedia ${group.names[0]} tidak mencukupi. Pindahkan kekurangannya ke Sales Order.`,
          HttpStatus.CONFLICT,
        );
      }
    }
  }

  private async releaseReservation(
    tx: Prisma.TransactionClient,
    items: PreparedItem[],
    status: 'DRAFT' | 'READY',
  ) {
    const groups = this.groupBase(items);
    await this.lockStocks(
      tx,
      groups.map((group) => group.productUnitId),
    );
    for (const group of groups) {
      const stock = await tx.inventoryStock.findUnique({
        where: { productUnitId: group.productUnitId },
      });
      if (
        !stock ||
        (status === 'READY' && stock.packedQty.lessThan(group.quantity))
      ) {
        throw new HttpException(
          'Data reservasi stok tidak konsisten.',
          HttpStatus.CONFLICT,
        );
      }
      await tx.inventoryStock.update({
        where: { productUnitId: group.productUnitId },
        data: {
          availableQty: { increment: group.quantity },
          ...(status === 'READY'
            ? { packedQty: { decrement: group.quantity } }
            : {}),
        },
      });
    }
  }

  private async validateParty(
    tx: Prisma.TransactionClient,
    partyType: 'CUSTOMER' | 'GUEST',
    customerId?: string,
  ) {
    if (partyType === 'GUEST')
      return { customerId: null, customerName: null as string | null };
    if (!customerId)
      throw new HttpException(
        'Customer wajib dipilih.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    let id: bigint;
    try {
      id = BigInt(customerId);
    } catch {
      throw new HttpException('Customer tidak valid.', HttpStatus.BAD_REQUEST);
    }
    const customer = await tx.customer.findUnique({
      where: { customerId: id },
    });
    if (!customer?.isActive) {
      throw new HttpException(
        'Customer tidak ditemukan atau tidak aktif.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return { customerId: id, customerName: customer.customerName };
  }

  private async updateSnapshot(
    tx: Prisma.TransactionClient,
    actorId: bigint,
    customerId: bigint | null,
    mode: 'MERGE' | 'REWRITE' | 'IGNORE',
    items: PreparedItem[],
  ) {
    if (!customerId || mode === 'IGNORE') return;
    if (mode === 'REWRITE')
      await tx.customerSuggestedPrice.deleteMany({ where: { customerId } });
    for (const item of items) {
      await tx.customerSuggestedPrice.upsert({
        where: {
          customerId_productUnitId: {
            customerId,
            productUnitId: item.productUnitId,
          },
        },
        create: {
          customerId,
          productUnitId: item.productUnitId,
          suggestedPrice: item.unitPrice,
          createdBy: actorId,
        },
        update: {
          suggestedPrice: item.unitPrice,
          updatedBy: actorId,
          updatedAt: new Date(),
        },
      });
    }
  }

  private async writeDocumentLogs(
    tx: Prisma.TransactionClient,
    actorId: bigint,
    input: {
      operation: 'CREATE' | 'UPDATE';
      entityType: string;
      entityId: bigint;
      entityNumber: string;
      before: Record<string, unknown> | null;
      after: Record<string, unknown>;
      description: string;
    },
  ) {
    const transactionId = createAuditTransactionId();
    await writeActivityLog(tx, {
      userId: actorId,
      activityType:
        input.operation === 'CREATE'
          ? ACTIVITY_TYPES.CREATE
          : ACTIVITY_TYPES.UPDATE,
      module: 'SALES',
      entityType: input.entityType,
      entityId: input.entityId,
      entityNumber: input.entityNumber,
      description: input.description,
    });
    await writeAuditLog(tx, {
      userId: actorId,
      transactionId,
      module: 'SALES',
      operation:
        input.operation === 'CREATE'
          ? AUDIT_OPERATIONS.CREATE
          : AUDIT_OPERATIONS.UPDATE,
      entityType: input.entityType,
      entityId: input.entityId,
      entityNumber: input.entityNumber,
      source: 'Sales Workspace',
      changedFields: changedFields(input.before, input.after),
    });
  }

  async createOrder(actorId: bigint, dto: SaveSalesOrderDto) {
    return this.prisma.$transaction(async (tx) =>
      this.createOrderTx(tx, actorId, dto),
    );
  }

  private async createOrderTx(
    tx: Prisma.TransactionClient,
    actorId: bigint,
    dto: SaveSalesOrderDto,
  ) {
    const party = dto.customerId
      ? await this.validateParty(tx, 'CUSTOMER', dto.customerId)
      : { customerId: null, customerName: this.clean(dto.customerName) };
    const items = await this.prepareItems(tx, dto.items);
    const totals = this.totals(items, dto.discountAmount);
    const now = new Date(dto.orderDate);
    const number = await generateBusinessDocumentNumber(tx, 'SO', now);
    const order = await tx.salesOrder.create({
      data: {
        salesOrderNumber: number,
        customerId: party.customerId,
        customerName: party.customerName,
        orderDate: now,
        status: dto.status,
        salesChannel: dto.salesChannel,
        sourceType: 'MANUAL',
        paymentStatus: 'UNPAID',
        itemDiscountTotal: totals.itemDiscountTotal,
        discountAmount: totals.discountAmount,
        orderTotal: totals.grandTotal,
        note: this.clean(dto.note),
        createdBy: actorId,
        details: {
          create: items.map((item) => ({
            productUnitId: item.productUnitId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            bonusQuantity: item.bonusQuantity,
            subtotal: item.subtotal,
            note: this.clean(item.dto.note),
          })),
        },
      },
    });
    await this.writeDocumentLogs(tx, actorId, {
      operation: 'CREATE',
      entityType: 'SALES_ORDER',
      entityId: order.salesOrderId,
      entityNumber: number,
      before: null,
      after: order,
      description: `Membuat Sales Order ${number}`,
    });
    return {
      salesOrderId: order.salesOrderId.toString(),
      salesOrderNumber: number,
    };
  }

  async updateOrder(actorId: bigint, id: bigint, dto: SaveSalesOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT sales_order_id FROM sales_order WHERE sales_order_id = ${id} FOR UPDATE`;
      const existing = await tx.salesOrder.findUnique({
        where: { salesOrderId: id },
      });
      if (!existing)
        throw new HttpException(
          'Sales Order tidak ditemukan.',
          HttpStatus.NOT_FOUND,
        );
      if (!['DRAFT', 'READY'].includes(existing.status))
        throw new HttpException(
          'Sales Order final tidak dapat diedit.',
          HttpStatus.CONFLICT,
        );
      const party = dto.customerId
        ? await this.validateParty(tx, 'CUSTOMER', dto.customerId)
        : { customerId: null, customerName: this.clean(dto.customerName) };
      const items = await this.prepareItems(tx, dto.items);
      const totals = this.totals(items, dto.discountAmount);
      await tx.salesOrderDetail.deleteMany({
        where: { salesOrderId: id, salesInvoiceDetails: { none: {} } },
      });
      const used = await tx.salesOrderDetail.count({
        where: { salesOrderId: id, salesInvoiceDetails: { some: {} } },
      });
      if (used > 0)
        throw new HttpException(
          'SO yang sudah dikonversi sebagian tidak dapat diedit.',
          HttpStatus.CONFLICT,
        );
      await tx.salesOrderDetail.deleteMany({ where: { salesOrderId: id } });
      const updated = await tx.salesOrder.update({
        where: { salesOrderId: id },
        data: {
          customerId: party.customerId,
          customerName: party.customerName,
          orderDate: new Date(dto.orderDate),
          status: dto.status,
          salesChannel: dto.salesChannel,
          itemDiscountTotal: totals.itemDiscountTotal,
          discountAmount: totals.discountAmount,
          orderTotal: totals.grandTotal,
          note: this.clean(dto.note),
          updatedBy: actorId,
          details: {
            create: items.map((item) => ({
              productUnitId: item.productUnitId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountAmount: item.discountAmount,
              bonusQuantity: item.bonusQuantity,
              subtotal: item.subtotal,
              note: this.clean(item.dto.note),
            })),
          },
        },
      });
      await this.writeDocumentLogs(tx, actorId, {
        operation: 'UPDATE',
        entityType: 'SALES_ORDER',
        entityId: id,
        entityNumber: updated.salesOrderNumber,
        before: existing,
        after: updated,
        description: `Memperbarui Sales Order ${updated.salesOrderNumber}`,
      });
      return {
        salesOrderId: id.toString(),
        salesOrderNumber: updated.salesOrderNumber,
      };
    });
  }

  async cancelOrder(actorId: bigint, id: bigint) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT sales_order_id FROM sales_order WHERE sales_order_id = ${id} FOR UPDATE`;
      const order = await tx.salesOrder.findUnique({
        where: { salesOrderId: id },
      });
      if (!order)
        throw new HttpException(
          'Sales Order tidak ditemukan.',
          HttpStatus.NOT_FOUND,
        );
      if (order.status === 'COMPLETED')
        throw new HttpException(
          'Sales Order yang sudah terpenuhi tidak dapat dibatalkan.',
          HttpStatus.CONFLICT,
        );
      const updated = await tx.salesOrder.update({
        where: { salesOrderId: id },
        data: { status: 'CANCELLED', updatedBy: actorId },
      });
      await this.writeDocumentLogs(tx, actorId, {
        operation: 'UPDATE',
        entityType: 'SALES_ORDER',
        entityId: id,
        entityNumber: order.salesOrderNumber,
        before: order,
        after: updated,
        description: `Membatalkan Sales Order ${order.salesOrderNumber}`,
      });
      return {
        salesOrderId: id.toString(),
        salesOrderNumber: order.salesOrderNumber,
      };
    });
  }

  async createInvoice(actorId: bigint, dto: SaveSalesInvoiceDto) {
    return this.prisma.$transaction(
      (tx) => this.createInvoiceTx(tx, actorId, dto),
      { timeout: 30_000 },
    );
  }

  async createInvoiceTx(
    tx: Prisma.TransactionClient,
    actorId: bigint,
    dto: SaveSalesInvoiceDto,
    returnCredit = ZERO,
  ) {
    dto = { ...dto, ...resolveSalesInvoiceTerms(dto) };
        const party = await this.validateParty(
          tx,
          dto.partyType,
          dto.customerId,
        );
        const items = await this.prepareItems(tx, dto.items);
        const totals = this.totals(items, dto.discountAmount);
        const paid = (dto.payments ?? []).reduce(
          (sum, payment) => sum.add(payment.paymentAmount),
          ZERO,
        );
        if (paid.greaterThan(totals.grandTotal))
          throw new HttpException(
            'Total pembayaran melebihi nilai Sales Invoice.',
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        if (returnCredit.lessThan(0) || returnCredit.greaterThan(totals.grandTotal.sub(paid)))
          throw new HttpException('Kredit retur tidak valid untuk Sales Invoice pengganti.', HttpStatus.UNPROCESSABLE_ENTITY);
        const initialOutstanding = totals.grandTotal.sub(paid).sub(returnCredit);
        assertGuestPaymentIsUnpaidOrPaid({
          partyType: dto.partyType,
          paidAmount: paid,
          outstandingAmount: initialOutstanding,
        });
        const paymentType = resolveSalesPaymentType({
          partyType: dto.partyType,
          outstandingAmount: initialOutstanding,
        });
        const requestedStatus = dto.status;
        const initialStatus: 'DRAFT' | 'READY' =
          requestedStatus === 'READY' ? 'READY' : 'DRAFT';
        await this.validateSourceOrder(tx, dto, items);
        await this.reserve(tx, items, initialStatus);
        const invoiceDate = new Date(dto.invoiceDate);
        const number = await generateBusinessDocumentNumber(
          tx,
          'SI',
          invoiceDate,
        );
        const invoice = await tx.salesInvoice.create({
          data: {
            salesInvoiceNumber: number,
            salesOrderId: dto.salesOrderId ? BigInt(dto.salesOrderId) : null,
            customerId: party.customerId,
            partyType: dto.partyType,
            customerName:
              dto.partyType === 'CUSTOMER'
                ? party.customerName
                : (this.clean(dto.customerName) ?? 'Guest'),
            salesChannel: dto.salesChannel,
            paymentType,
            invoiceDate,
            dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
            invoiceTotal: totals.grandTotal,
            discountAmount: totals.discountAmount,
            itemDiscountTotal: totals.itemDiscountTotal,
            statusPayment: returnCredit.equals(totals.grandTotal) ? 'PAID' : 'UNPAID',
            paidAmount: ZERO,
            outstandingAmount: totals.grandTotal.sub(returnCredit),
            returnCreditAppliedAmount: returnCredit,
            status: initialStatus,
            note: this.clean(dto.note),
            createdBy: actorId,
            details: {
              create: items.map((item) => ({
                salesOrderDetailId: item.dto.salesOrderDetailId
                  ? BigInt(item.dto.salesOrderDetailId)
                  : null,
                productUnitId: item.productUnitId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discountAmount: item.discountAmount,
                bonusQuantity: item.bonusQuantity,
                subtotal: item.subtotal,
                note: this.clean(item.dto.note),
                createdBy: actorId,
              })),
            },
          },
        });
        for (const payment of dto.payments ?? [])
          await this.recordPaymentTx(
            tx,
            actorId,
            invoice.salesInvoiceId,
            payment,
          );
        await this.updateSnapshot(
          tx,
          actorId,
          party.customerId,
          dto.snapshotMode,
          items,
        );
        let order: { salesOrderId: string; salesOrderNumber: string } | null =
          null;
        if (dto.orderItems?.length) {
          order = await this.createOrderTx(tx, actorId, {
            customerId: dto.customerId,
            customerName: dto.customerName,
            orderDate: dto.invoiceDate,
            status: 'DRAFT',
            salesChannel: dto.salesChannel,
            discountAmount: 0,
            note: dto.note,
            items: dto.orderItems,
          });
        }
        if (requestedStatus === 'COMPLETED')
          await this.completeInvoiceTx(tx, actorId, invoice.salesInvoiceId);
        await this.writeDocumentLogs(tx, actorId, {
          operation: 'CREATE',
          entityType: 'SALES_INVOICE',
          entityId: invoice.salesInvoiceId,
          entityNumber: number,
          before: null,
          after: invoice,
          description: `Membuat Sales Invoice ${number}${order ? ` dan ${order.salesOrderNumber}` : ''}`,
        });
        await this.syncSourceOrder(
          tx,
          dto.salesOrderId ? BigInt(dto.salesOrderId) : null,
        );
        return {
          salesInvoiceId: invoice.salesInvoiceId.toString(),
          salesInvoiceNumber: number,
          salesOrder: order,
        };
  }

  async quoteInvoiceTx(tx: Prisma.TransactionClient, dto: SaveSalesInvoiceDto) {
    const items = await this.prepareItems(tx, dto.items);
    return this.totals(items, dto.discountAmount).grandTotal;
  }

  private async validateSourceOrder(
    tx: Prisma.TransactionClient,
    dto: SaveSalesInvoiceDto,
    items: PreparedItem[],
    excludedInvoiceId?: bigint,
  ) {
    const sourceIds = items.flatMap((item) =>
      item.dto.salesOrderDetailId ? [BigInt(item.dto.salesOrderDetailId)] : [],
    );
    if (!sourceIds.length && !dto.salesOrderId) return;
    if (!dto.salesOrderId || sourceIds.length !== items.length) {
      throw new HttpException(
        'Seluruh item konversi SO harus memiliki referensi detail SO.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const orderId = BigInt(dto.salesOrderId);
    await tx.$queryRaw`SELECT sales_order_id FROM sales_order WHERE sales_order_id = ${orderId} FOR UPDATE`;
    const order = await tx.salesOrder.findUnique({
      where: { salesOrderId: orderId },
      select: { customerId: true, status: true },
    });
    if (
      !order ||
      order.status === 'CANCELLED' ||
      (order.status === 'COMPLETED' && !excludedInvoiceId)
    ) {
      throw new HttpException(
        'Sales Order sumber tidak aktif atau sudah final.',
        HttpStatus.CONFLICT,
      );
    }
    const requestedCustomerId =
      dto.partyType === 'CUSTOMER' && dto.customerId
        ? BigInt(dto.customerId)
        : null;
    if (order.customerId !== requestedCustomerId) {
      throw new HttpException(
        'Customer Sales Invoice harus sama dengan Sales Order sumber.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const details = await tx.salesOrderDetail.findMany({
      where: { salesOrderDetailId: { in: sourceIds }, salesOrderId: orderId },
      include: {
        salesInvoiceDetails: {
          where: { salesInvoice: { status: { not: 'CANCELLED' } } },
          select: {
            salesInvoiceId: true,
            quantity: true,
            bonusQuantity: true,
          },
        },
      },
    });
    if (details.length !== sourceIds.length)
      throw new HttpException(
        'Referensi detail Sales Order tidak valid.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const preparedMap = new Map(
      items.map((item) => [item.dto.salesOrderDetailId!, item]),
    );
    for (const detail of details) {
      const fulfilled = detail.salesInvoiceDetails.reduce(
        (sum, row) =>
          excludedInvoiceId && row.salesInvoiceId === excludedInvoiceId
            ? sum
            : sum.add(row.quantity),
        ZERO,
      );
      const requested = preparedMap.get(
        detail.salesOrderDetailId.toString(),
      )!.quantity;
      const fulfilledBonus = detail.salesInvoiceDetails.reduce(
        (sum, row) =>
          excludedInvoiceId && row.salesInvoiceId === excludedInvoiceId
            ? sum
            : sum.add(row.bonusQuantity),
        ZERO,
      );
      const requestedBonus = preparedMap.get(
        detail.salesOrderDetailId.toString(),
      )!.bonusQuantity;
      assertValidSourceAllocation({
        orderedQuantity: detail.quantity,
        orderedBonusQuantity: detail.bonusQuantity,
        fulfilledQuantity: fulfilled,
        fulfilledBonusQuantity: fulfilledBonus,
        requestedQuantity: requested,
        requestedBonusQuantity: requestedBonus,
      });
    }
  }

  async updateInvoice(actorId: bigint, id: bigint, dto: SaveSalesInvoiceDto) {
    dto = { ...dto, ...resolveSalesInvoiceTerms(dto) };
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT sales_invoice_id FROM sales_invoice WHERE sales_invoice_id = ${id} FOR UPDATE`;
        const existing = await tx.salesInvoice.findUnique({
          where: { salesInvoiceId: id },
          include: { details: true },
        });
        if (!existing)
          throw new HttpException(
            'Sales Invoice tidak ditemukan.',
            HttpStatus.NOT_FOUND,
          );
        if (!['DRAFT', 'READY'].includes(existing.status))
          throw new HttpException(
            'Sales Invoice final tidak dapat diedit.',
            HttpStatus.CONFLICT,
          );
        const oldItems = await this.prepareItems(
          tx,
          existing.details.map((detail) => ({
            productUnitId: detail.productUnitId.toString(),
            quantity: Number(detail.quantity),
            unitPrice: Number(detail.unitPrice),
            discountAmount: Number(detail.discountAmount),
            bonusQuantity: Number(detail.bonusQuantity),
            note: detail.note ?? undefined,
          })),
        );
        await this.releaseReservation(
          tx,
          oldItems,
          existing.status as 'DRAFT' | 'READY',
        );
        const party = await this.validateParty(
          tx,
          dto.partyType,
          dto.customerId,
        );
        const items = await this.prepareItems(tx, dto.items);
        const totals = this.totals(items, dto.discountAmount);
        if (existing.paidAmount.greaterThan(totals.grandTotal)) {
          throw new HttpException(
            'Nilai dokumen tidak boleh lebih kecil dari pembayaran yang telah diterima.',
            HttpStatus.CONFLICT,
          );
        }
        await this.validateSourceOrderForUpdate(tx, id, dto, items);
        const targetOperationalStatus: 'DRAFT' | 'READY' =
          dto.status === 'READY' ? 'READY' : 'DRAFT';
        await this.reserve(tx, items, targetOperationalStatus);
        await tx.salesInvoiceDetail.deleteMany({
          where: { salesInvoiceId: id },
        });
        const outstanding = totals.grandTotal.sub(existing.paidAmount);
        assertGuestPaymentIsUnpaidOrPaid({
          partyType: dto.partyType,
          paidAmount: existing.paidAmount,
          outstandingAmount: outstanding,
        });
        const paymentType = resolveSalesPaymentType({
          partyType: dto.partyType,
          outstandingAmount: outstanding,
          previousPaymentType:
            existing.partyType === 'CUSTOMER'
              ? existing.paymentType
              : undefined,
        });
        const updated = await tx.salesInvoice.update({
          where: { salesInvoiceId: id },
          data: {
            salesOrderId: dto.salesOrderId ? BigInt(dto.salesOrderId) : null,
            customerId: party.customerId,
            partyType: dto.partyType,
            customerName:
              dto.partyType === 'CUSTOMER'
                ? party.customerName
                : (this.clean(dto.customerName) ?? 'Guest'),
            salesChannel: dto.salesChannel,
            paymentType,
            invoiceDate: new Date(dto.invoiceDate),
            dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
            invoiceTotal: totals.grandTotal,
            discountAmount: totals.discountAmount,
            itemDiscountTotal: totals.itemDiscountTotal,
            outstandingAmount: outstanding,
            statusPayment: outstanding.equals(0)
              ? 'PAID'
              : existing.paidAmount.greaterThan(0)
                ? 'PARTIAL'
                : 'UNPAID',
            status: targetOperationalStatus,
            note: this.clean(dto.note),
            updatedBy: actorId,
            details: {
              create: items.map((item) => ({
                salesOrderDetailId: item.dto.salesOrderDetailId
                  ? BigInt(item.dto.salesOrderDetailId)
                  : null,
                productUnitId: item.productUnitId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discountAmount: item.discountAmount,
                bonusQuantity: item.bonusQuantity,
                subtotal: item.subtotal,
                note: this.clean(item.dto.note),
                createdBy: actorId,
              })),
            },
          },
        });
        await this.updateSnapshot(
          tx,
          actorId,
          party.customerId,
          dto.snapshotMode,
          items,
        );
        if (dto.status === 'COMPLETED')
          await this.completeInvoiceTx(tx, actorId, id);
        await this.writeDocumentLogs(tx, actorId, {
          operation: 'UPDATE',
          entityType: 'SALES_INVOICE',
          entityId: id,
          entityNumber: updated.salesInvoiceNumber,
          before: existing,
          after: updated,
          description: `Memperbarui Sales Invoice ${updated.salesInvoiceNumber}`,
        });
        await this.syncSourceOrder(tx, existing.salesOrderId);
        await this.syncSourceOrder(
          tx,
          dto.salesOrderId ? BigInt(dto.salesOrderId) : null,
        );
        return {
          salesInvoiceId: id.toString(),
          salesInvoiceNumber: updated.salesInvoiceNumber,
        };
      },
      { timeout: 30_000 },
    );
  }

  private async validateSourceOrderForUpdate(
    tx: Prisma.TransactionClient,
    invoiceId: bigint,
    dto: SaveSalesInvoiceDto,
    items: PreparedItem[],
  ) {
    await this.validateSourceOrder(tx, dto, items, invoiceId);
  }

  async completeInvoice(actorId: bigint, id: bigint) {
    return this.prisma.$transaction(
      async (tx) => this.completeInvoiceTx(tx, actorId, id),
      { timeout: 30_000 },
    );
  }

  async changeInvoiceStatus(
    actorId: bigint,
    id: bigint,
    dto: ChangeSalesInvoiceStatusDto,
  ) {
    return this.prisma.$transaction(
      async (tx) => this.changeInvoiceStatusTx(tx, actorId, id, dto),
      { timeout: 30_000 },
    );
  }

  async processInvoice(
    actorId: bigint,
    id: bigint,
    dto: ProcessSalesInvoiceDto,
  ) {
    if (!dto.payment && !dto.targetStatus) {
      throw new HttpException(
        'Pilih perubahan status atau isi pembayaran.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT sales_invoice_id FROM sales_invoice WHERE sales_invoice_id = ${id} FOR UPDATE`;
        if (dto.payment)
          await this.recordPaymentTx(tx, actorId, id, dto.payment);
        if (dto.targetStatus)
          return this.changeInvoiceStatusTx(tx, actorId, id, {
            targetStatus: dto.targetStatus,
            dueDate: dto.dueDate,
          });
        return this.findInvoiceByIdTx(tx, id);
      },
      { timeout: 30_000 },
    );
  }

  private async changeInvoiceStatusTx(
    tx: Prisma.TransactionClient,
    actorId: bigint,
    id: bigint,
    dto: ChangeSalesInvoiceStatusDto,
  ) {
    await tx.$queryRaw`SELECT sales_invoice_id FROM sales_invoice WHERE sales_invoice_id = ${id} FOR UPDATE`;
    const invoice = await tx.salesInvoice.findUnique({
      where: { salesInvoiceId: id },
      include: { details: true },
    });
    if (!invoice)
      throw new HttpException(
        'Sales Invoice tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    if (invoice.status === 'CANCELLED')
      throw new HttpException('Sales Invoice dibatalkan.', HttpStatus.CONFLICT);
    if (invoice.status === 'COMPLETED' && dto.targetStatus !== 'COMPLETED')
      throw new HttpException(
        'Sales Invoice COMPLETED tidak dapat dikembalikan ke status sebelumnya.',
        HttpStatus.CONFLICT,
      );

    if (dto.dueDate && !invoice.customerId)
      throw new HttpException(
        'Tanggal jatuh tempo hanya berlaku untuk Customer.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    if (dto.dueDate)
      await tx.salesInvoice.update({
        where: { salesInvoiceId: id },
        data: { dueDate: new Date(dto.dueDate), updatedBy: actorId },
      });

    if (dto.targetStatus === 'COMPLETED') {
      if (invoice.status === 'COMPLETED') return this.findInvoiceByIdTx(tx, id);
      return this.completeInvoiceTx(tx, actorId, id);
    }
    if (invoice.status === dto.targetStatus)
      return this.findInvoiceByIdTx(tx, id);

    const items = await this.prepareItems(
      tx,
      invoice.details.map((detail) => ({
        productUnitId: detail.productUnitId.toString(),
        quantity: Number(detail.quantity),
        unitPrice: Number(detail.unitPrice),
        discountAmount: Number(detail.discountAmount),
        bonusQuantity: Number(detail.bonusQuantity),
        note: detail.note ?? undefined,
      })),
    );
    const groups = this.groupBase(items);
    await this.lockStocks(
      tx,
      groups.map((group) => group.productUnitId),
    );
    for (const group of groups) {
      const stock = await tx.inventoryStock.findUnique({
        where: { productUnitId: group.productUnitId },
      });
      if (!stock)
        throw new HttpException(
          `Stok ${group.names[0]} tidak ditemukan.`,
          HttpStatus.CONFLICT,
        );
      if (
        invoice.status === 'DRAFT' &&
        dto.targetStatus === 'READY' &&
        stock.actualQty.sub(stock.packedQty).lessThan(group.quantity)
      )
        throw new HttpException(
          `Stok fisik belum dikemas untuk ${group.names[0]}.`,
          HttpStatus.CONFLICT,
        );
      if (
        invoice.status === 'READY' &&
        dto.targetStatus === 'DRAFT' &&
        stock.packedQty.lessThan(group.quantity)
      )
        throw new HttpException(
          `Stok dikemas ${group.names[0]} tidak konsisten.`,
          HttpStatus.CONFLICT,
        );
      await tx.inventoryStock.update({
        where: { productUnitId: group.productUnitId },
        data: {
          packedQty:
            dto.targetStatus === 'READY'
              ? { increment: group.quantity }
              : { decrement: group.quantity },
        },
      });
    }
    const updated = await tx.salesInvoice.update({
      where: { salesInvoiceId: id },
      data: {
        status: dto.targetStatus,
        updatedBy: actorId,
      },
    });
    await this.writeDocumentLogs(tx, actorId, {
      operation: 'UPDATE',
      entityType: 'SALES_INVOICE',
      entityId: id,
      entityNumber: invoice.salesInvoiceNumber,
      before: invoice,
      after: updated,
      description: `Mengubah status ${invoice.salesInvoiceNumber} dari ${invoice.status} menjadi ${dto.targetStatus}`,
    });
    return this.findInvoiceByIdTx(tx, id);
  }

  private async completeInvoiceTx(
    tx: Prisma.TransactionClient,
    actorId: bigint,
    id: bigint,
  ) {
    await tx.$queryRaw`SELECT sales_invoice_id FROM sales_invoice WHERE sales_invoice_id = ${id} FOR UPDATE`;
    const invoice = await tx.salesInvoice.findUnique({
      where: { salesInvoiceId: id },
      include: {
        details: {
          orderBy: { salesInvoiceDetailId: 'asc' },
          include: {
            productUnit: {
              include: { unit: true, product: true, parentUnit: true },
            },
          },
        },
        paymentHoldings: { where: { status: 'HELD' } },
      },
    });
    if (!invoice)
      throw new HttpException(
        'Sales Invoice tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    if (invoice.status === 'COMPLETED') return this.mapInvoice(invoice);
    if (invoice.status === 'CANCELLED')
      throw new HttpException('Sales Invoice dibatalkan.', HttpStatus.CONFLICT);
    if (invoice.partyType === 'GUEST' && !invoice.outstandingAmount.equals(0)) {
      throw new HttpException(
        'Penjualan Guest harus lunas sebelum diselesaikan.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (
      invoice.customerId &&
      invoice.outstandingAmount.greaterThan(0) &&
      !invoice.dueDate
    ) {
      throw new HttpException(
        'Tanggal jatuh tempo wajib diisi untuk transaksi yang belum lunas.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const prepared = await this.prepareItems(
      tx,
      invoice.details.map((detail) => ({
        productUnitId: detail.productUnitId.toString(),
        quantity: Number(detail.quantity),
        unitPrice: Number(detail.unitPrice),
        discountAmount: Number(detail.discountAmount),
        bonusQuantity: Number(detail.bonusQuantity),
        note: detail.note ?? undefined,
      })),
    );
    const groups = this.groupBase(prepared);
    await this.lockStocks(
      tx,
      groups.map((group) => group.productUnitId),
    );
    for (const group of groups) {
      const stock = await tx.inventoryStock.findUnique({
        where: { productUnitId: group.productUnitId },
      });
      if (
        !stock ||
        stock.actualQty.lessThan(group.quantity) ||
        (invoice.status === 'READY' && stock.packedQty.lessThan(group.quantity))
      ) {
        throw new HttpException(
          `Stok fisik ${group.names[0]} tidak konsisten.`,
          HttpStatus.CONFLICT,
        );
      }
    }
    for (let index = 0; index < prepared.length; index += 1) {
      const item = prepared[index];
      const detail = invoice.details[index];
      const totalQty = item.baseQuantity.add(item.baseBonusQuantity);
      const movement = await tx.inventoryMovement.create({
        data: {
          movementNumber: await generateInventoryMovementNumber(
            tx,
            'OUT',
            new Date(),
          ),
          productUnitId: item.parentProductUnitId,
          direction: 'OUT',
          quantity: totalQty,
          movementType: INVENTORY_MOVEMENT_TYPES.SALES_ISSUE,
          originType: INVENTORY_ORIGIN_TYPES.SALES_INVOICE,
          originId: invoice.salesInvoiceId,
          originNumber: invoice.salesInvoiceNumber,
          salesInvoiceDetailId: detail.salesInvoiceDetailId,
          movementDate: new Date(),
          note: invoice.note,
          createdBy: actorId,
        },
      });
      await consumeFifoLayers(tx, {
        productUnitId: item.parentProductUnitId,
        quantity: totalQty,
        inventoryMovementId: movement.inventoryMovementId,
        createdBy: actorId,
        insufficientMessage: `FIFO ${item.productName} tidak mencukupi. Seluruh penyelesaian dibatalkan.`,
      });
    }
    for (const group of groups) {
      await tx.inventoryStock.update({
        where: { productUnitId: group.productUnitId },
        data: {
          actualQty: { decrement: group.quantity },
          ...(invoice.status === 'READY'
            ? { packedQty: { decrement: group.quantity } }
            : {}),
        },
      });
    }
    const now = new Date();
    await tx.salesPaymentHolding.updateMany({
      where: { salesInvoiceId: id, status: 'HELD' },
      data: {
        status: 'APPLIED',
        remainingAmount: ZERO,
        resolvedAt: now,
        resolvedBy: actorId,
      },
    });
    if (invoice.customerId) {
      const latestPayment = invoice.paidAmount.greaterThan(0)
        ? await tx.salesInvoicePayment.findFirst({
            where: { salesInvoiceId: id },
            orderBy: [{ paymentDate: 'desc' }, { salesPaymentId: 'desc' }],
            select: { paymentDate: true },
          })
        : null;
      await tx.customerFinancialSummary.upsert({
        where: { customerId: invoice.customerId },
        create: {
          customerId: invoice.customerId,
          outstandingAmount: invoice.outstandingAmount,
          currentAmount: invoice.outstandingAmount,
          lastPaymentDate: latestPayment?.paymentDate,
        },
        update: {
          outstandingAmount: { increment: invoice.outstandingAmount },
          currentAmount: { increment: invoice.outstandingAmount },
          ...(latestPayment
            ? { lastPaymentDate: latestPayment.paymentDate }
            : {}),
          updatedAt: now,
        },
      });
      await tx.customerAccountTransaction.create({
        data: {
          transactionNumber: await generateBusinessDocumentNumber(
            tx,
            'AR',
            now,
          ),
          customerId: invoice.customerId,
          transactionType: 'SALES_INVOICE',
          direction: 'IN',
          amount: invoice.invoiceTotal,
          referenceType: 'SALES_INVOICE',
          referenceId: id,
          transactionDate: now,
          dueDate: invoice.dueDate,
          note: invoice.note,
          createdBy: actorId,
        },
      });
      if (invoice.paidAmount.greaterThan(0)) {
        await tx.customerAccountTransaction.create({
          data: {
            transactionNumber: await generateBusinessDocumentNumber(
              tx,
              'AR',
              now,
            ),
            customerId: invoice.customerId,
            transactionType: 'SALES_PAYMENT_APPLIED',
            direction: 'OUT',
            amount: invoice.paidAmount,
            referenceType: 'SALES_INVOICE',
            referenceId: id,
            transactionDate: now,
            note: 'Pembayaran diterima sebelum transaksi selesai',
            createdBy: actorId,
          },
        });
      }
    }
    const updated = await tx.salesInvoice.update({
      where: { salesInvoiceId: id },
      data: {
        status: 'COMPLETED',
        approvedAt: now,
        approvedBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.syncSourceOrder(tx, invoice.salesOrderId);
    await this.writeDocumentLogs(tx, actorId, {
      operation: 'UPDATE',
      entityType: 'SALES_INVOICE',
      entityId: id,
      entityNumber: invoice.salesInvoiceNumber,
      before: invoice,
      after: updated,
      description: `Menyelesaikan Sales Invoice ${invoice.salesInvoiceNumber}`,
    });
    return this.findInvoiceByIdTx(tx, id);
  }

  async cancelInvoice(actorId: bigint, id: bigint) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT sales_invoice_id FROM sales_invoice WHERE sales_invoice_id = ${id} FOR UPDATE`;
      const invoice = await tx.salesInvoice.findUnique({
        where: { salesInvoiceId: id },
        include: { details: true, payments: true },
      });
      if (!invoice)
        throw new HttpException(
          'Sales Invoice tidak ditemukan.',
          HttpStatus.NOT_FOUND,
        );
      if (invoice.status === 'COMPLETED')
        throw new HttpException(
          'Sales Invoice COMPLETED hanya dapat dikoreksi melalui Sales Return.',
          HttpStatus.CONFLICT,
        );
      if (invoice.status === 'CANCELLED') return this.findInvoiceByIdTx(tx, id);
      if (invoice.payments.length)
        throw new HttpException(
          'Selesaikan pengembalian/deposit pembayaran terlebih dahulu sebelum membatalkan SI.',
          HttpStatus.CONFLICT,
        );
      const items = await this.prepareItems(
        tx,
        invoice.details.map((detail) => ({
          productUnitId: detail.productUnitId.toString(),
          quantity: Number(detail.quantity),
          unitPrice: Number(detail.unitPrice),
          discountAmount: Number(detail.discountAmount),
          bonusQuantity: Number(detail.bonusQuantity),
          note: detail.note ?? undefined,
        })),
      );
      await this.releaseReservation(tx, items, invoice.status);
      const updated = await tx.salesInvoice.update({
        where: { salesInvoiceId: id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy: actorId,
          updatedBy: actorId,
        },
      });
      await this.syncSourceOrder(tx, invoice.salesOrderId);
      await this.writeDocumentLogs(tx, actorId, {
        operation: 'UPDATE',
        entityType: 'SALES_INVOICE',
        entityId: id,
        entityNumber: invoice.salesInvoiceNumber,
        before: invoice,
        after: updated,
        description: `Membatalkan Sales Invoice ${invoice.salesInvoiceNumber}`,
      });
      return this.findInvoiceByIdTx(tx, id);
    });
  }

  async receivePayment(
    actorId: bigint,
    id: bigint,
    dto: ReceiveSalesPaymentDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT sales_invoice_id FROM sales_invoice WHERE sales_invoice_id = ${id} FOR UPDATE`;
      await this.recordPaymentTx(tx, actorId, id, dto);
      return this.findInvoiceByIdTx(tx, id);
    });
  }

  private async recordPaymentTx(
    tx: Prisma.TransactionClient,
    actorId: bigint,
    id: bigint,
    dto: InitialSalesPaymentDto,
  ) {
    const invoice = await tx.salesInvoice.findUnique({
      where: { salesInvoiceId: id },
    });
    if (!invoice)
      throw new HttpException(
        'Sales Invoice tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    if (invoice.status === 'CANCELLED')
      throw new HttpException('Sales Invoice dibatalkan.', HttpStatus.CONFLICT);
    const amount = new Prisma.Decimal(dto.paymentAmount);
    assertValidSalesPayment(amount, invoice.outstandingAmount);
    const paidAmount = invoice.paidAmount.add(amount);
    const outstandingAmount = invoice.outstandingAmount.sub(amount);
    assertGuestPaymentIsUnpaidOrPaid({
      partyType: invoice.partyType,
      paidAmount,
      outstandingAmount,
    });
    let accountId: bigint;
    try {
      accountId = BigInt(dto.financialAccountId);
    } catch {
      throw new HttpException(
        'Akun penerima tidak valid.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const account = await tx.financialAccount.findUnique({
      where: { financialAccountId: accountId },
    });
    if (!account?.isActive)
      throw new HttpException(
        'Akun penerima tidak aktif atau tidak ditemukan.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const method =
      dto.paymentMethod === 'LAINNYA'
        ? this.clean(dto.otherPaymentMethod)
        : dto.paymentMethod;
    if (!method)
      throw new HttpException(
        'Nama metode pembayaran wajib diisi.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const paymentDate = new Date(dto.paymentDate);
    const financialTransaction = await tx.financialAccountTransaction.create({
      data: {
        transactionNumber: await generateFinancialAccountTransactionNumber(
          tx,
          paymentDate,
        ),
        financialAccountId: accountId,
        transactionType:
          invoice.status === 'COMPLETED' ? 'SALES_PAYMENT' : 'CUSTOMER_ADVANCE',
        paymentMethod: method,
        direction: 'IN',
        amount,
        referenceType: 'SALES_INVOICE',
        referenceId: id,
        transactionDate: paymentDate,
        note: this.clean(dto.note),
        createdBy: actorId,
      },
    });
    const payment = await tx.salesInvoicePayment.create({
      data: {
        paymentNumber: await generateBusinessDocumentNumber(
          tx,
          'SP',
          paymentDate,
        ),
        salesInvoiceId: id,
        paymentDate,
        paymentMethod: method,
        financialAccountId: accountId,
        financialAccountTransactionId:
          financialTransaction.financialAccountTransactionId,
        paymentAmount: amount,
        referenceNumber: this.clean(dto.referenceNumber),
        note: this.clean(dto.note),
        createdBy: actorId,
      },
    });
    await tx.financialAccount.update({
      where: { financialAccountId: accountId },
      data: {
        currentBalance: { increment: amount },
        updatedBy: actorId,
        updatedAt: new Date(),
      },
    });
    if (invoice.status !== 'COMPLETED') {
      await tx.salesPaymentHolding.create({
        data: {
          salesInvoiceId: id,
          salesPaymentId: payment.salesPaymentId,
          amount,
          remainingAmount: amount,
          status: 'HELD',
        },
      });
    } else if (invoice.customerId) {
      const updatedSummary = await tx.customerFinancialSummary.updateMany({
        where: {
          customerId: invoice.customerId,
          outstandingAmount: { gte: amount },
        },
        data: {
          outstandingAmount: { decrement: amount },
          currentAmount: { decrement: amount },
          lastPaymentDate: paymentDate,
          updatedAt: new Date(),
        },
      });
      if (updatedSummary.count !== 1)
        throw new HttpException(
          'Ringkasan piutang customer tidak konsisten.',
          HttpStatus.CONFLICT,
        );
      await tx.customerAccountTransaction.create({
        data: {
          transactionNumber: await generateBusinessDocumentNumber(
            tx,
            'AR',
            paymentDate,
          ),
          customerId: invoice.customerId,
          transactionType: 'SALES_PAYMENT',
          direction: 'OUT',
          amount,
          referenceType: 'SALES_INVOICE',
          referenceId: id,
          transactionDate: paymentDate,
          note: this.clean(dto.note),
          createdBy: actorId,
        },
      });
    }
    const statusPayment = resolveSalesPaymentStatus(
      paidAmount,
      outstandingAmount,
    );
    await tx.salesInvoice.update({
      where: { salesInvoiceId: id },
      data: {
        paidAmount,
        outstandingAmount,
        statusPayment,
        updatedBy: actorId,
      },
    });
    await this.writeDocumentLogs(tx, actorId, {
      operation: 'CREATE',
      entityType: 'SALES_PAYMENT',
      entityId: payment.salesPaymentId,
      entityNumber: payment.paymentNumber,
      before: null,
      after: payment,
      description: `Menerima pembayaran ${payment.paymentNumber} untuk ${invoice.salesInvoiceNumber}`,
    });
  }

  private async syncSourceOrder(
    tx: Prisma.TransactionClient,
    orderId: bigint | null,
  ) {
    if (!orderId) return;
    const order = await tx.salesOrder.findUnique({
      where: { salesOrderId: orderId },
      include: {
        details: {
          include: {
            salesInvoiceDetails: {
              where: { salesInvoice: { status: { not: 'CANCELLED' } } },
              select: { quantity: true, bonusQuantity: true },
            },
          },
        },
      },
    });
    if (!order || order.status === 'CANCELLED') return;
    const complete = order.details.every((detail) => {
      const fulfilled = detail.salesInvoiceDetails.reduce(
        (sum, row) => sum.add(row.quantity),
        ZERO,
      );
      const fulfilledBonus = detail.salesInvoiceDetails.reduce(
        (sum, row) => sum.add(row.bonusQuantity),
        ZERO,
      );
      return (
        fulfilled.greaterThanOrEqualTo(detail.quantity) &&
        fulfilledBonus.greaterThanOrEqualTo(detail.bonusQuantity)
      );
    });
    await tx.salesOrder.update({
      where: { salesOrderId: orderId },
      data: {
        status: complete
          ? 'COMPLETED'
          : order.status === 'COMPLETED'
            ? 'READY'
            : order.status,
      },
    });
  }

  async listOrders(query: SalesListQueryDto) {
    const where: Prisma.SalesOrderWhereInput = {
      status:
        query.tab === 'ACTIVE'
          ? { in: ['DRAFT', 'READY'] }
          : { in: ['COMPLETED', 'CANCELLED'] },
      ...(query.search
        ? {
            OR: [
              {
                salesOrderNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                customer: {
                  customerName: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [total, rows] = await Promise.all([
      this.prisma.salesOrder.count({ where }),
      this.prisma.salesOrder.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: true,
          details: {
            include: {
              productUnit: { include: { product: true, unit: true } },
              salesInvoiceDetails: {
                where: { salesInvoice: { status: { not: 'CANCELLED' } } },
                select: { quantity: true, bonusQuantity: true },
              },
            },
          },
        },
      }),
    ]);
    return {
      data: rows.map((row) => this.mapOrder(row)),
      meta: this.meta(query, total),
    };
  }

  async listInvoices(query: SalesListQueryDto) {
    const where: Prisma.SalesInvoiceWhereInput = {
      status:
        query.tab === 'ACTIVE'
          ? { in: ['DRAFT', 'READY'] }
          : { in: ['COMPLETED', 'CANCELLED'] },
      ...(query.search
        ? {
            OR: [
              {
                salesInvoiceNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              { customerName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [total, rows] = await Promise.all([
      this.prisma.salesInvoice.count({ where }),
      this.prisma.salesInvoice.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: true,
          _count: { select: { details: true, payments: true } },
        },
      }),
    ]);
    return {
      data: rows.map((row) => this.mapInvoice(row)),
      meta: this.meta(query, total),
    };
  }

  private meta(query: SalesListQueryDto, total: number) {
    return {
      currentPage: query.page,
      pageSize: query.limit,
      totalData: total,
      totalPage: Math.ceil(total / query.limit),
    };
  }

  async findOrderById(id: bigint) {
    const order = await this.prisma.salesOrder.findUnique({
      where: { salesOrderId: id },
      include: {
        customer: true,
        createdByUser: true,
        updatedByUser: true,
        details: {
          include: {
            productUnit: { include: { product: true, unit: true } },
            salesInvoiceDetails: {
              where: { salesInvoice: { status: { not: 'CANCELLED' } } },
              include: {
                salesInvoice: {
                  select: {
                    salesInvoiceId: true,
                    salesInvoiceNumber: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!order)
      throw new HttpException(
        'Sales Order tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    return this.mapOrder(order);
  }

  async findInvoiceById(id: bigint) {
    return this.findInvoiceByIdTx(this.prisma, id);
  }

  async listCustomerOutstanding(query: CustomerOutstandingQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.CustomerFinancialSummaryWhereInput = {
      outstandingAmount: { gt: ZERO },
      customer: search
        ? {
            OR: [
              { customerName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.customerFinancialSummary.count({ where }),
      this.prisma.customerFinancialSummary.findMany({
        where,
        include: { customer: true },
        orderBy:
          query.sort === 'NAME_ASC'
            ? { customer: { customerName: 'asc' } }
            : { outstandingAmount: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    const customerIds = rows.map((row) => row.customerId);
    const invoiceGroups = customerIds.length
      ? await this.prisma.salesInvoice.groupBy({
          by: ['customerId'],
          where: {
            customerId: { in: customerIds },
            status: 'COMPLETED',
            outstandingAmount: { gt: ZERO },
          },
          _count: { _all: true },
          _min: { dueDate: true },
        })
      : [];
    const metadata = new Map(
      invoiceGroups.map((row) => [row.customerId?.toString(), row]),
    );
    return {
      data: rows.map((row) => {
        const info = metadata.get(row.customerId.toString());
        return {
          customerId: row.customerId.toString(),
          customerName: row.customer.customerName,
          phone: row.customer.phone,
          outstandingAmount: Number(row.outstandingAmount),
          lastPaymentDate: row.lastPaymentDate,
          unpaidInvoiceCount: info?._count._all ?? 0,
          oldestDueDate: info?._min.dueDate ?? null,
        };
      }),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async listCustomerOutstandingInvoices(customerId: bigint) {
    const customer = await this.prisma.customer.findUnique({
      where: { customerId },
      include: { financialSummary: true },
    });
    if (!customer)
      throw new HttpException('Customer tidak ditemukan.', HttpStatus.NOT_FOUND);
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        customerId,
        status: 'COMPLETED',
        outstandingAmount: { gt: ZERO },
      },
      orderBy: [{ dueDate: 'asc' }, { invoiceDate: 'asc' }],
      include: {
        customer: true,
        salesOrder: { select: { salesOrderNumber: true } },
        createdByUser: true,
        _count: { select: { details: true, payments: true } },
      },
    });
    return {
      customer: {
        customerId: customer.customerId.toString(),
        customerName: customer.customerName,
        phone: customer.phone,
        outstandingAmount: Number(customer.financialSummary?.outstandingAmount ?? 0),
      },
      invoices: invoices.map((invoice) => this.mapInvoice(invoice)),
    };
  }

  private async findInvoiceByIdTx(
    tx: Pick<Prisma.TransactionClient, 'salesInvoice'>,
    id: bigint,
  ) {
    const invoice = await tx.salesInvoice.findUnique({
      where: { salesInvoiceId: id },
      include: {
        customer: true,
        salesOrder: { select: { salesOrderNumber: true } },
        createdByUser: true,
        details: {
          include: {
            productUnit: { include: { product: true, unit: true } },
            salesOrderDetail: { select: { salesOrderDetailId: true } },
          },
        },
        payments: {
          orderBy: [{ paymentDate: 'asc' }, { salesPaymentId: 'asc' }],
          include: {
            financialAccount: true,
            createdByUser: true,
            holding: true,
          },
        },
      },
    });
    if (!invoice)
      throw new HttpException(
        'Sales Invoice tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    return this.mapInvoice(invoice);
  }

  private mapOrder(order: OrderMapInput) {
    return {
      salesOrderId: order.salesOrderId.toString(),
      salesOrderNumber: order.salesOrderNumber,
      customerId: order.customerId?.toString() ?? null,
      customerName:
        order.customer?.customerName ?? order.customerName ?? 'Guest',
      orderDate: order.orderDate,
      status: order.status,
      salesChannel: order.salesChannel,
      itemDiscountTotal: Number(order.itemDiscountTotal),
      discountAmount: Number(order.discountAmount),
      orderTotal: Number(order.orderTotal),
      note: order.note,
      createdAt: order.createdAt,
      createdByName: order.createdByUser?.fullName,
      details:
        order.details?.map((detail) => {
          const fulfilled =
            detail.salesInvoiceDetails?.reduce(
              (sum, row) => sum.add(row.quantity),
              ZERO,
            ) ?? ZERO;
          const fulfilledBonus =
            detail.salesInvoiceDetails?.reduce(
              (sum, row) => sum.add(row.bonusQuantity),
              ZERO,
            ) ?? ZERO;
          return {
            salesOrderDetailId: detail.salesOrderDetailId.toString(),
            productUnitId: detail.productUnitId.toString(),
            productName: detail.productUnit.product.productName,
            unitName: detail.productUnit.unit.unitName,
            quantity: Number(detail.quantity),
            fulfilledQuantity: Number(fulfilled),
            remainingQuantity: Number(detail.quantity.sub(fulfilled)),
            fulfilledBonusQuantity: Number(fulfilledBonus),
            remainingBonusQuantity: Number(
              detail.bonusQuantity.sub(fulfilledBonus),
            ),
            unitPrice: Number(detail.unitPrice),
            discountAmount: Number(detail.discountAmount),
            bonusQuantity: Number(detail.bonusQuantity),
            subtotal: Number(detail.subtotal),
            note: detail.note,
            invoices:
              detail.salesInvoiceDetails?.flatMap((row) =>
                row.salesInvoice
                  ? [
                      {
                        salesInvoiceId:
                          row.salesInvoice.salesInvoiceId.toString(),
                        salesInvoiceNumber: row.salesInvoice.salesInvoiceNumber,
                        status: row.salesInvoice.status,
                      },
                    ]
                  : [],
              ) ?? [],
          };
        }) ?? [],
    };
  }

  private mapInvoice(invoice: InvoiceMapInput) {
    return {
      salesInvoiceId: invoice.salesInvoiceId.toString(),
      salesInvoiceNumber: invoice.salesInvoiceNumber,
      salesOrderId: invoice.salesOrderId?.toString() ?? null,
      salesOrderNumber: invoice.salesOrder?.salesOrderNumber ?? null,
      customerId: invoice.customerId?.toString() ?? null,
      customerName:
        invoice.customerName ?? invoice.customer?.customerName ?? 'Guest',
      partyType: invoice.partyType,
      salesChannel: invoice.salesChannel,
      paymentType: invoice.paymentType,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      invoiceTotal: Number(invoice.invoiceTotal),
      itemDiscountTotal: Number(invoice.itemDiscountTotal),
      discountAmount: Number(invoice.discountAmount),
      paidAmount: Number(invoice.paidAmount),
      outstandingAmount: Number(invoice.outstandingAmount),
      statusPayment: invoice.statusPayment,
      status: invoice.status,
      note: invoice.note,
      createdAt: invoice.createdAt,
      createdByName: invoice.createdByUser?.fullName,
      detailCount: invoice._count?.details,
      paymentCount: invoice._count?.payments,
      details: invoice.details?.map((detail) => ({
        salesInvoiceDetailId: detail.salesInvoiceDetailId.toString(),
        salesOrderDetailId: detail.salesOrderDetailId?.toString() ?? null,
        productUnitId: detail.productUnitId.toString(),
        productName: detail.productUnit.product.productName,
        unitName: detail.productUnit.unit.unitName,
        quantity: Number(detail.quantity),
        unitPrice: Number(detail.unitPrice),
        discountAmount: Number(detail.discountAmount),
        bonusQuantity: Number(detail.bonusQuantity),
        subtotal: Number(detail.subtotal),
        note: detail.note,
      })),
      payments: invoice.payments?.map((payment) => ({
        salesPaymentId: payment.salesPaymentId.toString(),
        paymentNumber: payment.paymentNumber,
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        financialAccountId: payment.financialAccountId.toString(),
        accountName: payment.financialAccount.accountName,
        paymentAmount: Number(payment.paymentAmount),
        referenceNumber: payment.referenceNumber,
        note: payment.note,
        createdByName: payment.createdByUser.fullName,
        holdingStatus: payment.holding?.status ?? null,
      })),
    };
  }

  async lookupCustomers() {
    const rows = await this.prisma.customer.findMany({
      where: { isActive: true },
      orderBy: { customerName: 'asc' },
      include: { financialSummary: true },
    });
    return rows.map((row) => ({
      customerId: row.customerId.toString(),
      customerName: row.customerName,
      phone: row.phone,
      outstandingAmount: Number(row.financialSummary?.outstandingAmount ?? 0),
    }));
  }

  async lookupProducts(customerId?: string) {
    let parsedCustomerId: bigint | undefined;
    if (customerId) {
      try {
        parsedCustomerId = BigInt(customerId);
      } catch {
        throw new HttpException(
          'Customer tidak valid.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    const rows = await this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: { productName: 'asc' },
      include: {
        productUnits: {
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
          include: {
            unit: true,
            inventoryStocks: true,
            parentUnit: { include: { inventoryStocks: true } },
            guestPrices: { orderBy: { updatedAt: 'desc' }, take: 1 },
            customerPrices: parsedCustomerId
              ? { where: { customerId: parsedCustomerId }, take: 1 }
              : false,
          },
        },
      },
    });
    return rows.map((product) => ({
      productId: product.productId.toString(),
      productName: product.productName,
      units: product.productUnits.map((unit) => {
        const parentStock = unit.isParent
          ? unit.inventoryStocks[0]
          : unit.parentUnit?.inventoryStocks[0];
        const parentFactor = unit.isParent
          ? unit.conversionFactor
          : (unit.parentUnit?.conversionFactor ?? new Prisma.Decimal(1));
        const selectedUnitDivisor = unit.conversionFactor.div(parentFactor);
        const inSelectedUnit = (value: Prisma.Decimal | undefined) =>
          Number((value ?? ZERO).div(selectedUnitDivisor));
        return {
          productUnitId: unit.productUnitId.toString(),
          unitName: unit.unit.unitName,
          conversionFactor: Number(unit.conversionFactor),
          isParent: unit.isParent,
          availableQty: inSelectedUnit(parentStock?.availableQty),
          actualQty: inSelectedUnit(parentStock?.actualQty),
          packedQty: inSelectedUnit(parentStock?.packedQty),
          suggestedPrice: Number(
            (Array.isArray(unit.customerPrices) &&
              unit.customerPrices[0]?.suggestedPrice) ||
              unit.guestPrices[0]?.suggestedPrice ||
              0,
          ),
          hasSuggestedPrice: Boolean(
            (Array.isArray(unit.customerPrices) &&
              unit.customerPrices.length) ||
            unit.guestPrices.length,
          ),
          priceSource:
            Array.isArray(unit.customerPrices) && unit.customerPrices.length
              ? 'CUSTOMER'
              : 'GUEST',
        };
      }),
    }));
  }

  async lookupAccounts() {
    const rows = await this.prisma.financialAccount.findMany({
      where: { isActive: true },
      orderBy: { accountName: 'asc' },
    });
    return rows.map((row) => ({
      financialAccountId: row.financialAccountId.toString(),
      accountName: row.accountName,
      accountType: row.accountType,
      currentBalance: Number(row.currentBalance),
    }));
  }

  async lookupReadyOrders() {
    const rows = await this.prisma.salesOrder.findMany({
      where: { status: { in: ['DRAFT', 'READY'] } },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        details: {
          include: {
            productUnit: { include: { product: true, unit: true } },
            salesInvoiceDetails: {
              where: { salesInvoice: { status: { not: 'CANCELLED' } } },
              select: { quantity: true, bonusQuantity: true },
            },
          },
        },
      },
    });
    return rows
      .map((row) => this.mapOrder(row))
      .filter((row) =>
        row.details.some(
          (detail) =>
            detail.remainingQuantity > 0 || detail.remainingBonusQuantity > 0,
        ),
      );
  }
}
