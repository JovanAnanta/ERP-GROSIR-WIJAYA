import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  CreatePurchaseInvoiceDto,
  PurchaseInvoiceListQueryDto,
  UpdatePurchaseInvoiceDto,
  AddInvoicePaymentDto,
  PurchasePaymentDto,
} from './dto/purchasing.dto.js';
import {
  Prisma,
  PurchaseInvoicePaymentStatus,
  PurchaseOrderStatus,
} from '../../../generated/prisma/client.js';
import { calculateTotalPaid } from './purchase-payment.utils.js';
import { toBaseQuantity, toBaseUnitCost } from './fifo-cost.utils.js';
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

type CreatedInvoiceWithDetails = Prisma.PurchaseInvoiceGetPayload<{
  include: {
    details: {
      include: {
        productUnit: {
          include: { product: { include: { productUnits: true } } };
        };
      };
    };
  };
}>;

@Injectable()
export class PurchaseInvoiceService {
  constructor(private readonly prisma: PrismaService) {}

  private async generatePINumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const prefix = `PI-${day}${month}${year}-`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PI:${prefix}`}))`;
    const lastInvoice = await tx.purchaseInvoice.findFirst({
      where: { purchaseInvoiceNumber: { startsWith: prefix } },
      orderBy: { purchaseInvoiceNumber: 'desc' },
    });

