import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { INVENTORY_ORIGIN_TYPES } from '../../common/inventory/inventory-origin.js';
import {
  calculateUnitCosts,
  formatStockQuantity,
} from '../inventory/inventory-display.utils.js';
import { effectiveRemainingUnitCost } from '../purchasing/fifo-cost.utils.js';
import type {
  FifoLayerListQueryDto,
  FifoTimelineQueryDto,
} from './dto/fifo.dto.js';

function toApiValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Prisma.Decimal) return Number(value);
  if (Array.isArray(value)) return value.map(toApiValue);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        toApiValue(item),
      ]),
    );
  }
  return value;
}

type OriginReference = { originType: string; originId: bigint };
type OriginSummary = {
  type: string;
  id: string;
  number: string;
  status?: string;
  partyName?: string | null;
  date?: Date;
  detailAvailable: boolean;
};

@Injectable()
export class FifoService {
  constructor(private readonly prisma: PrismaService) {}

  async getFilters() {
    const [products, categories, brands, suppliers] = await Promise.all([
      this.prisma.product.findMany({
        where: { isActive: true, productUnits: { some: { isParent: true } } },
        select: { productId: true, productName: true },
        orderBy: { productName: 'asc' },
      }),
      this.prisma.category.findMany({
        where: { isActive: true },
        select: { categoryId: true, categoryName: true },
        orderBy: { categoryName: 'asc' },
      }),
      this.prisma.brand.findMany({
        where: { isActive: true },
        select: { brandId: true, brandName: true },
        orderBy: { brandName: 'asc' },
      }),
      this.prisma.supplier.findMany({
        where: { isActive: true },
        select: { supplierId: true, supplierName: true },
        orderBy: { supplierName: 'asc' },
      }),
    ]);
    return toApiValue({
      products,
      categories,
      brands,
      suppliers,
      originTypes: Object.values(INVENTORY_ORIGIN_TYPES),
    });
  }

  private layerSql(query: FifoLayerListQueryDto, activeOnly: boolean) {
    const search = query.search?.trim();
    const status = activeOnly ? 'ACTIVE' : (query.status ?? 'ALL');
    return Prisma.sql`
      FROM fifo_layer layer
      JOIN product_unit product_unit
        ON product_unit.product_unit_id = layer.product_unit_id
      JOIN product product ON product.product_id = product_unit.product_id
      JOIN inventory_movement origin_movement
        ON origin_movement.inventory_movement_id = layer.origin_inventory_movement_id
      WHERE product_unit.is_parent = TRUE
        ${status === 'ACTIVE' ? Prisma.sql`AND layer.remaining_qty > 0` : Prisma.empty}
        ${status === 'DEPLETED' ? Prisma.sql`AND layer.remaining_qty = 0` : Prisma.empty}
        ${search ? Prisma.sql`AND (layer.fifo_layer_number ILIKE ${`%${search}%`} OR product.product_name ILIKE ${`%${search}%`} OR origin_movement.origin_number ILIKE ${`%${search}%`})` : Prisma.empty}
        ${query.productId ? Prisma.sql`AND product.product_id = ${BigInt(query.productId)}` : Prisma.empty}
        ${query.categoryId ? Prisma.sql`AND product.category_id = ${BigInt(query.categoryId)}` : Prisma.empty}
        ${query.brandId ? Prisma.sql`AND product.brand_id = ${BigInt(query.brandId)}` : Prisma.empty}
        ${query.originType ? Prisma.sql`AND layer.origin_type::text = ${query.originType}` : Prisma.empty}
        ${query.dateFrom ? Prisma.sql`AND layer.created_at >= ${new Date(`${query.dateFrom}T00:00:00`)}` : Prisma.empty}
        ${query.dateTo ? Prisma.sql`AND layer.created_at <= ${new Date(`${query.dateTo}T23:59:59.999`)}` : Prisma.empty}
        ${
          query.supplierId
            ? Prisma.sql`AND (
          (layer.origin_type::text = 'PURCHASE_INVOICE' AND EXISTS (
            SELECT 1 FROM purchase_invoice invoice
            WHERE invoice.purchase_invoice_id = layer.origin_id
              AND invoice.supplier_id = ${BigInt(query.supplierId)}
          )) OR
          (layer.origin_type::text = 'PURCHASE_RETURN' AND EXISTS (
            SELECT 1 FROM purchase_return purchase_return
            WHERE purchase_return.purchase_return_id = layer.origin_id
              AND purchase_return.supplier_id = ${BigInt(query.supplierId)}
          ))
        )`
            : Prisma.empty
        }
    `;
  }

