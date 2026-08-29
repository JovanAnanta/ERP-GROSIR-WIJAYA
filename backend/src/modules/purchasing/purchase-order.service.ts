import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  CreatePurchaseOrderDto,
  PurchaseOrderListQueryDto,
  UpdatePurchaseOrderDto,
} from './dto/purchasing.dto.js';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  ACTIVITY_TYPES,
  AUDIT_OPERATIONS,
  changedFields,
  createAuditTransactionId,
  writeAuditLog,
} from '../../common/logging/business-logger.js';

@Injectable()
export class PurchaseOrderService {
  constructor(private readonly prisma: PrismaService) {}

  private async validateReferences(
    tx: Prisma.TransactionClient,
    dto: CreatePurchaseOrderDto | UpdatePurchaseOrderDto,
  ): Promise<void> {
    const supplier = await tx.supplier.findUnique({
      where: { supplierId: BigInt(dto.supplierId) },
      select: { isActive: true },
    });
    if (!supplier?.isActive) {
      throw new HttpException(
        'Supplier tidak valid atau tidak aktif',
        HttpStatus.BAD_REQUEST,
      );
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
  }

  private async generatePONumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const dateStr = `${day}${month}${year}`;
    const prefix = `PO-${dateStr}-`;

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PO:${prefix}`}))`;

    const lastOrder = await tx.purchaseOrder.findFirst({
      where: { purchaseOrderNumber: { startsWith: prefix } },
      orderBy: { purchaseOrderNumber: 'desc' },
    });

    let nextSequence = 1;
    if (lastOrder) {
      const parts = lastOrder.purchaseOrderNumber.split('-');
      const lastSeqStr = parts[2];
      if (lastSeqStr) nextSequence = parseInt(lastSeqStr, 10) + 1;
    }
    return `${prefix}${String(nextSequence).padStart(7, '0')}`;
  }

  async create(userId: bigint, dto: CreatePurchaseOrderDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new HttpException(
        'Item PO tidak boleh kosong',
        HttpStatus.BAD_REQUEST,
      );
    }