    let nextSequence = 1;
    if (lastInvoice) {
      const parts = lastInvoice.purchaseInvoiceNumber.split('-');
      if (parts[2]) nextSequence = parseInt(parts[2], 10) + 1;
    }
    return `${prefix}${String(nextSequence).padStart(7, '0')}`;
  }

  private async validateInvoiceReferences(
    tx: Prisma.TransactionClient,
    dto: CreatePurchaseInvoiceDto | UpdatePurchaseInvoiceDto,
  ): Promise<void> {
    const supplierId = BigInt(dto.supplierId);
    const supplier = await tx.supplier.findUnique({
      where: { supplierId },
      select: { isActive: true },
    });
    if (!supplier?.isActive) {
      throw new HttpException(
        'Supplier tidak valid atau tidak aktif',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.purchaseOrderId) {
      const purchaseOrder = await tx.purchaseOrder.findUnique({
        where: { purchaseOrderId: BigInt(dto.purchaseOrderId) },
        select: { supplierId: true, status: true },
      });
      if (
        !purchaseOrder ||
        purchaseOrder.status !== PurchaseOrderStatus.READY
      ) {
        throw new HttpException(
          'Purchase Order tidak valid atau belum berstatus READY',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (purchaseOrder.supplierId !== supplierId) {
        throw new HttpException(
          'Supplier faktur harus sama dengan supplier Purchase Order',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const productUnitIds = [
      ...new Set(dto.items.map((item) => item.productUnitId)),
    ].map((id) => BigInt(id));
    const activeProductUnits = await tx.productUnit.count({
      where: {
        productUnitId: { in: productUnitIds },
        isActive: true,
        product: { isActive: true },
        unit: { isActive: true },
      },
    });
    if (activeProductUnits !== productUnitIds.length) {
      throw new HttpException(
        'Terdapat produk atau unit yang tidak valid atau tidak aktif',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.status === 'COMPLETED' && dto.payments?.length) {
      const accountIds = [
        ...new Set(dto.payments.map((payment) => payment.financialAccountId)),
      ].map((id) => BigInt(id));
      const activeAccounts = await tx.financialAccount.count({
        where: { financialAccountId: { in: accountIds }, isActive: true },
      });
      if (activeAccounts !== accountIds.length) {
        throw new HttpException(
          'Terdapat akun pembayaran yang tidak valid atau tidak aktif',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }

  private async generateFinancialTransactionNumber(
    tx: Prisma.TransactionClient,
    financialAccountId: bigint,
  ): Promise<string> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('FAT:NUMBER'))`;
    const lastTransaction = await tx.financialAccountTransaction.findFirst({
      where: { transactionNumber: { startsWith: 'FAT-' } },
      orderBy: { financialAccountTransactionId: 'desc' },
      select: { transactionNumber: true },
    });
    const lastTimestamp = lastTransaction
      ? Number(lastTransaction.transactionNumber.split('-')[1])
      : 0;
    const timestamp = Math.max(Date.now(), lastTimestamp + 1);
    return `FAT-${timestamp}-${financialAccountId.toString()}`;
  }

  async create(userId: bigint, dto: CreatePurchaseInvoiceDto) {
    if (dto.items.length === 0)
      throw new HttpException(
        'Item tidak boleh kosong',
        HttpStatus.BAD_REQUEST,
      );

    return await this.prisma.$transaction(async (tx) => {
      const invoiceNumber = await this.generatePINumber(tx);
      const supplierId = BigInt(dto.supplierId);
      const poId = dto.purchaseOrderId ? BigInt(dto.purchaseOrderId) : null;
      const now = new Date();
      const transactionId = createAuditTransactionId();

      const invoiceTotal = new Prisma.Decimal(dto.invoiceTotal);
      await this.validateInvoiceReferences(tx, dto);
      const totalPaid =
        dto.status === 'COMPLETED'
          ? calculateTotalPaid(invoiceTotal, dto.payments)
          : new Prisma.Decimal(0);
      const outstandingAmount = invoiceTotal.sub(totalPaid);

      let statusPayment: PurchaseInvoicePaymentStatus =
        PurchaseInvoicePaymentStatus.UNPAID;
      if (totalPaid.equals(invoiceTotal))
        statusPayment = PurchaseInvoicePaymentStatus.PAID;
      else if (totalPaid.greaterThan(0))
        statusPayment = PurchaseInvoicePaymentStatus.PARTIAL;

      const invoice: CreatedInvoiceWithDetails =
        await tx.purchaseInvoice.create({
          data: {
            purchaseInvoiceNumber: invoiceNumber,
            supplierId,
            purchaseOrderId: poId,
            invoiceDate: new Date(dto.invoiceDate),
            dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
            invoiceTotal,
            discountAmount: new Prisma.Decimal(dto.discountAmount),
            statusPayment,
            paidAmount: totalPaid,
            outstandingAmount,
            status: dto.status,
            note: dto.note,
            createdBy: userId,
            details: {
              create: dto.items.map((item) => ({
                productUnitId: BigInt(item.productUnitId),
                quantity: item.purchasedQty,
                unitCost: item.price,
                subtotal: new Prisma.Decimal(item.purchasedQty).mul(item.price),
                note: item.note,
              })),
            },
          },
          include: {
            details: {
              include: {
                productUnit: {
                  include: { product: { include: { productUnits: true } } },
                },
              },
            },
          },
        });

      await this._processPriceHistory(
        tx,
        invoice,
        dto.priceHistoryAction,
        userId,
        now,
        transactionId,
      );

      if (dto.status === 'COMPLETED') {
        await this._processInventory(tx, invoice, userId, now, transactionId);
        await this._processFinance(
          tx,
          invoice,
          dto.payments || [],
          userId,
          now,
          transactionId,
        );
        if (poId)
          await this._processPO(
            tx,
            poId,
            userId,
            now,
            transactionId,
            invoiceNumber,
          );
      }

      await this._processLogs(
        tx,
        invoice,
        dto,
        userId,
        now,
        'CREATE',
        undefined,
        transactionId,
      );
      return invoice;
    });
  }

  async update(
    userId: bigint,
    invoiceId: string,
    dto: UpdatePurchaseInvoiceDto,
  ) {
    const id = BigInt(invoiceId);

    return await this.prisma.$transaction(async (tx) => {
      const existing = await tx.purchaseInvoice.findUnique({
        where: { purchaseInvoiceId: id },
        include: { details: true },
      });
      if (!existing)
        throw new HttpException('Faktur tidak ditemukan', HttpStatus.NOT_FOUND);
      if (existing.status !== 'DRAFT')
        throw new HttpException(
          'Hanya faktur DRAFT yang dapat diperbarui',
          HttpStatus.BAD_REQUEST,
        );

      const supplierId = BigInt(dto.supplierId);
      const poId = dto.purchaseOrderId ? BigInt(dto.purchaseOrderId) : null;
      const now = new Date();
      const transactionId = createAuditTransactionId();

      await this.validateInvoiceReferences(tx, dto);

      await tx.purchaseInvoiceDetail.deleteMany({
        where: { purchaseInvoiceId: id },
      });

      const invoiceTotal = new Prisma.Decimal(dto.invoiceTotal);
      const totalPaid =
        dto.status === 'COMPLETED'
          ? calculateTotalPaid(invoiceTotal, dto.payments)
          : new Prisma.Decimal(0);
      const outstandingAmount = invoiceTotal.sub(totalPaid);

      let statusPayment: PurchaseInvoicePaymentStatus =
        PurchaseInvoicePaymentStatus.UNPAID;
      if (totalPaid.equals(invoiceTotal))
        statusPayment = PurchaseInvoicePaymentStatus.PAID;
      else if (totalPaid.greaterThan(0))
        statusPayment = PurchaseInvoicePaymentStatus.PARTIAL;

      const updated: CreatedInvoiceWithDetails =
        await tx.purchaseInvoice.update({
          where: { purchaseInvoiceId: id },
          data: {
            supplierId,
            purchaseOrderId: poId,
            invoiceDate: new Date(dto.invoiceDate),
            dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
            invoiceTotal,
            discountAmount: new Prisma.Decimal(dto.discountAmount),
            statusPayment,
            paidAmount: totalPaid,
            outstandingAmount,
            status: dto.status,
            note: dto.note,
            updatedBy: userId,
            updatedAt: now,
            details: {
              create: dto.items.map((item) => ({
                productUnitId: BigInt(item.productUnitId),
                quantity: item.purchasedQty,
                unitCost: item.price,
                subtotal: new Prisma.Decimal(item.purchasedQty).mul(item.price),
                note: item.note,
              })),
            },
          },
          include: {
            details: {
              include: {
                productUnit: {
                  include: { product: { include: { productUnits: true } } },
                },
              },
            },
          },
        });

      await this._processPriceHistory(
        tx,
        updated,
        dto.priceHistoryAction,
        userId,
        now,
        transactionId,
      );

      if (dto.status === 'COMPLETED') {
        await this._processInventory(tx, updated, userId, now, transactionId);
        await this._processFinance(
          tx,
          updated,
          dto.payments || [],
          userId,
          now,
          transactionId,
        );
        if (poId)
          await this._processPO(
            tx,
            poId,
            userId,
            now,
            transactionId,
            updated.purchaseInvoiceNumber,
          );
      }

      await this._processLogs(
        tx,
        updated,
        dto,
        userId,
        now,
        'UPDATE',
        existing,
        transactionId,
      );
      return updated;
    });
  }

  async addPayment(
    userId: bigint,
    invoiceId: string,
    dto: AddInvoicePaymentDto,
  ) {
    const id = BigInt(invoiceId);

    return await this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<
        Array<{ purchase_invoice_id: bigint }>
      >`
        SELECT purchase_invoice_id
        FROM purchase_invoice
        WHERE purchase_invoice_id = ${id}
        FOR UPDATE
      `;
      if (lockedRows.length === 0) {
        throw new HttpException('Faktur tidak ditemukan', HttpStatus.NOT_FOUND);
      }

      const invoice = await tx.purchaseInvoice.findUnique({
        where: { purchaseInvoiceId: id },
      });
      if (!invoice)
        throw new HttpException('Faktur tidak ditemukan', HttpStatus.NOT_FOUND);
      if (invoice.status !== 'COMPLETED')
        throw new HttpException(
          'Pembayaran hanya untuk faktur yang sudah COMPLETED',
          HttpStatus.BAD_REQUEST,
        );
      if (invoice.statusPayment === 'PAID')
        throw new HttpException('Faktur sudah lunas', HttpStatus.BAD_REQUEST);

      const payAmt = new Prisma.Decimal(dto.paymentAmount);
      const now = new Date();

      const financialAccountId = BigInt(dto.financialAccountId);
      const financialAccount = await tx.financialAccount.findUnique({
        where: { financialAccountId },
      });
      if (!financialAccount?.isActive) {
        throw new HttpException(
          'Akun pembayaran tidak valid atau tidak aktif',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (payAmt.greaterThan(invoice.outstandingAmount)) {
        throw new HttpException(
          'Nominal pembayaran melebihi sisa hutang',
          HttpStatus.BAD_REQUEST,
        );
      }

      const payment = await tx.purchaseInvoicePayment.create({
        data: {
          purchaseInvoiceId: id,
          financialAccountId,
          paymentAmount: payAmt,
          paymentMethod: dto.paymentMethod,
          paymentDate: new Date(dto.paymentDate),
          referenceNumber: dto.referenceNumber,
          note: dto.note,
          createdBy: userId,
        },
      });

      const updatedFinancialAccount = await tx.financialAccount.update({
        where: { financialAccountId },
        data: {
          currentBalance: { decrement: payAmt },
          updatedBy: userId,
          updatedAt: now,
        },
      });

      const transactionNumber = await this.generateFinancialTransactionNumber(
        tx,
        financialAccountId,
      );
      const financialTransaction = await tx.financialAccountTransaction.create({
        data: {
          transactionNumber,
          financialAccountId,
          transactionType: 'PURCHASE_PAYMENT',
          paymentMethod: dto.paymentMethod,
          direction: 'OUT',
          amount: payAmt,
          referenceType: 'PURCHASE_INVOICE',
          referenceId: id,
          transactionDate: now,
          note: dto.note,
          createdBy: userId,
        },
      });

      const summaryBefore = await tx.supplierFinancialSummary.findUnique({
        where: { supplierId: invoice.supplierId },
      });
      const updatedSummary = await tx.supplierFinancialSummary.updateMany({
        where: {
          supplierId: invoice.supplierId,
          outstandingAmount: { gte: payAmt },
          currentAmount: { gte: payAmt },
        },
        data: {
          outstandingAmount: { decrement: payAmt },
          currentAmount: { decrement: payAmt },
          updatedAt: now,
        },
      });
      if (updatedSummary.count !== 1) {
        throw new HttpException(
          'Ringkasan hutang supplier tidak konsisten. Pembayaran dibatalkan.',
          HttpStatus.CONFLICT,
        );
      }
      const summaryAfter = await tx.supplierFinancialSummary.findUnique({
        where: { supplierId: invoice.supplierId },
      });

      const newPaidAmount = invoice.paidAmount.add(payAmt);
      const newOutstanding = invoice.outstandingAmount.sub(payAmt);
      const newStatusPayment = newOutstanding.equals(0)
        ? PurchaseInvoicePaymentStatus.PAID
        : PurchaseInvoicePaymentStatus.PARTIAL;

      const updatedInvoice = await tx.purchaseInvoice.update({
        where: { purchaseInvoiceId: id },
        data: {
          paidAmount: newPaidAmount,
          outstandingAmount: newOutstanding,
          statusPayment: newStatusPayment,
          updatedBy: userId,
          updatedAt: now,
        },
      });

      const transactionId = createAuditTransactionId();
      await tx.activityLog.create({
        data: {
          userId,
          activityType: ACTIVITY_TYPES.UPDATE,
          module: 'PURCHASE',
          entityType: 'PURCHASE_INVOICE',
          entityId: id,
          entityNumber: invoice.purchaseInvoiceNumber,
          description: `Pembayaran ${newStatusPayment} sebesar Rp ${payAmt.toString()} untuk Faktur ${invoice.purchaseInvoiceNumber}`,
          createdAt: now,
        },
      });

      await writeAuditLog(tx, {
        userId,
        transactionId,
        module: 'PURCHASE',
        operation: AUDIT_OPERATIONS.UPDATE,
        entityType: 'PURCHASE_INVOICE',
        entityId: id,
        entityNumber: invoice.purchaseInvoiceNumber,
        source: 'Updated via Purchase Invoice Payment',
        changedFields: changedFields(invoice, updatedInvoice, [
          'paidAmount',
          'outstandingAmount',
          'statusPayment',
        ]),
      });
      await writeAuditLog(tx, {
        userId,
        transactionId,
        module: 'PURCHASE',
        operation: AUDIT_OPERATIONS.CREATE,
        entityType: 'PURCHASE_INVOICE_PAYMENT',
        entityId: payment.purchasePaymentId,
        entityNumber: invoice.purchaseInvoiceNumber,
        source: 'Created via Purchase Invoice Payment',
        changedFields: changedFields(null, payment, [
          'financialAccountId',
          'paymentAmount',
          'paymentMethod',
          'paymentDate',
          'referenceNumber',
          'note',
        ]),
      });
      await writeAuditLog(tx, {
        userId,
        transactionId,
        module: 'FINANCIAL',
        operation: AUDIT_OPERATIONS.UPDATE,
        entityType: 'FINANCIAL_ACCOUNT',
        entityId: financialAccountId,
        entityNumber: financialAccount.accountName,
        source: 'Updated via Purchase Invoice Payment',
        changedFields: changedFields(
          financialAccount,
          updatedFinancialAccount,
          ['currentBalance'],
        ),
      });
      await writeAuditLog(tx, {
        userId,
        transactionId,
        module: 'FINANCIAL',
        operation: AUDIT_OPERATIONS.CREATE,
        entityType: 'FINANCIAL_ACCOUNT_TRANSACTION',
        entityId: financialTransaction.financialAccountTransactionId,
        entityNumber: financialTransaction.transactionNumber,
        source: 'Created via Purchase Invoice Payment',
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
      if (summaryBefore && summaryAfter) {
        await writeAuditLog(tx, {
          userId,
          transactionId,
          module: 'FINANCIAL',
          operation: AUDIT_OPERATIONS.UPDATE,
          entityType: 'SUPPLIER_FINANCIAL_SUMMARY',
          entityId: summaryBefore.supplierFinancialId,
          entityNumber: invoice.purchaseInvoiceNumber,
          source: 'Updated via Purchase Invoice Payment',
          changedFields: changedFields(summaryBefore, summaryAfter, [
            'outstandingAmount',
            'currentAmount',
          ]),
        });
      }

      return { success: true };
    });
  }

  async getSupplierSummaries() {
    const suppliers = await this.prisma.supplier.findMany({
      where: {
        isActive: true,
        purchaseInvoices: {
          some: {
            OR: [
              { status: 'DRAFT' },
              {
                status: 'COMPLETED',
                statusPayment: { in: ['UNPAID', 'PARTIAL'] },
              },
            ],
          },
        },
      },
      include: {
        financialSummary: true,
        _count: {
          select: {
            purchaseInvoices: {
              where: {
                OR: [
                  { status: 'DRAFT' },
                  {
                    status: 'COMPLETED',
                    statusPayment: { in: ['UNPAID', 'PARTIAL'] },
                  },
                ],
              },
            },
          },
        },
      },
      orderBy: { supplierName: 'asc' },
    });

    return suppliers.map((s) => ({
      supplierId: s.supplierId.toString(),
      supplierName: s.supplierName,
      outstandingAmount: s.financialSummary
        ? Number(s.financialSummary.outstandingAmount)
        : 0,
      overdueAmount: s.financialSummary
        ? Number(s.financialSummary.overdueAmount)
        : 0,
      lastPaymentDate: s.financialSummary?.lastPaymentDate,
      activeInvoiceCount: s._count.purchaseInvoices,
    }));
  }

  async findAll(query: PurchaseInvoiceListQueryDto) {
    const page = parseInt(query.page ?? '1', 10);
    const limit = parseInt(query.limit ?? '20', 10);
    const skip = (page - 1) * limit;
    const whereClause: Prisma.PurchaseInvoiceWhereInput = {};
    if (query.supplierId) whereClause.supplierId = BigInt(query.supplierId);

    if (query.tab === 'ACTIVE') {
      whereClause.OR = [
        { status: 'DRAFT' },
        { status: 'COMPLETED', statusPayment: { in: ['UNPAID', 'PARTIAL'] } },
      ];
    } else if (query.tab === 'COMPLETED') {
      whereClause.status = 'COMPLETED';
      whereClause.statusPayment = 'PAID';
    }

    const total = await this.prisma.purchaseInvoice.count({
      where: whereClause,
    });
    const data = await this.prisma.purchaseInvoice.findMany({
      where: whereClause,
      skip,
      take: limit,
      include: {
        supplier: { select: { supplierName: true } },
        returns: {
          where: { status: { not: 'CANCELLED' } },
          select: {
            status: true,
            resolutionType: true,
            expectedResolutionDate: true,
          },
        },
      },
      orderBy:
        query.tab === 'COMPLETED'
          ? [{ createdAt: 'desc' }]
          : [
              { dueDate: { sort: 'asc', nulls: 'last' } },
              { createdAt: 'desc' },
            ],
    });

    const mappedData = data.map((d) => ({
      ...d,
      purchaseInvoiceId: d.purchaseInvoiceId.toString(),
      purchaseOrderId: d.purchaseOrderId?.toString() || null,
      supplierId: d.supplierId.toString(),
      supplierName: d.supplier.supplierName,
      invoiceTotal: Number(d.invoiceTotal),
      paidAmount: Number(d.paidAmount),
      outstandingAmount: Number(d.outstandingAmount),
      createdBy: d.createdBy.toString(),
      updatedBy: d.updatedBy?.toString() || null,
      returnSummary: {
        total: d.returns.length,
        pending: d.returns.filter((item) => item.status !== 'COMPLETED').length,
        overdue: d.returns.filter(
          (item) =>
            item.status === 'READY' &&
            item.expectedResolutionDate &&
            item.expectedResolutionDate < new Date(),
        ).length,
      },
    }));

    return {
      data: mappedData,
      meta: {
        currentPage: page,
        pageSize: limit,
        totalData: total,
        totalPage: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string) {
    const data = await this.prisma.purchaseInvoice.findUnique({
      where: { purchaseInvoiceId: BigInt(id) },
      include: {
        supplier: { select: { supplierName: true } },
        purchaseOrder: { select: { purchaseOrderNumber: true } },
        details: {
          include: { productUnit: { include: { product: true, unit: true } } },
        },
        payments: {
          include: { financialAccount: { select: { accountName: true } } },
        },
      },
    });

    if (!data)
      throw new HttpException('Data tidak ditemukan', HttpStatus.NOT_FOUND);

    return {
      ...data,
      purchaseInvoiceId: data.purchaseInvoiceId.toString(),
      supplierId: data.supplierId.toString(),
      purchaseOrderId: data.purchaseOrderId?.toString() || null,
      supplierName: data.supplier.supplierName,
      purchaseOrderNumber: data.purchaseOrder?.purchaseOrderNumber || null,
      invoiceTotal: Number(data.invoiceTotal),
      discountAmount: Number(data.discountAmount),
      paidAmount: Number(data.paidAmount),
      outstandingAmount: Number(data.outstandingAmount),
      createdBy: data.createdBy.toString(),
      updatedBy: data.updatedBy?.toString() || null,
      details: data.details.map((d) => ({
        ...d,
        purchaseInvoiceDetailId: d.purchaseInvoiceDetailId.toString(),
        productUnitId: d.productUnitId.toString(),
        productName: d.productUnit.product.productName,
        unitName: d.productUnit.unit.unitName,
        quantity: Number(d.quantity),
        unitCost: Number(d.unitCost),
        subtotal: Number(d.subtotal),
      })),
      payments: data.payments.map((p) => ({
        ...p,
        purchasePaymentId: p.purchasePaymentId.toString(),
        financialAccountId: p.financialAccountId.toString(),
        accountName: p.financialAccount.accountName,
        paymentAmount: Number(p.paymentAmount),
        createdBy: p.createdBy.toString(),
      })),
    };
  }

  private async _processInventory(
    tx: Prisma.TransactionClient,
    invoice: CreatedInvoiceWithDetails,
    userId: bigint,
    now: Date,
    transactionId: string,
  ) {
    for (const detail of invoice.details) {
      const selectedUnit = detail.productUnit;
      const parentUnit = selectedUnit.product.productUnits.find(
        (u) => u.isParent,
      );
      if (!parentUnit)
        throw new HttpException(
          `Product Base Unit missing`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );

      const parentQty = toBaseQuantity(
        detail.quantity,
        selectedUnit.conversionFactor,
        parentUnit.conversionFactor,
      );
      const baseUnitCost = toBaseUnitCost(detail.subtotal, parentQty);

      const movement = await tx.inventoryMovement.create({
        data: {
          movementNumber: await generateInventoryMovementNumber(tx, 'IN', now),
          productUnitId: parentUnit.productUnitId,
          direction: 'IN',
          quantity: parentQty,
          movementType: 'PURCHASE_INVOICE',
          originType: 'PURCHASE_INVOICE_DETAIL',
          originId: detail.purchaseInvoiceDetailId,
          originNumber: invoice.purchaseInvoiceNumber,
          movementDate: now,
          createdBy: userId,
        },
      });

      const layer = await tx.fifoLayer.create({
        data: {
          fifoLayerNumber: await generateFifoLayerNumber(tx, now),
          productUnitId: parentUnit.productUnitId,
          originType: 'PURCHASE',
          originInventoryMovementId: movement.inventoryMovementId,
          originId: detail.purchaseInvoiceDetailId,
          originalQty: parentQty,
          remainingQty: parentQty,
          // FIFO is stored in the parent/base unit, so its unit cost must use
          // the same unit as originalQty/remainingQty.
          unitCost: baseUnitCost,
          originalCost: detail.subtotal,
          remainingCost: detail.subtotal,
          createdBy: userId,
        },
      });

      const fifoTransaction = await recordInitialFifoIn(tx, {
        fifoLayerId: layer.fifoLayerId,
        inventoryMovementId: movement.inventoryMovementId,
        quantity: parentQty,
        unitCost: baseUnitCost,
        totalCost: detail.subtotal,
        createdBy: userId,
      });

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`INVENTORY_STOCK:${parentUnit.productUnitId.toString()}`}))`;
      const stock = await tx.inventoryStock.findFirst({
        where: { productUnitId: parentUnit.productUnitId },
      });
      const savedStock = stock
        ? await tx.inventoryStock.update({
            where: { inventoryStockId: stock.inventoryStockId },
            data: {
              actualQty: { increment: parentQty },
              availableQty: { increment: parentQty },
              updatedAt: now,
            },
          })
        : await tx.inventoryStock.create({
            data: {
              productId: parentUnit.productId,
              productUnitId: parentUnit.productUnitId,
              actualQty: parentQty,
              availableQty: parentQty,
              updatedAt: now,
            },
          });
      await writeAuditLog(tx, {
        userId,
        transactionId,
        module: 'INVENTORY',
        operation: AUDIT_OPERATIONS.CREATE,
        entityType: 'INVENTORY_MOVEMENT',
        entityId: movement.inventoryMovementId,
        entityNumber: invoice.purchaseInvoiceNumber,
        source: 'Created via Purchase Invoice',
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
        entityId: layer.fifoLayerId,
        entityNumber: layer.fifoLayerNumber,
        source: 'Created via Purchase Invoice',
        changedFields: changedFields(null, layer, [
          'fifoLayerNumber',
          'productUnitId',
          'originType',
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
        entityNumber: layer.fifoLayerNumber,
        source: 'Created via Purchase Invoice',
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
        operation: stock ? AUDIT_OPERATIONS.UPDATE : AUDIT_OPERATIONS.CREATE,
        entityType: 'INVENTORY_STOCK',
        entityId: savedStock.inventoryStockId,
        entityNumber: invoice.purchaseInvoiceNumber,
        source: 'Updated via Purchase Invoice',
        changedFields: changedFields(stock, savedStock, [
          'productId',
          'productUnitId',
          'actualQty',
          'availableQty',
        ]),
      });
    }
  }

  // FIX: Menggunakan tipe gabungan (PurchasePaymentDto | AddInvoicePaymentDto) agar parameter paymentDate aman
  private async _processFinance(
    tx: Prisma.TransactionClient,
    invoice: CreatedInvoiceWithDetails,
    payments: (PurchasePaymentDto | AddInvoicePaymentDto)[],
    userId: bigint,
    now: Date,
    transactionId: string,
  ) {
    if (payments && payments.length > 0) {
      for (const p of payments) {
        const amt = new Prisma.Decimal(p.paymentAmount);
        const pDate =
          'paymentDate' in p && p.paymentDate ? new Date(p.paymentDate) : now;

        const payment = await tx.purchaseInvoicePayment.create({
          data: {
            purchaseInvoiceId: invoice.purchaseInvoiceId,
            financialAccountId: BigInt(p.financialAccountId),
            paymentAmount: amt,
            paymentMethod: p.paymentMethod,
            paymentDate: pDate,
            referenceNumber: p.referenceNumber,
            createdBy: userId,
          },
        });
        const accountBefore = await tx.financialAccount.findUniqueOrThrow({
          where: { financialAccountId: BigInt(p.financialAccountId) },
        });
        const accountAfter = await tx.financialAccount.update({
          where: { financialAccountId: BigInt(p.financialAccountId) },
          data: {
            currentBalance: { decrement: amt },
            updatedBy: userId,
            updatedAt: now,
          },
        });
        const transactionNumber = await this.generateFinancialTransactionNumber(
          tx,
          BigInt(p.financialAccountId),
        );
        const accountTransaction = await tx.financialAccountTransaction.create({
          data: {
            transactionNumber,
            financialAccountId: BigInt(p.financialAccountId),
            transactionType: 'PURCHASE_PAYMENT',
            paymentMethod: p.paymentMethod,
            direction: 'OUT',
            amount: amt,
            referenceType: 'PURCHASE_INVOICE',
            referenceId: invoice.purchaseInvoiceId,
            transactionDate: now,
            createdBy: userId,
          },
        });
        await writeAuditLog(tx, {
          userId,
          transactionId,
          module: 'PURCHASE',
          operation: AUDIT_OPERATIONS.CREATE,
          entityType: 'PURCHASE_INVOICE_PAYMENT',
          entityId: payment.purchasePaymentId,
          entityNumber: invoice.purchaseInvoiceNumber,
          source: 'Created via Purchase Invoice',
          changedFields: changedFields(null, payment, [
            'financialAccountId',
            'paymentAmount',
            'paymentMethod',
            'paymentDate',
            'referenceNumber',
          ]),
        });
        await writeAuditLog(tx, {
          userId,
          transactionId,
          module: 'FINANCIAL',
          operation: AUDIT_OPERATIONS.UPDATE,
          entityType: 'FINANCIAL_ACCOUNT',
          entityId: accountAfter.financialAccountId,
          entityNumber: invoice.purchaseInvoiceNumber,
          source: 'Updated via Purchase Invoice',
          changedFields: changedFields(accountBefore, accountAfter, [
            'currentBalance',
          ]),
        });
        await writeAuditLog(tx, {
          userId,
          transactionId,
          module: 'FINANCIAL',
          operation: AUDIT_OPERATIONS.CREATE,
          entityType: 'FINANCIAL_ACCOUNT_TRANSACTION',
          entityId: accountTransaction.financialAccountTransactionId,
          entityNumber: accountTransaction.transactionNumber,
          source: 'Created via Purchase Invoice',
          changedFields: changedFields(null, accountTransaction, [
            'transactionNumber',
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
    }
    if (invoice.outstandingAmount.greaterThan(0)) {
      const summaryBefore = await tx.supplierFinancialSummary.findUnique({
        where: { supplierId: invoice.supplierId },
      });
      const summaryAfter = await tx.supplierFinancialSummary.upsert({
        where: { supplierId: invoice.supplierId },
        update: {
          outstandingAmount: { increment: invoice.outstandingAmount },
          currentAmount: { increment: invoice.outstandingAmount },
          updatedAt: now,
        },
        create: {
          supplierId: invoice.supplierId,
          outstandingAmount: invoice.outstandingAmount,
          currentAmount: invoice.outstandingAmount,
          overdueAmount: 0,
          updatedAt: now,
        },
      });
      await writeAuditLog(tx, {
        userId,
        transactionId,
        module: 'PURCHASE',
        operation: summaryBefore
          ? AUDIT_OPERATIONS.UPDATE
          : AUDIT_OPERATIONS.CREATE,
        entityType: 'SUPPLIER_FINANCIAL_SUMMARY',
        entityId: summaryAfter.supplierFinancialId,
        entityNumber: invoice.purchaseInvoiceNumber,
        source: 'Updated via Purchase Invoice',
        changedFields: changedFields(summaryBefore, summaryAfter, [
          'supplierId',
          'outstandingAmount',
          'currentAmount',
          'overdueAmount',
        ]),
      });
    }
  }

  private async _processPriceHistory(
    tx: Prisma.TransactionClient,
    invoice: CreatedInvoiceWithDetails,
    action: 'MERGE' | 'REWRITE' | 'IGNORE',
    userId: bigint,
    now: Date,
    transactionId: string,
  ) {
    for (const detail of invoice.details) {
      const prodId = detail.productUnit.productId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PRODUCT_SUPPLIER:${prodId.toString()}:${invoice.supplierId.toString()}`}))`;
      const exists = await tx.productSupplier.findFirst({
        where: { productId: prodId, supplierId: invoice.supplierId },
      });
      if (!exists) {
        const productSupplier = await tx.productSupplier.create({
          data: {
            productId: prodId,
            supplierId: invoice.supplierId,
            isActive: true,
            createdBy: userId,
          },
        });
        await writeAuditLog(tx, {
          userId,
          transactionId,
          module: 'SUPPLIER',
          operation: AUDIT_OPERATIONS.CREATE,
          entityType: 'PRODUCT_SUPPLIER',
          entityId: productSupplier.productSupplierId,
          entityNumber: invoice.purchaseInvoiceNumber,
          source: 'Created via Purchase Invoice',
          changedFields: changedFields(null, productSupplier, [
            'productId',
            'supplierId',
            'isActive',
          ]),
        });
      }
    }
    if (action === 'IGNORE') return;
    if (action === 'REWRITE')
      await tx.supplierSuggestedCost.deleteMany({
        where: { supplierId: invoice.supplierId },
      });

    for (const detail of invoice.details) {
      const costBefore = await tx.supplierSuggestedCost.findUnique({
        where: {
          supplierId_productUnitId: {
            supplierId: invoice.supplierId,
            productUnitId: detail.productUnitId,
          },
        },
      });
      const costAfter = await tx.supplierSuggestedCost.upsert({
        where: {
          supplierId_productUnitId: {
            supplierId: invoice.supplierId,
            productUnitId: detail.productUnitId,
          },
        },
        update: {
          suggestedCost: detail.unitCost,
          updatedAt: now,
          updatedBy: userId,
        },
        create: {
          supplierId: invoice.supplierId,
          productUnitId: detail.productUnitId,
          suggestedCost: detail.unitCost,
          createdBy: userId,
        },
      });
      await writeAuditLog(tx, {
        userId,
        transactionId,
        module: 'PRICE',
        operation: costBefore
          ? AUDIT_OPERATIONS.UPDATE
          : AUDIT_OPERATIONS.CREATE,
        entityType: 'SUPPLIER_SUGGESTED_COST',
        entityId: costAfter.supplierCostId,
        entityNumber: invoice.purchaseInvoiceNumber,
        source: 'Updated via Purchase Invoice',
        changedFields: changedFields(costBefore, costAfter, [
          'supplierId',
          'productUnitId',
          'suggestedCost',
        ]),
      });
    }
  }

  private async _processPO(
    tx: Prisma.TransactionClient,
    poId: bigint,
    userId: bigint,
    now: Date,
    transactionId: string,
    invoiceNumber: string,
  ) {
    const before = await tx.purchaseOrder.findUniqueOrThrow({
      where: { purchaseOrderId: poId },
    });
    const after = await tx.purchaseOrder.update({
      where: { purchaseOrderId: poId },
      data: {
        status: PurchaseOrderStatus.COMPLETED,
        updatedBy: userId,
        updatedAt: now,
      },
    });
    await writeAuditLog(tx, {
      userId,
      transactionId,
      module: 'PURCHASE',
      operation: AUDIT_OPERATIONS.UPDATE,
      entityType: 'PURCHASE_ORDER',
      entityId: poId,
      entityNumber: before.purchaseOrderNumber,
      source: `Completed via Purchase Invoice ${invoiceNumber}`,
      changedFields: changedFields(before, after, ['status']),
    });
  }

  private async _processLogs(
    tx: Prisma.TransactionClient,
    invoice: CreatedInvoiceWithDetails,
    dto: CreatePurchaseInvoiceDto | UpdatePurchaseInvoiceDto,
    userId: bigint,
    now: Date,
    method: 'CREATE' | 'UPDATE',
    before?: Prisma.PurchaseInvoiceGetPayload<{ include: { details: true } }>,
    transactionId = createAuditTransactionId(),
  ) {
    const actionDesc =
      dto.status === 'COMPLETED' ? 'Menyelesaikan' : 'Membuat Draft';
    await tx.activityLog.create({
      data: {
        userId,
        activityType:
          method === 'CREATE' ? ACTIVITY_TYPES.CREATE : ACTIVITY_TYPES.UPDATE,
        module: 'PURCHASE',
        entityType: 'PURCHASE_INVOICE',
        entityId: invoice.purchaseInvoiceId,
        entityNumber: invoice.purchaseInvoiceNumber,
        description: `${actionDesc} Purchase Invoice: ${invoice.purchaseInvoiceNumber}`,
        createdAt: now,
      },
    });
    await writeAuditLog(tx, {
      userId,
      transactionId,
      module: 'PURCHASE',
      operation:
        method === 'CREATE' ? AUDIT_OPERATIONS.CREATE : AUDIT_OPERATIONS.UPDATE,
      entityType: 'PURCHASE_INVOICE',
      entityId: invoice.purchaseInvoiceId,
      entityNumber: invoice.purchaseInvoiceNumber,
      source:
        method === 'CREATE'
          ? 'Created via Purchase Invoice'
          : 'Updated via Purchase Invoice',
      changedFields: changedFields(before ?? null, invoice, [
        'purchaseInvoiceNumber',
        'supplierId',
        'purchaseOrderId',
        'invoiceDate',
        'dueDate',
        'invoiceTotal',
        'discountAmount',
        'statusPayment',
        'paidAmount',
        'outstandingAmount',
        'status',
        'note',
      ]),
    });
    for (const detail of before?.details ?? []) {
      await writeAuditLog(tx, {
        userId,
        transactionId,
        module: 'PURCHASE',
        operation: AUDIT_OPERATIONS.DELETE,
        entityType: 'PURCHASE_INVOICE_DETAIL',
        entityId: detail.purchaseInvoiceDetailId,
        entityNumber: invoice.purchaseInvoiceNumber,
        source: 'Replaced via Purchase Invoice Update',
        changedFields: changedFields(detail, null, [
          'productUnitId',
          'quantity',
          'unitCost',
          'subtotal',
          'note',
        ]),
      });
    }
    for (const detail of invoice.details) {
      await writeAuditLog(tx, {
        userId,
        transactionId,
        module: 'PURCHASE',
        operation: AUDIT_OPERATIONS.CREATE,
        entityType: 'PURCHASE_INVOICE_DETAIL',
        entityId: detail.purchaseInvoiceDetailId,
        entityNumber: invoice.purchaseInvoiceNumber,
        source:
          method === 'CREATE'
            ? 'Created via Purchase Invoice'
            : 'Replaced via Purchase Invoice Update',
        changedFields: changedFields(null, detail, [
          'productUnitId',
          'quantity',
          'unitCost',
          'subtotal',
          'note',
        ]),
      });
    }
  }
}
