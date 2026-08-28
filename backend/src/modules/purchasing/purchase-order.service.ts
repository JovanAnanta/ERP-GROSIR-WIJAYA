import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchasing.dto.js';
import { Prisma } from '../../../generated/prisma/client.js';

@Injectable()
export class PurchaseOrderService {
  constructor(private readonly prisma: PrismaService) {}

  private async generatePONumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const dateStr = `${day}${month}${year}`;
    const prefix = `PO-${dateStr}-`;

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

      await tx.activityLog.create({
        data: {
          userId,
          activityType: 'CREATE_PO',
          entityType: 'PURCHASE_ORDER',
          entityId: order.purchaseOrderId,
          description: `Membuat Purchase Order: ${poNumber}`,
          createdAt: now,
        },
      });

      return order;
    });
  }

  async update(userId: bigint, poId: string, dto: UpdatePurchaseOrderDto) {
    const id = BigInt(poId);

    return await this.prisma.$transaction(async (tx) => {
      const existing = await tx.purchaseOrder.findUnique({
        where: { purchaseOrderId: id },
      });
      if (!existing)
        throw new HttpException(
          'Purchase Order tidak ditemukan',
          HttpStatus.NOT_FOUND,
        );

      if (existing.status !== 'DRAFT') {
        throw new HttpException(
          'Purchase Order yang sudah siap (Ready) tidak dapat diubah.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const now = new Date();

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

      await tx.activityLog.create({
        data: {
          userId,
          activityType: 'UPDATE_PO',
          entityType: 'PURCHASE_ORDER',
          entityId: id,
          description: `Memperbarui Purchase Order: ${existing.purchaseOrderNumber}`,
          createdAt: now,
        },
      });

      return updated;
    });
  }

  // =========================================================================
  // PERBAIKAN: Menambahkan dukungan Filter `supplierId` untuk Card Layout
  // =========================================================================
  async findAll(supplierId?: string) {
    const whereClause: Prisma.PurchaseOrderWhereInput = {};
    if (supplierId) whereClause.supplierId = BigInt(supplierId);

    const data = await this.prisma.purchaseOrder.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: { select: { supplierName: true } },
        details: {
          include: { productUnit: { include: { product: true, unit: true } } },
        },
      },
    });

    return data.map((o) => ({
      ...o,
      purchaseOrderId: o.purchaseOrderId.toString(),
      supplierId: o.supplierId.toString(),
      createdBy: o.createdBy.toString(),
      updatedBy: o.updatedBy?.toString() || null,
      details: o.details.map((d) => ({
        ...d,
        purchaseOrderDetailId: d.purchaseOrderDetailId.toString(),
        purchaseOrderId: d.purchaseOrderId.toString(),
        productUnitId: d.productUnitId.toString(),
        quantity: Number(d.quantity),
        productName: d.productUnit.product.productName,
        unitName: d.productUnit.unit.unitName,
      })),
    }));
  }
}