    return await this.prisma.$transaction(async (tx) => {
      await this.validateReferences(tx, dto);
      const poNumber = await this.generatePONumber(tx);
      const now = new Date();

      const order = await tx.purchaseOrder.create({
        data: {
          purchaseOrderNumber: poNumber,
          supplierId: BigInt(dto.supplierId),
          orderDate: now,
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
          status: dto.status,
          note: dto.note,
          createdBy: userId,
          details: {
            create: dto.items.map((i) => ({
              productUnitId: BigInt(i.productUnitId),
              quantity: i.quantity,
              note: i.note,
            })),
          },
        },
        include: { details: true },
      });
      const transactionId = createAuditTransactionId();

      await tx.activityLog.create({
        data: {
          userId,
          activityType: ACTIVITY_TYPES.CREATE,
          module: 'PURCHASE',
          entityType: 'PURCHASE_ORDER',
          entityId: order.purchaseOrderId,
          entityNumber: poNumber,
          description: `Membuat Purchase Order: ${poNumber}`,
          createdAt: now,
        },
      });
      await writeAuditLog(tx, {
        userId,
        transactionId,
        module: 'PURCHASE',
        operation: AUDIT_OPERATIONS.CREATE,
        entityType: 'PURCHASE_ORDER',
        entityId: order.purchaseOrderId,
        entityNumber: poNumber,
        source: 'Created via Purchase Order',
        changedFields: changedFields(null, order, [
          'purchaseOrderNumber',
          'supplierId',
          'orderDate',
          'expectedDate',
          'status',
          'note',
        ]),
      });
      for (const detail of order.details) {
        await writeAuditLog(tx, {
          userId,
          transactionId,
          module: 'PURCHASE',
          operation: AUDIT_OPERATIONS.CREATE,
          entityType: 'PURCHASE_ORDER_DETAIL',
          entityId: detail.purchaseOrderDetailId,
          entityNumber: poNumber,
          source: 'Created via Purchase Order',
          changedFields: changedFields(null, detail, [
            'productUnitId',
            'quantity',
            'note',
          ]),
        });
      }

      return order;
    });
  }

  async update(userId: bigint, poId: string, dto: UpdatePurchaseOrderDto) {
    const id = BigInt(poId);

    return await this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<
        Array<{ purchase_order_id: bigint }>
      >`
        SELECT purchase_order_id
        FROM purchase_order
        WHERE purchase_order_id = ${id}
        FOR UPDATE
      `;
      if (lockedRows.length === 0) {
        throw new HttpException(
          'Purchase Order tidak ditemukan',
          HttpStatus.NOT_FOUND,
        );
      }

      const existing = await tx.purchaseOrder.findUnique({
        where: { purchaseOrderId: id },
        include: { details: true },
      });
      if (!existing)
        throw new HttpException(
          'Purchase Order tidak ditemukan',
          HttpStatus.NOT_FOUND,
        );

      if (!['DRAFT', 'READY'].includes(existing.status)) {
        throw new HttpException(
          'Purchase Order yang sudah selesai atau dibatalkan tidak dapat diubah.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const now = new Date();

      await this.validateReferences(tx, dto);

      await tx.purchaseOrderDetail.deleteMany({
        where: { purchaseOrderId: id },
      });

      const updated = await tx.purchaseOrder.update({
        where: { purchaseOrderId: id },
        data: {
          supplierId: BigInt(dto.supplierId),
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
          status: dto.status,
          note: dto.note,
          updatedBy: userId,
          updatedAt: now,
          details: {
            create: dto.items.map((i) => ({
              productUnitId: BigInt(i.productUnitId),
              quantity: i.quantity,
              note: i.note,
            })),
          },
        },
        include: { details: true },
      });
      const transactionId = createAuditTransactionId();

      await tx.activityLog.create({
        data: {
          userId,
          activityType: ACTIVITY_TYPES.UPDATE,
          module: 'PURCHASE',
          entityType: 'PURCHASE_ORDER',
          entityId: id,
          entityNumber: existing.purchaseOrderNumber,
          description: `Memperbarui Purchase Order: ${existing.purchaseOrderNumber}`,
          createdAt: now,
        },
      });
      await writeAuditLog(tx, {
        userId,
        transactionId,
        module: 'PURCHASE',
        operation: AUDIT_OPERATIONS.UPDATE,
        entityType: 'PURCHASE_ORDER',
        entityId: id,
        entityNumber: existing.purchaseOrderNumber,
        source: 'Updated via Purchase Order',
        changedFields: changedFields(existing, updated, [
          'supplierId',
          'expectedDate',
          'status',
          'note',
        ]),
      });
      for (const detail of existing.details) {
        await writeAuditLog(tx, {
          userId,
          transactionId,
          module: 'PURCHASE',
          operation: AUDIT_OPERATIONS.DELETE,
          entityType: 'PURCHASE_ORDER_DETAIL',
          entityId: detail.purchaseOrderDetailId,
          entityNumber: existing.purchaseOrderNumber,
          source: 'Replaced via Purchase Order Update',
          changedFields: changedFields(detail, null, [
            'productUnitId',
            'quantity',
            'note',
          ]),
        });
      }
      for (const detail of updated.details) {
        await writeAuditLog(tx, {
          userId,
          transactionId,
          module: 'PURCHASE',
          operation: AUDIT_OPERATIONS.CREATE,
          entityType: 'PURCHASE_ORDER_DETAIL',
          entityId: detail.purchaseOrderDetailId,
          entityNumber: existing.purchaseOrderNumber,
          source: 'Replaced via Purchase Order Update',
          changedFields: changedFields(null, detail, [
            'productUnitId',
            'quantity',
            'note',
          ]),
        });
      }

      return updated;
    });
  }

  async findAll(query: PurchaseOrderListQueryDto) {
    const page = parseInt(query.page ?? '1', 10);
    const limit = parseInt(query.limit ?? '20', 10);
    const skip = (page - 1) * limit;
    const whereClause: Prisma.PurchaseOrderWhereInput = {};
    if (query.supplierId) {
      whereClause.supplierId = BigInt(query.supplierId);
    }
    if (query.tab === 'ACTIVE') {
      whereClause.status = { in: ['DRAFT', 'READY'] };
    } else if (query.tab === 'HISTORY') {
      whereClause.status = { in: ['COMPLETED', 'CANCELLED'] };
    }

    const total = await this.prisma.purchaseOrder.count({
      where: whereClause,
    });
    const data = await this.prisma.purchaseOrder.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy:
        query.tab === 'HISTORY'
          ? [{ createdAt: 'desc' }]
          : [
              { expectedDate: { sort: 'asc', nulls: 'last' } },
              { createdAt: 'desc' },
            ],
      include: {
        supplier: { select: { supplierName: true } },
        createdByUser: { select: { fullName: true } },
        updatedByUser: { select: { fullName: true } },
        details: {
          include: {
            productUnit: { include: { product: true, unit: true } },
          },
        },
      },
    });

    const mappedData = data.map((o) => ({
      ...o,
      purchaseOrderId: o.purchaseOrderId.toString(),
      supplierId: o.supplierId.toString(),
      supplierName: o.supplier.supplierName,
      createdBy: o.createdBy.toString(),
      updatedBy: o.updatedBy?.toString() || null,
      createdByName: o.createdByUser.fullName,
      updatedByName: o.updatedByUser?.fullName || null,
      totalItem: o.details.length,
      totalQuantity: o.details.reduce(
        (sum, detail) => sum + Number(detail.quantity),
        0,
      ),
      details: o.details.map((d) => ({
        ...d,
        purchaseOrderDetailId: d.purchaseOrderDetailId.toString(),
        purchaseOrderId: d.purchaseOrderId.toString(),
        productUnitId: d.productUnitId.toString(),
        productId: d.productUnit.productId.toString(),
        quantity: Number(d.quantity),
        productName: d.productUnit.product.productName,
        unitName: d.productUnit.unit.unitName,
      })),
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
    const data = await this.prisma.purchaseOrder.findUnique({
      where: { purchaseOrderId: BigInt(id) },
      include: {
        supplier: true,
        createdByUser: { select: { fullName: true } },
        updatedByUser: { select: { fullName: true } },
        purchaseInvoices: {
          select: {
            purchaseInvoiceId: true,
            purchaseInvoiceNumber: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        details: {
          include: { productUnit: { include: { product: true, unit: true } } },
        },
      },
    });

    if (!data) {
      throw new HttpException(
        'Purchase Order tidak ditemukan',
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      ...data,
      purchaseOrderId: data.purchaseOrderId.toString(),
      supplierId: data.supplierId.toString(),
      createdBy: data.createdBy.toString(),
      updatedBy: data.updatedBy?.toString() || null,
      createdByName: data.createdByUser.fullName,
      updatedByName: data.updatedByUser?.fullName || null,
      supplierName: data.supplier.supplierName,
      supplierPhone: data.supplier.phone,
      supplierEmail: data.supplier.email,
      supplierAddress: data.supplier.address,
      supplierPicName: data.supplier.picName,
      totalItem: data.details.length,
      totalQuantity: data.details.reduce(
        (sum, detail) => sum + Number(detail.quantity),
        0,
      ),
      details: data.details.map((detail) => ({
        purchaseOrderDetailId: detail.purchaseOrderDetailId.toString(),
        productUnitId: detail.productUnitId.toString(),
        productId: detail.productUnit.productId.toString(),
        productName: detail.productUnit.product.productName,
        unitName: detail.productUnit.unit.unitName,
        quantity: Number(detail.quantity),
        note: detail.note,
      })),
      purchaseInvoices: data.purchaseInvoices.map((invoice) => ({
        ...invoice,
        purchaseInvoiceId: invoice.purchaseInvoiceId.toString(),
      })),
    };
  }
}
