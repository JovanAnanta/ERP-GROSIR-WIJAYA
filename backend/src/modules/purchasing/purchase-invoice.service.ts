import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  CreatePurchaseInvoiceDto,
  UpdatePurchaseInvoiceDto,
  AddInvoicePaymentDto,
  PurchasePaymentDto,
} from './dto/purchasing.dto.js';
import {
  Prisma,
  PurchaseInvoicePaymentStatus,
  PurchaseOrderStatus,
} from '../../../generated/prisma/client.js';

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

      let totalPaid = new Prisma.Decimal(0);
      if (dto.status === 'COMPLETED' && dto.payments) {
        for (const p of dto.payments)
          totalPaid = totalPaid.add(new Prisma.Decimal(p.paymentAmount));
      }

      const invoiceTotal = new Prisma.Decimal(dto.invoiceTotal);
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
      );

      if (dto.status === 'COMPLETED') {
        await this._processInventory(tx, invoice, userId, now);
        await this._processFinance(
          tx,
          invoice,
          dto.payments || [],
          userId,
          now,
        );
        if (poId) await this._processPO(tx, poId, userId, now);
      }

      await this._processLogs(tx, invoice, dto, userId, now, 'CREATE');
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

      await tx.purchaseInvoiceDetail.deleteMany({
        where: { purchaseInvoiceId: id },
      });

      let totalPaid = new Prisma.Decimal(0);
      if (dto.status === 'COMPLETED' && dto.payments) {
        for (const p of dto.payments)
          totalPaid = totalPaid.add(new Prisma.Decimal(p.paymentAmount));
      }

      const invoiceTotal = new Prisma.Decimal(dto.invoiceTotal);
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
      );

      if (dto.status === 'COMPLETED') {
        await this._processInventory(tx, updated, userId, now);
        await this._processFinance(
          tx,
          updated,
          dto.payments || [],
          userId,
          now,
        );
        if (poId) await this._processPO(tx, poId, userId, now);
      }

      await this._processLogs(tx, updated, dto, userId, now, 'UPDATE');
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

      if (payAmt.greaterThan(invoice.outstandingAmount)) {
        throw new HttpException(
          'Nominal pembayaran melebihi sisa hutang',
          HttpStatus.BAD_REQUEST,
        );
      }

      await tx.purchaseInvoicePayment.create({
        data: {
          purchaseInvoiceId: id,
          financialAccountId: BigInt(dto.financialAccountId),
          paymentAmount: payAmt,
          paymentMethod: dto.paymentMethod,
          paymentDate: new Date(dto.paymentDate),
          referenceNumber: dto.referenceNumber,
          note: dto.note,
          createdBy: userId,
        },
      });

      await tx.financialAccount.update({
        where: { financialAccountId: BigInt(dto.financialAccountId) },
        data: {
          currentBalance: { decrement: payAmt },
          updatedBy: userId,
          updatedAt: now,
        },
      });

      await tx.financialAccountTransaction.create({
        data: {
          transactionNumber: `FAT-${Date.now()}-${dto.financialAccountId}`,
          financialAccountId: BigInt(dto.financialAccountId),
          transactionType: 'PURCHASE_PAYMENT',
          direction: 'OUT',
          amount: payAmt,
          referenceType: 'PURCHASE_INVOICE',
          referenceId: id,
          transactionDate: now,
          note: dto.note,
          createdBy: userId,
        },
      });

      await tx.supplierFinancialSummary.update({
        where: { supplierId: invoice.supplierId },
        data: {
          outstandingAmount: { decrement: payAmt },
          currentAmount: { decrement: payAmt },
          updatedAt: now,
        },
      });

      const newPaidAmount = invoice.paidAmount.add(payAmt);
      const newOutstanding = invoice.outstandingAmount.sub(payAmt);
      const newStatusPayment = newOutstanding.equals(0)
        ? PurchaseInvoicePaymentStatus.PAID
        : PurchaseInvoicePaymentStatus.PARTIAL;

      await tx.purchaseInvoice.update({
        where: { purchaseInvoiceId: id },
        data: {
          paidAmount: newPaidAmount,
          outstandingAmount: newOutstanding,
          statusPayment: newStatusPayment,
          updatedBy: userId,
          updatedAt: now,
        },
      });

      await tx.activityLog.create({
        data: {
          userId,
          activityType: 'PAYMENT_PI',
          entityType: 'PURCHASE_INVOICE',
          entityId: id,
          entityNumber: invoice.purchaseInvoiceNumber,
          description: `Pembayaran ${newStatusPayment} sebesar Rp ${payAmt.toString()} untuk Faktur ${invoice.purchaseInvoiceNumber}`,
          createdAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'PAYMENT',
          entityType: 'PURCHASE_INVOICE',
          entityId: id,
          entityNumber: invoice.purchaseInvoiceNumber,
          changedFields: JSON.stringify(dto),
          reason: `Update Payment dari Dashboard`,
          createdAt: now,
        },
      });

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

  async findAll(supplierId?: string, tab?: 'ACTIVE' | 'COMPLETED') {
    const whereClause: Prisma.PurchaseInvoiceWhereInput = {};
    if (supplierId) whereClause.supplierId = BigInt(supplierId);

    if (tab === 'ACTIVE') {
      whereClause.OR = [
        { status: 'DRAFT' },
        { status: 'COMPLETED', statusPayment: { in: ['UNPAID', 'PARTIAL'] } },
      ];
    } else if (tab === 'COMPLETED') {
      whereClause.status = 'COMPLETED';
      whereClause.statusPayment = 'PAID';
    }

    const data = await this.prisma.purchaseInvoice.findMany({
      where: whereClause,
      include: { supplier: { select: { supplierName: true } } },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });

    return data.map((d) => ({
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
    }));
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

      const multiplier = selectedUnit.conversionFactor.div(
        parentUnit.conversionFactor,
      );
      const parentQty = detail.quantity.mul(multiplier);

      const movement = await tx.inventoryMovement.create({
        data: {
          movementNumber: `MOV-IN-${Date.now()}-${detail.purchaseInvoiceDetailId}`,
          productUnitId: parentUnit.productUnitId,
          direction: 'IN',
          quantity: parentQty,
          movementType: 'PURCHASE_INVOICE',
          originType: 'PURCHASE_INVOICE_DETAIL',
          originId: detail.purchaseInvoiceDetailId,
          movementDate: now,
          createdBy: userId,
        },
      });

      await tx.fifoLayer.create({
        data: {
          fifoLayerNumber: `FIFO-${Date.now()}-${detail.purchaseInvoiceDetailId}`,
          productUnitId: parentUnit.productUnitId,
          originType: 'PURCHASE',
          originInventoryMovementId: movement.inventoryMovementId,
          originId: detail.purchaseInvoiceDetailId,
          originalQty: parentQty,
          remainingQty: parentQty,
          unitCost: detail.unitCost,
          originalCost: detail.subtotal,
          remainingCost: detail.subtotal,
          createdBy: userId,
        },
      });

      const stock = await tx.inventoryStock.findFirst({
        where: { productUnitId: parentUnit.productUnitId },
      });
      if (stock) {
        await tx.inventoryStock.update({
          where: { inventoryStockId: stock.inventoryStockId },
          data: {
            actualQty: { increment: parentQty },
            availableQty: { increment: parentQty },
            updatedAt: now,
          },
        });
      } else {
        await tx.inventoryStock.create({
          data: {
            productId: parentUnit.productId,
            productUnitId: parentUnit.productUnitId,
            actualQty: parentQty,
            availableQty: parentQty,
            updatedAt: now,
          },
        });
      }
    }
  }

  // FIX: Menggunakan tipe gabungan (PurchasePaymentDto | AddInvoicePaymentDto) agar parameter paymentDate aman
  private async _processFinance(
    tx: Prisma.TransactionClient,
    invoice: CreatedInvoiceWithDetails,
    payments: (PurchasePaymentDto | AddInvoicePaymentDto)[],
    userId: bigint,
    now: Date,
  ) {
    if (payments && payments.length > 0) {
      for (const p of payments) {
        const amt = new Prisma.Decimal(p.paymentAmount);
        const pDate =
          'paymentDate' in p && p.paymentDate ? new Date(p.paymentDate) : now;

        await tx.purchaseInvoicePayment.create({
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
        await tx.financialAccount.update({
          where: { financialAccountId: BigInt(p.financialAccountId) },
          data: {
            currentBalance: { decrement: amt },
            updatedBy: userId,
            updatedAt: now,
          },
        });
        await tx.financialAccountTransaction.create({
          data: {
            transactionNumber: `FAT-${Date.now()}-${p.financialAccountId}`,
            financialAccountId: BigInt(p.financialAccountId),
            transactionType: 'PURCHASE_PAYMENT',
            direction: 'OUT',
            amount: amt,
            referenceType: 'PURCHASE_INVOICE',
            referenceId: invoice.purchaseInvoiceId,
            transactionDate: now,
            createdBy: userId,
          },
        });
      }
    }
    if (invoice.outstandingAmount.greaterThan(0)) {
      await tx.supplierFinancialSummary.upsert({
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
    }
  }

  private async _processPriceHistory(
    tx: Prisma.TransactionClient,
    invoice: CreatedInvoiceWithDetails,
    action: 'MERGE' | 'REWRITE' | 'IGNORE',
    userId: bigint,
    now: Date,
  ) {
    for (const detail of invoice.details) {
      const prodId = detail.productUnit.productId;
      const exists = await tx.productSupplier.findFirst({
        where: { productId: prodId, supplierId: invoice.supplierId },
      });
      if (!exists)
        await tx.productSupplier.create({
          data: {
            productId: prodId,
            supplierId: invoice.supplierId,
            isActive: true,
            createdBy: userId,
          },
        });
    }
    if (action === 'IGNORE') return;
    if (action === 'REWRITE')
      await tx.supplierSuggestedCost.deleteMany({
        where: { supplierId: invoice.supplierId },
      });

    for (const detail of invoice.details) {
      await tx.supplierSuggestedCost.upsert({
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
    }
  }

  private async _processPO(
    tx: Prisma.TransactionClient,
    poId: bigint,
    userId: bigint,
    now: Date,
  ) {
    await tx.purchaseOrder.update({
      where: { purchaseOrderId: poId },
      data: {
        status: PurchaseOrderStatus.COMPLETED,
        updatedBy: userId,
        updatedAt: now,
      },
    });
  }

  private async _processLogs(
    tx: Prisma.TransactionClient,
    invoice: CreatedInvoiceWithDetails,
    dto: CreatePurchaseInvoiceDto | UpdatePurchaseInvoiceDto,
    userId: bigint,
    now: Date,
    method: 'CREATE' | 'UPDATE',
  ) {
    const actionDesc =
      dto.status === 'COMPLETED' ? 'Menyelesaikan' : 'Membuat Draft';
    await tx.activityLog.create({
      data: {
        userId,
        activityType: `${method}_PI`,
        entityType: 'PURCHASE_INVOICE',
        entityId: invoice.purchaseInvoiceId,
        entityNumber: invoice.purchaseInvoiceNumber,
        description: `${actionDesc} Purchase Invoice: ${invoice.purchaseInvoiceNumber}`,
        createdAt: now,
      },
    });
    await tx.auditLog.create({
      data: {
        userId,
        action: method,
        entityType: 'PURCHASE_INVOICE',
        entityId: invoice.purchaseInvoiceId,
        entityNumber: invoice.purchaseInvoiceNumber,
        changedFields: JSON.stringify(dto),
        reason: `Generated via Purchasing Module`,
        createdAt: now,
      },
    });
  }
}