  private async listLayersInternal(
    query: FifoLayerListQueryDto,
    activeOnly: boolean,
    defaultSort: 'OLDEST' | 'NEWEST',
  ) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const sort = query.sort ?? defaultSort;
    const whereSql = this.layerSql(query, activeOnly);
    const orderSql =
      sort === 'OLDEST'
        ? Prisma.sql`ORDER BY layer.created_at ASC, layer.fifo_layer_id ASC`
        : Prisma.sql`ORDER BY layer.created_at DESC, layer.fifo_layer_id DESC`;
    const [idRows, countRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ fifoLayerId: bigint }>>(Prisma.sql`
        SELECT layer.fifo_layer_id AS "fifoLayerId"
        ${whereSql}
        ${orderSql}
        OFFSET ${(page - 1) * limit} LIMIT ${limit}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total
        ${whereSql}
      `),
    ]);
    const ids = idRows.map((row) => row.fifoLayerId);
    const records = ids.length
      ? await this.prisma.fifoLayer.findMany({
          where: { fifoLayerId: { in: ids } },
          include: {
            productUnit: {
              include: {
                product: { include: { category: true, brand: true } },
                unit: true,
                childUnits: {
                  include: { unit: true },
                  where: { isActive: true },
                },
              },
            },
            originInventoryMovement: true,
            createdByUser: { select: { fullName: true } },
          },
        })
      : [];
    const recordMap = new Map(
      records.map((row) => [row.fifoLayerId.toString(), row]),
    );
    const ordered = ids.flatMap((id) => {
      const item = recordMap.get(id.toString());
      return item ? [item] : [];
    });
    const origins = await this.loadOriginSummaries(ordered);
    const totalData = Number(countRows[0]?.total ?? 0);
    return toApiValue({
      data: ordered.map((layer) => this.layerCard(layer, origins)),
      meta: {
        currentPage: page,
        pageSize: limit,
        totalData,
        totalPage: Math.ceil(totalData / limit),
      },
    });
  }

  listCostAnalysis(query: FifoLayerListQueryDto) {
    return this.listLayersInternal(query, true, 'OLDEST');
  }

  listHistory(query: FifoLayerListQueryDto) {
    return this.listLayersInternal(query, false, 'NEWEST');
  }

  private layerCard(
    layer: Prisma.FifoLayerGetPayload<{
      include: {
        productUnit: {
          include: {
            product: { include: { category: true; brand: true } };
            unit: true;
            childUnits: { include: { unit: true } };
          };
        };
        originInventoryMovement: true;
        createdByUser: { select: { fullName: true } };
      };
    }>,
    origins: Map<string, OriginSummary>,
  ) {
    const units = [layer.productUnit, ...layer.productUnit.childUnits];
    const originalQty = Number(layer.originalQty);
    const remainingQty = Number(layer.remainingQty);
    const consumedQty = Math.max(originalQty - remainingQty, 0);
    const parentFactor = layer.productUnit.conversionFactor;
    const effectiveUnitCost = effectiveRemainingUnitCost(
      layer.remainingCost,
      layer.remainingQty,
      layer.originalCost,
      layer.originalQty,
    );
    const origin =
      origins.get(`${layer.originType}:${layer.originId.toString()}`) ?? null;
    return {
      fifoLayerId: layer.fifoLayerId,
      fifoLayerNumber: layer.fifoLayerNumber,
      productId: layer.productUnit.productId,
      productUnitId: layer.productUnitId,
      productName: layer.productUnit.product.productName,
      categoryName: layer.productUnit.product.category.categoryName,
      brandName: layer.productUnit.product.brand?.brandName ?? null,
      parentUnitName: layer.productUnit.unit.unitName,
      originType: layer.originType,
      originId: layer.originId,
      originNumber:
        origin?.number ?? layer.originInventoryMovement.originNumber,
      origin,
      originalQty,
      consumedQty,
      remainingQty,
      originalDisplay: formatStockQuantity(originalQty, units),
      consumedDisplay: formatStockQuantity(consumedQty, units),
      remainingDisplay: formatStockQuantity(remainingQty, units),
      unitCost: Number(effectiveUnitCost),
      unitCosts: calculateUnitCosts(effectiveUnitCost, parentFactor, units),
      originalCost: Number(layer.originalCost),
      remainingCost: Number(layer.remainingCost),
      utilizationPercent:
        originalQty > 0
          ? Number(((consumedQty / originalQty) * 100).toFixed(2))
          : 0,
      status: remainingQty > 0 ? 'ACTIVE' : 'DEPLETED',
      createdAt: layer.createdAt,
      createdByName: layer.createdByUser.fullName,
    };
  }

  async getLayerDetail(id: string, query: FifoTimelineQueryDto) {
    const layer = await this.prisma.fifoLayer.findUnique({
      where: { fifoLayerId: BigInt(id) },
      include: {
        productUnit: {
          include: {
            product: { include: { category: true, brand: true } },
            unit: true,
            childUnits: { include: { unit: true }, where: { isActive: true } },
          },
        },
        originInventoryMovement: true,
        createdByUser: { select: { fullName: true } },
      },
    });
    if (!layer) {
      throw new HttpException(
        'FIFO Layer tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    }
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 50);
    const [transactions, totalData, outSummary, inSummary] = await Promise.all([
      this.prisma.fifoLayerTransaction.findMany({
        where: { fifoLayerId: layer.fifoLayerId },
        include: {
          inventoryMovement: {
            include: {
              transformationDetailLinks: {
                include: {
                  transformationDetail: {
                    include: {
                      sourceProductUnit: {
                        include: { product: true, unit: true },
                      },
                      resultProductUnit: {
                        include: { product: true, unit: true },
                      },
                    },
                  },
                },
              },
            },
          },
          createdByUser: { select: { fullName: true } },
        },
        orderBy: [{ createdAt: 'asc' }, { fifoLayerTransactionId: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.fifoLayerTransaction.count({
        where: { fifoLayerId: layer.fifoLayerId },
      }),
      this.prisma.fifoLayerTransaction.aggregate({
        where: { fifoLayerId: layer.fifoLayerId, direction: 'OUT' },
        _sum: { quantity: true, totalCost: true },
      }),
      this.prisma.fifoLayerTransaction.aggregate({
        where: { fifoLayerId: layer.fifoLayerId, direction: 'IN' },
        _sum: { quantity: true, totalCost: true },
      }),
    ]);
    const references: OriginReference[] = [
      layer,
      ...transactions.map((item) => item.inventoryMovement),
    ];
    const origins = await this.loadOriginSummaries(references);
    const card = this.layerCard(layer, origins);
    const initialIn = Number(layer.originalQty);
    const returnedQty = Math.max(
      Number(inSummary._sum.quantity ?? 0) - initialIn,
      0,
    );
    const units = [layer.productUnit, ...layer.productUnit.childUnits];
    return toApiValue({
      ...card,
      totalOutQty: Number(outSummary._sum.quantity ?? 0),
      totalOutCost: Number(outSummary._sum.totalCost ?? 0),
      returnedQty,
      returnedDisplay: formatStockQuantity(returnedQty, units),
      timeline: transactions.map((transaction) => ({
        fifoLayerTransactionId: transaction.fifoLayerTransactionId,
        direction: transaction.direction,
        quantity: transaction.quantity,
        quantityDisplay: formatStockQuantity(
          Number(transaction.quantity),
          units,
        ),
        quantityBefore: transaction.quantityBefore,
        quantityAfter: transaction.quantityAfter,
        quantityBeforeDisplay: formatStockQuantity(
          Number(transaction.quantityBefore),
          units,
        ),
        quantityAfterDisplay: formatStockQuantity(
          Number(transaction.quantityAfter),
          units,
        ),
        unitCost: transaction.quantity.greaterThan(0)
          ? transaction.totalCost.div(transaction.quantity).toDecimalPlaces(2)
          : transaction.unitCost,
        totalCost: transaction.totalCost,
        createdAt: transaction.createdAt,
        createdByName: transaction.createdByUser.fullName,
        movement: {
          inventoryMovementId:
            transaction.inventoryMovement.inventoryMovementId,
          movementNumber: transaction.inventoryMovement.movementNumber,
          movementType: transaction.inventoryMovement.movementType,
          originType: transaction.inventoryMovement.originType,
          originId: transaction.inventoryMovement.originId,
          originNumber: transaction.inventoryMovement.originNumber,
          movementDate: transaction.inventoryMovement.movementDate,
          document:
            origins.get(
              `${transaction.inventoryMovement.originType}:${transaction.inventoryMovement.originId.toString()}`,
            ) ?? null,
          transformationAllocations:
            transaction.inventoryMovement.transformationDetailLinks.map(
              (link) => ({
                role: link.movementRole,
                allocatedQuantity: link.allocatedQuantity,
                allocatedCost: link.allocatedCost,
                lineNumber: link.transformationDetail.lineNumber,
                sourceProductName:
                  link.transformationDetail.sourceProductUnit.product
                    .productName,
                sourceUnitName:
                  link.transformationDetail.sourceProductUnit.unit.unitName,
                resultProductName:
                  link.transformationDetail.resultProductUnit.product
                    .productName,
                resultUnitName:
                  link.transformationDetail.resultProductUnit.unit.unitName,
              }),
            ),
        },
      })),
      timelineMeta: {
        currentPage: page,
        pageSize: limit,
        totalData,
        totalPage: Math.ceil(totalData / limit),
      },
    });
  }

  private async loadOriginSummaries(references: OriginReference[]) {
    const idsByType = new Map<string, Set<bigint>>();
    for (const reference of references) {
      const set = idsByType.get(reference.originType) ?? new Set<bigint>();
      set.add(reference.originId);
      idsByType.set(reference.originType, set);
    }
    const ids = (type: string) => [...(idsByType.get(type) ?? [])];
    const [invoices, returns, adjustments, transformations] = await Promise.all(
      [
        ids(INVENTORY_ORIGIN_TYPES.PURCHASE_INVOICE).length
          ? this.prisma.purchaseInvoice.findMany({
              where: {
                purchaseInvoiceId: {
                  in: ids(INVENTORY_ORIGIN_TYPES.PURCHASE_INVOICE),
                },
              },
              select: {
                purchaseInvoiceId: true,
                purchaseInvoiceNumber: true,
                status: true,
                invoiceDate: true,
                supplier: { select: { supplierName: true } },
              },
            })
          : [],
        ids(INVENTORY_ORIGIN_TYPES.PURCHASE_RETURN).length
          ? this.prisma.purchaseReturn.findMany({
              where: {
                purchaseReturnId: {
                  in: ids(INVENTORY_ORIGIN_TYPES.PURCHASE_RETURN),
                },
              },
              select: {
                purchaseReturnId: true,
                purchaseReturnNumber: true,
                status: true,
                createdAt: true,
                supplier: { select: { supplierName: true } },
              },
            })
          : [],
        ids(INVENTORY_ORIGIN_TYPES.INVENTORY_ADJUSTMENT).length
          ? this.prisma.inventoryAdjustment.findMany({
              where: {
                adjustmentId: {
                  in: ids(INVENTORY_ORIGIN_TYPES.INVENTORY_ADJUSTMENT),
                },
              },
              select: {
                adjustmentId: true,
                adjustmentNumber: true,
                status: true,
                adjustmentDate: true,
              },
            })
          : [],
        ids(INVENTORY_ORIGIN_TYPES.INVENTORY_TRANSFORMATION).length
          ? this.prisma.inventoryTransformation.findMany({
              where: {
                transformationId: {
                  in: ids(INVENTORY_ORIGIN_TYPES.INVENTORY_TRANSFORMATION),
                },
              },
              select: {
                transformationId: true,
                transformationNumber: true,
                transformationDate: true,
              },
            })
          : [],
      ],
    );
    const result = new Map<string, OriginSummary>();
    invoices.forEach((item) =>
      result.set(
        `${INVENTORY_ORIGIN_TYPES.PURCHASE_INVOICE}:${item.purchaseInvoiceId.toString()}`,
        {
          type: INVENTORY_ORIGIN_TYPES.PURCHASE_INVOICE,
          id: item.purchaseInvoiceId.toString(),
          number: item.purchaseInvoiceNumber,
          status: item.status,
          partyName: item.supplier.supplierName,
          date: item.invoiceDate,
          detailAvailable: true,
        },
      ),
    );
    returns.forEach((item) =>
      result.set(
        `${INVENTORY_ORIGIN_TYPES.PURCHASE_RETURN}:${item.purchaseReturnId.toString()}`,
        {
          type: INVENTORY_ORIGIN_TYPES.PURCHASE_RETURN,
          id: item.purchaseReturnId.toString(),
          number: item.purchaseReturnNumber,
          status: item.status,
          partyName: item.supplier.supplierName,
          date: item.createdAt,
          detailAvailable: true,
        },
      ),
    );
    adjustments.forEach((item) =>
      result.set(
        `${INVENTORY_ORIGIN_TYPES.INVENTORY_ADJUSTMENT}:${item.adjustmentId.toString()}`,
        {
          type: INVENTORY_ORIGIN_TYPES.INVENTORY_ADJUSTMENT,
          id: item.adjustmentId.toString(),
          number: item.adjustmentNumber,
          status: item.status,
          date: item.adjustmentDate,
          detailAvailable: true,
        },
      ),
    );
    transformations.forEach((item) =>
      result.set(
        `${INVENTORY_ORIGIN_TYPES.INVENTORY_TRANSFORMATION}:${item.transformationId.toString()}`,
        {
          type: INVENTORY_ORIGIN_TYPES.INVENTORY_TRANSFORMATION,
          id: item.transformationId.toString(),
          number: item.transformationNumber,
          status: 'COMPLETED',
          date: item.transformationDate,
          detailAvailable: true,
        },
      ),
    );
    return result;
  }
}
