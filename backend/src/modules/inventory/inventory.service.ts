import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
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
  generateFifoLayerNumber,
  recordInitialFifoIn,
} from '../purchasing/fifo-ledger.utils.js';
import { effectiveRemainingUnitCost } from '../purchasing/fifo-cost.utils.js';
import { generateInventoryMovementNumber } from './inventory-movement-number.utils.js';
import { formatStockQuantity } from './inventory-display.utils.js';
import {
  INVENTORY_MOVEMENT_TYPES,
  INVENTORY_ORIGIN_TYPES,
} from '../../common/inventory/inventory-origin.js';
import type {
  InventoryListQueryDto,
  MovementHistoryQueryDto,
  SaveAdjustmentDto,
  SaveOpnameDto,
  SaveTransformationDto,
} from './dto/inventory.dto.js';

const ZERO = new Prisma.Decimal(0);

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

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private async lockInventoryStock(
    tx: Prisma.TransactionClient,
    productUnitId: bigint,
  ) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`INVENTORY_STOCK:${productUnitId.toString()}`}))`;
    await tx.$queryRaw`SELECT inventory_stock_id FROM inventory_stock WHERE product_unit_id = ${productUnitId} FOR UPDATE`;
    return tx.inventoryStock.findUnique({ where: { productUnitId } });
  }

  private async generateNumber(
    tx: Prisma.TransactionClient,
    kind: 'IA' | 'STO' | 'TR',
    date: Date,
    model: 'inventoryAdjustment' | 'stockOpname' | 'inventoryTransformation',
    field: 'adjustmentNumber' | 'stockOpnameNumber' | 'transformationNumber',
  ): Promise<string> {
    const stamp = `${String(date.getDate()).padStart(2, '0')}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getFullYear()).slice(-2)}`;
    const prefix = `${kind}-${stamp}-`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`DOCUMENT_NUMBER:${prefix}`}))`;
    const delegate = tx[model] as unknown as {
      findFirst(args: object): Promise<Record<string, string> | null>;
    };
    const last = await delegate.findFirst({
      where: { [field]: { startsWith: prefix } },
      orderBy: { [field]: 'desc' },
      select: { [field]: true },
    });
    const sequence = last ? Number(last[field].slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(sequence).padStart(7, '0')}`;
  }

  async getSuppliers() {
    const suppliers = await this.prisma.supplier.findMany({
      where: { isActive: true },
      select: { supplierId: true, supplierName: true },
      orderBy: { supplierName: 'asc' },
    });
    return suppliers.map((supplier) => ({
      supplierId: supplier.supplierId.toString(),
      supplierName: supplier.supplierName,
    }));
  }

  async getStockFilters() {
    const [categories, brands, suppliers] = await Promise.all([
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
    return toApiValue({ categories, brands, suppliers });
  }

  async getSupplierCatalog(supplierId: string) {
    const entries = await this.prisma.productSupplier.findMany({
      where: {
        supplierId: BigInt(supplierId),
        isActive: true,
        product: { isActive: true },
      },
      include: {
        product: {
          include: {
            productUnits: {
              where: { isActive: true },
              include: { unit: true, inventoryStocks: true },
            },
          },
        },
      },
      orderBy: { product: { productName: 'asc' } },
    });
    const products = entries.flatMap((entry) => {
      const parent = entry.product.productUnits.find((unit) => unit.isParent);
      if (!parent) return [];
      const actualQty = Number(parent.inventoryStocks[0]?.actualQty ?? 0);
      const packedQty = Number(parent.inventoryStocks[0]?.packedQty ?? 0);
      return [
        {
          productUnitId: parent.productUnitId.toString(),
          productName: entry.product.productName,
          unitName: parent.unit.unitName,
          actualQty,
          availableQty: Number(parent.inventoryStocks[0]?.availableQty ?? 0),
          packedQty,
          warehouseQty: actualQty - packedQty,
          stockDisplay: formatStockQuantity(
            actualQty,
            entry.product.productUnits,
          ),
        },
      ];
    });
    return Array.from(
      new Map(
        products.map((product) => [product.productUnitId, product]),
      ).values(),
    );
  }

  async getProductLookup(search?: string) {
    const units = await this.prisma.productUnit.findMany({
      where: {
        isParent: true,
        isActive: true,
        product: {
          isActive: true,
          ...(search
            ? { productName: { contains: search.trim(), mode: 'insensitive' } }
            : {}),
        },
      },
      include: {
        product: true,
        unit: true,
        inventoryStocks: true,
        childUnits: {
          where: { isActive: true },
          include: { unit: true },
        },
        fifoLayers: {
          orderBy: [{ createdAt: 'desc' }, { fifoLayerId: 'desc' }],
          take: 1,
        },
      },
      orderBy: { product: { productName: 'asc' } },
      take: 100,
    });
    return units.map((item) => ({
      productId: item.productId.toString(),
      productUnitId: item.productUnitId.toString(),
      productName: item.product.productName,
      unitName: item.unit.unitName,
      actualQty: Number(item.inventoryStocks[0]?.actualQty ?? 0),
      availableQty: Number(item.inventoryStocks[0]?.availableQty ?? 0),
      packedQty: Number(item.inventoryStocks[0]?.packedQty ?? 0),
      warehouseQty: Number(
        (item.inventoryStocks[0]?.actualQty ?? ZERO).sub(
          item.inventoryStocks[0]?.packedQty ?? ZERO,
        ),
      ),
      suggestedUnitCost: item.fifoLayers[0]
        ? Number(item.fifoLayers[0].unitCost)
        : null,
      stockDisplay: formatStockQuantity(
        Number(item.inventoryStocks[0]?.actualQty ?? 0),
        [
          { conversionFactor: item.conversionFactor, unit: item.unit },
          ...item.childUnits,
        ],
      ),
    }));
  }

  private async postAdjustment(
    tx: Prisma.TransactionClient,
    adjustmentId: bigint,
    actorId: bigint,
    now: Date,
  ) {
    const adjustment = await tx.inventoryAdjustment.findUnique({
      where: { adjustmentId },
      include: {
        details: { include: { productUnit: { include: { product: true } } } },
      },
    });
    if (!adjustment || adjustment.status !== 'DRAFT') {
      throw new HttpException(
        'Hanya Stock Adjustment DRAFT yang dapat disetujui.',
        HttpStatus.CONFLICT,
      );
    }

    const orderedDetails = [...adjustment.details].sort((left, right) =>
      left.productUnitId < right.productUnitId ? -1 : 1,
    );
    for (const detail of orderedDetails) {
      if (!detail.productUnit.isParent) {
        throw new HttpException(
          'Stock Adjustment wajib menggunakan unit dasar produk.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      const stock = await this.lockInventoryStock(tx, detail.productUnitId);
      if (!stock)
        throw new HttpException(
          `Stock ${detail.productUnit.product.productName} tidak ditemukan.`,
          HttpStatus.CONFLICT,
        );
      const before = stock.actualQty;
      const after =
        detail.direction === 'IN'
          ? before.add(detail.quantity)
          : before.sub(detail.quantity);
      const movement = await tx.inventoryMovement.create({
        data: {
          movementNumber: await generateInventoryMovementNumber(
            tx,
            detail.direction === 'IN' ? 'IN' : 'OUT',
            now,
          ),
          productUnitId: detail.productUnitId,
          direction: detail.direction === 'IN' ? 'IN' : 'OUT',
          quantity: detail.quantity,
          movementType:
            detail.direction === 'IN'
              ? INVENTORY_MOVEMENT_TYPES.ADJUSTMENT_IN
              : INVENTORY_MOVEMENT_TYPES.ADJUSTMENT_OUT,
          originType: INVENTORY_ORIGIN_TYPES.INVENTORY_ADJUSTMENT,
          originId: adjustment.adjustmentId,
          originNumber: adjustment.adjustmentNumber,
          movementDate: adjustment.adjustmentDate,
          note: detail.note ?? adjustment.reason,
          createdBy: actorId,
        },
      });

      let totalCost = ZERO;
      let resolvedUnitCost = detail.unitCost;
      if (detail.direction === 'IN') {
        if (!resolvedUnitCost) {
          const latest = await tx.fifoLayer.findFirst({
            where: { productUnitId: detail.productUnitId },
            orderBy: [{ createdAt: 'desc' }, { fifoLayerId: 'desc' }],
          });
          resolvedUnitCost = latest?.unitCost ?? null;
        }
        if (!resolvedUnitCost || resolvedUnitCost.lessThanOrEqualTo(0)) {
          throw new HttpException(
            `Modal ${detail.productUnit.product.productName} wajib diisi karena histori FIFO belum tersedia.`,
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
        totalCost = detail.quantity.mul(resolvedUnitCost).toDecimalPlaces(2);
        const layer = await tx.fifoLayer.create({
          data: {
            fifoLayerNumber: await generateFifoLayerNumber(tx, now),
            productUnitId: detail.productUnitId,
            originType: 'INVENTORY_ADJUSTMENT',
            originInventoryMovementId: movement.inventoryMovementId,
            originId: adjustment.adjustmentId,
            originalQty: detail.quantity,
            remainingQty: detail.quantity,
            unitCost: resolvedUnitCost,
            originalCost: totalCost,
            remainingCost: totalCost,
            createdBy: actorId,
          },
        });
        await recordInitialFifoIn(tx, {
          fifoLayerId: layer.fifoLayerId,
          inventoryMovementId: movement.inventoryMovementId,
          quantity: detail.quantity,
          unitCost: resolvedUnitCost,
          totalCost,
          createdBy: actorId,
        });
        await tx.inventoryStock.update({
          where: { productUnitId: detail.productUnitId },
          data: {
            actualQty: { increment: detail.quantity },
            availableQty: { increment: detail.quantity },
          },
        });
      } else {
        if (
          stock.actualQty.lessThan(detail.quantity) ||
          stock.availableQty.lessThan(detail.quantity)
        ) {
          throw new HttpException(
            `Stok tersedia ${detail.productUnit.product.productName} tidak mencukupi.`,
            HttpStatus.CONFLICT,
          );
        }
        await tx.$queryRaw`SELECT fifo_layer_id FROM fifo_layer WHERE product_unit_id = ${detail.productUnitId} AND remaining_qty > 0 ORDER BY created_at ASC, fifo_layer_id ASC FOR UPDATE`;
        const layers = await tx.fifoLayer.findMany({
          where: {
            productUnitId: detail.productUnitId,
            remainingQty: { gt: 0 },
          },
          orderBy: [{ createdAt: 'asc' }, { fifoLayerId: 'asc' }],
        });
        const fifoAvailable = layers.reduce(
          (sum, layer) => sum.add(layer.remainingQty),
          ZERO,
        );
        if (fifoAvailable.lessThan(detail.quantity)) {
          throw new HttpException(
            `Total FIFO ${detail.productUnit.product.productName} tidak mencukupi. Seluruh adjustment dibatalkan.`,
            HttpStatus.CONFLICT,
          );
        }
        let remaining = detail.quantity;
        for (const layer of layers) {
          if (remaining.lessThanOrEqualTo(0)) break;
          const take = remaining.lessThan(layer.remainingQty)
            ? remaining
            : layer.remainingQty;
          const cost = effectiveRemainingUnitCost(
            layer.remainingCost,
            layer.remainingQty,
            layer.originalCost,
            layer.originalQty,
          );
          const layerCost = take.mul(cost).toDecimalPlaces(2);
          const quantityAfter = layer.remainingQty.sub(take);
          const costAfter = layer.remainingCost.sub(layerCost);
          await tx.fifoLayer.update({
            where: { fifoLayerId: layer.fifoLayerId },
            data: {
              remainingQty: quantityAfter,
              remainingCost: costAfter.lessThan(0) ? ZERO : costAfter,
            },
          });
          await tx.fifoLayerTransaction.create({
            data: {
              fifoLayerId: layer.fifoLayerId,
              inventoryMovementId: movement.inventoryMovementId,
              quantity: take,
              direction: 'OUT',
              unitCost: cost,
              totalCost: layerCost,
              quantityBefore: layer.remainingQty,
              quantityAfter,
              createdBy: actorId,
            },
          });
          totalCost = totalCost.add(layerCost);
          remaining = remaining.sub(take);
        }
        resolvedUnitCost = totalCost.div(detail.quantity).toDecimalPlaces(2);
        await tx.inventoryStock.update({
          where: { productUnitId: detail.productUnitId },
          data: {
            actualQty: { decrement: detail.quantity },
            availableQty: { decrement: detail.quantity },
          },
        });
      }
      await tx.inventoryAdjustmentDetail.update({
        where: { adjustmentDetailId: detail.adjustmentDetailId },
        data: {
          quantityBefore: before,
          quantityAfter: after,
          unitCost: resolvedUnitCost,
          totalCost,
        },
      });
    }
    return tx.inventoryAdjustment.update({
      where: { adjustmentId },
      data: {
        status: 'APPROVED',
        approvedAt: now,
        approvedBy: actorId,
        updatedBy: actorId,
      },
    });
  }

  private adjustmentData(dto: SaveAdjustmentDto, actorId: bigint) {
    return dto.items.map((item) => ({
      productUnitId: BigInt(item.productUnitId),
      direction: item.direction,
      quantity: new Prisma.Decimal(item.quantity),
      unitCost:
        item.unitCost === undefined
          ? undefined
          : new Prisma.Decimal(item.unitCost),
      note: item.note?.trim() || null,
      createdBy: actorId,
    }));
  }

  private async validateAdjustmentProducts(
    tx: Prisma.TransactionClient,
    dto: SaveAdjustmentDto,
  ) {
    const ids = dto.items.map((item) => BigInt(item.productUnitId));
    const validCount = await tx.productUnit.count({
      where: {
        productUnitId: { in: ids },
        isParent: true,
        isActive: true,
        product: { isActive: true },
      },
    });
    if (validCount !== ids.length) {
      throw new HttpException(
        'Terdapat produk atau unit dasar yang tidak valid.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  async createAdjustment(actorId: bigint, dto: SaveAdjustmentDto, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.validateAdjustmentProducts(tx, dto);
      const now = new Date();
      const adjustment = await tx.inventoryAdjustment.create({
        data: {
          adjustmentNumber: await this.generateNumber(
            tx,
            'IA',
            now,
            'inventoryAdjustment',
            'adjustmentNumber',
          ),
          adjustmentDate: new Date(dto.adjustmentDate),
          reason: dto.reason.trim(),
          note: dto.note?.trim() || null,
          status: 'DRAFT',
          createdBy: actorId,
          details: { create: this.adjustmentData(dto, actorId) },
        },
      });
      if (dto.status === 'APPROVED')
        await this.postAdjustment(tx, adjustment.adjustmentId, actorId, now);
      await this.logDocument(
        tx,
        actorId,
        'INVENTORY_ADJUSTMENT',
        adjustment.adjustmentId,
        adjustment.adjustmentNumber,
        dto.status,
        ip,
      );
      return this.getAdjustment(adjustment.adjustmentId.toString(), tx);
    });
  }

  async updateAdjustment(
    actorId: bigint,
    id: string,
    dto: SaveAdjustmentDto,
    ip?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const adjustmentId = BigInt(id);
      const current = await tx.inventoryAdjustment.findUnique({
        where: { adjustmentId },
      });
      if (
        !current ||
        current.status !== 'DRAFT' ||
        current.sourceType !== 'MANUAL'
      )
        throw new HttpException(
          'Hanya Stock Adjustment manual DRAFT yang dapat diedit.',
          HttpStatus.CONFLICT,
        );
      await this.validateAdjustmentProducts(tx, dto);
      await tx.inventoryAdjustmentDetail.deleteMany({
        where: { adjustmentId },
      });
      await tx.inventoryAdjustment.update({
        where: { adjustmentId },
        data: {
          adjustmentDate: new Date(dto.adjustmentDate),
          reason: dto.reason.trim(),
          note: dto.note?.trim() || null,
          updatedBy: actorId,
          details: { create: this.adjustmentData(dto, actorId) },
        },
      });
      const now = new Date();
      if (dto.status === 'APPROVED')
        await this.postAdjustment(tx, adjustmentId, actorId, now);
      await this.logDocument(
        tx,
        actorId,
        'INVENTORY_ADJUSTMENT',
        adjustmentId,
        current.adjustmentNumber,
        dto.status,
        ip,
      );
      return this.getAdjustment(id, tx);
    });
  }

  async approveAdjustment(actorId: bigint, id: string, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const result = await this.postAdjustment(
        tx,
        BigInt(id),
        actorId,
        new Date(),
      );
      await this.logDocument(
        tx,
        actorId,
        'INVENTORY_ADJUSTMENT',
        result.adjustmentId,
        result.adjustmentNumber,
        'APPROVED',
        ip,
      );
      return toApiValue(result);
    });
  }

  async cancelAdjustment(actorId: bigint, id: string, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.inventoryAdjustment.findUnique({
        where: { adjustmentId: BigInt(id) },
      });
      if (
        !current ||
        current.status !== 'DRAFT' ||
        current.sourceType !== 'MANUAL'
      )
        throw new HttpException(
          'Hanya Stock Adjustment manual DRAFT yang dapat dibatalkan.',
          HttpStatus.CONFLICT,
        );
      const result = await tx.inventoryAdjustment.update({
        where: { adjustmentId: current.adjustmentId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy: actorId,
          updatedBy: actorId,
        },
      });
      await this.logDocument(
        tx,
        actorId,
        'INVENTORY_ADJUSTMENT',
        result.adjustmentId,
        result.adjustmentNumber,
        'CANCELLED',
        ip,
      );
      return toApiValue(result);
    });
  }

  async getTransformationLookup() {
    const units = await this.prisma.productUnit.findMany({
      where: {
        isParent: true,
        isActive: true,
        product: { isActive: true },
      },
      include: {
        product: { include: { category: true } },
        unit: true,
        inventoryStocks: true,
        fifoLayers: {
          where: { remainingQty: { gt: 0 } },
          orderBy: [{ createdAt: 'asc' }, { fifoLayerId: 'asc' }],
        },
      },
      orderBy: { product: { productName: 'asc' } },
    });
    return units.map((unit) => {
      const category = unit.product.category.categoryName.toLowerCase();
      const totalQty = unit.fifoLayers.reduce(
        (sum, layer) => sum.add(layer.remainingQty),
        ZERO,
      );
      const totalCost = unit.fifoLayers.reduce(
        (sum, layer) => sum.add(layer.remainingCost),
        ZERO,
      );
      return {
        productUnitId: unit.productUnitId.toString(),
        productName: unit.product.productName,
        categoryName: unit.product.category.categoryName,
        unitName: unit.unit.unitName,
        actualQty: Number(unit.inventoryStocks[0]?.actualQty ?? 0),
        availableQty: Number(unit.inventoryStocks[0]?.availableQty ?? 0),
        suggestedUnitCost: totalQty.greaterThan(0)
          ? Number(totalCost.div(totalQty).toDecimalPlaces(2))
          : null,
        canBeSource: category.includes('curah') || category.includes('bal'),
        canBeResult: category.includes('repack'),
      };
    });
  }

  private async consumeFifo(
    tx: Prisma.TransactionClient,
    productUnitId: bigint,
    quantity: Prisma.Decimal,
    movementId: bigint,
    actorId: bigint,
  ) {
    await tx.$queryRaw`SELECT fifo_layer_id FROM fifo_layer WHERE product_unit_id = ${productUnitId} AND remaining_qty > 0 ORDER BY created_at ASC, fifo_layer_id ASC FOR UPDATE`;
    const layers = await tx.fifoLayer.findMany({
      where: { productUnitId, remainingQty: { gt: 0 } },
      orderBy: [{ createdAt: 'asc' }, { fifoLayerId: 'asc' }],
    });
    const fifoAvailable = layers.reduce(
      (sum, layer) => sum.add(layer.remainingQty),
      ZERO,
    );
    if (fifoAvailable.lessThan(quantity)) {
      throw new HttpException(
        'FIFO bahan tidak mencukupi. Seluruh transformasi dibatalkan.',
        HttpStatus.CONFLICT,
      );
    }
    let remaining = quantity;
    let totalCost = ZERO;
    for (const layer of layers) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const take = remaining.lessThan(layer.remainingQty)
        ? remaining
        : layer.remainingQty;
      const unitCost = effectiveRemainingUnitCost(
        layer.remainingCost,
        layer.remainingQty,
        layer.originalCost,
        layer.originalQty,
      );
      const cost = take.mul(unitCost).toDecimalPlaces(2);
      const quantityAfter = layer.remainingQty.sub(take);
      const costAfter = layer.remainingCost.sub(cost);
      await tx.fifoLayer.update({
        where: { fifoLayerId: layer.fifoLayerId },
        data: {
          remainingQty: quantityAfter,
          remainingCost: costAfter.lessThan(0) ? ZERO : costAfter,
        },
      });
      await tx.fifoLayerTransaction.create({
        data: {
          fifoLayerId: layer.fifoLayerId,
          inventoryMovementId: movementId,
          quantity: take,
          direction: 'OUT',
          unitCost,
          totalCost: cost,
          quantityBefore: layer.remainingQty,
          quantityAfter,
          createdBy: actorId,
        },
      });
      totalCost = totalCost.add(cost);
      remaining = remaining.sub(take);
    }
    return totalCost.toDecimalPlaces(2);
  }

  async createTransformation(
    actorId: bigint,
    dto: SaveTransformationDto,
    ip?: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const unitIds = Array.from(
          new Set(
            dto.items.flatMap((item) => [
              item.sourceProductUnitId,
              item.resultProductUnitId,
            ]),
          ),
        )
          .map(BigInt)
          .sort((a, b) => (a < b ? -1 : 1));
        const units = await tx.productUnit.findMany({
          where: {
            productUnitId: { in: unitIds },
            isParent: true,
            isActive: true,
            product: { isActive: true },
          },
          include: { product: { include: { category: true } }, unit: true },
        });
        if (units.length !== unitIds.length)
          throw new HttpException(
            'Terdapat produk atau unit dasar yang tidak valid.',
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        const unitMap = new Map(
          units.map((unit) => [unit.productUnitId.toString(), unit]),
        );
        for (const item of dto.items) {
          if (item.sourceProductUnitId === item.resultProductUnitId)
            throw new HttpException(
              'Produk sumber dan hasil pada satu baris tidak boleh sama.',
              HttpStatus.UNPROCESSABLE_ENTITY,
            );
          const sourceCategory = unitMap
            .get(item.sourceProductUnitId)!
            .product.category.categoryName.toLowerCase();
          const resultCategory = unitMap
            .get(item.resultProductUnitId)!
            .product.category.categoryName.toLowerCase();
          if (!(
            sourceCategory.includes('curah') || sourceCategory.includes('bal')
          ))
            throw new HttpException(
              'Produk sumber harus berasal dari kategori bahan curah atau bal-balan.',
              HttpStatus.UNPROCESSABLE_ENTITY,
            );
          if (!resultCategory.includes('repack'))
            throw new HttpException(
              'Produk hasil harus berasal dari kategori repack.',
              HttpStatus.UNPROCESSABLE_ENTITY,
            );
        }
        const stocks = new Map<
          string,
          NonNullable<
            Awaited<ReturnType<InventoryService['lockInventoryStock']>>
          >
        >();
        for (const id of unitIds) {
          const stock = await this.lockInventoryStock(tx, id);
          if (!stock)
            throw new HttpException(
              'Stock produk transformasi belum tersedia.',
              HttpStatus.CONFLICT,
            );
          stocks.set(id.toString(), stock);
        }
        const now = new Date();
        const transformation = await tx.inventoryTransformation.create({
          data: {
            transformationNumber: await this.generateNumber(
              tx,
              'TR',
              now,
              'inventoryTransformation',
              'transformationNumber',
            ),
            transformationDate: new Date(dto.transformationDate),
            note: dto.note?.trim() || null,
            createdBy: actorId,
          },
        });
        const sourceGroups = new Map<string, Prisma.Decimal>();
        dto.items.forEach((item) =>
          sourceGroups.set(
            item.sourceProductUnitId,
            (sourceGroups.get(item.sourceProductUnitId) ?? ZERO).add(
              item.sourceQuantity,
            ),
          ),
        );
        const sourceCosts = new Map<string, Prisma.Decimal>();
        const sourceMovements = new Map<string, bigint>();
        for (const [sourceId, quantity] of sourceGroups) {
          const stock = stocks.get(sourceId)!;
          if (
            stock.availableQty.lessThan(quantity) ||
            stock.actualQty.sub(stock.packedQty).lessThan(quantity)
          )
            throw new HttpException(
              `Stok tersedia ${unitMap.get(sourceId)!.product.productName} tidak mencukupi.`,
              HttpStatus.CONFLICT,
            );
          const movement = await tx.inventoryMovement.create({
            data: {
              movementNumber: await generateInventoryMovementNumber(
                tx,
                'OUT',
                now,
              ),
              productUnitId: BigInt(sourceId),
              direction: 'OUT',
              quantity,
              movementType: INVENTORY_MOVEMENT_TYPES.TRANSFORMATION_SOURCE_OUT,
              originType: INVENTORY_ORIGIN_TYPES.INVENTORY_TRANSFORMATION,
              originId: transformation.transformationId,
              originNumber: transformation.transformationNumber,
              transformationId: transformation.transformationId,
              movementDate: transformation.transformationDate,
              note: dto.note?.trim() || null,
              createdBy: actorId,
            },
          });
          sourceMovements.set(sourceId, movement.inventoryMovementId);
          sourceCosts.set(
            sourceId,
            await this.consumeFifo(
              tx,
              BigInt(sourceId),
              quantity,
              movement.inventoryMovementId,
              actorId,
            ),
          );
          await tx.inventoryStock.update({
            where: { productUnitId: BigInt(sourceId) },
            data: {
              actualQty: { decrement: quantity },
              availableQty: { decrement: quantity },
            },
          });
        }
        const lastLineBySource = new Map<string, number>();
        dto.items.forEach((item, index) =>
          lastLineBySource.set(item.sourceProductUnitId, index),
        );
        const allocatedBySource = new Map<string, Prisma.Decimal>();
        const calculatedLines: Array<{
          index: number;
          item: SaveTransformationDto['items'][number];
          resultQty: Prisma.Decimal;
          allocatedSourceCost: Prisma.Decimal;
          suggested: Prisma.Decimal;
          applied: Prisma.Decimal;
          resultCost: Prisma.Decimal;
        }> = [];
        for (const [index, item] of dto.items.entries()) {
          const sourceGroupQty = sourceGroups.get(item.sourceProductUnitId)!;
          const sourceTotalCost = sourceCosts.get(item.sourceProductUnitId)!;
          const allocatedBefore =
            allocatedBySource.get(item.sourceProductUnitId) ?? ZERO;
          const allocatedSourceCost =
            lastLineBySource.get(item.sourceProductUnitId) === index
              ? sourceTotalCost.sub(allocatedBefore)
              : sourceTotalCost
                  .mul(item.sourceQuantity)
                  .div(sourceGroupQty)
                  .toDecimalPlaces(2);
          allocatedBySource.set(
            item.sourceProductUnitId,
            allocatedBefore.add(allocatedSourceCost),
          );
          const resultQty = new Prisma.Decimal(item.resultQuantity);
          const suggested = allocatedSourceCost
            .div(resultQty)
            .toDecimalPlaces(2);
          const applied =
            item.appliedUnitCost === undefined
              ? suggested
              : new Prisma.Decimal(item.appliedUnitCost).toDecimalPlaces(2);
          const resultCost = applied.mul(resultQty).toDecimalPlaces(2);
          calculatedLines.push({
            index,
            item,
            resultQty,
            allocatedSourceCost,
            suggested,
            applied,
            resultCost,
          });
        }

        const resultGroups = new Map<
          string,
          { quantity: Prisma.Decimal; totalCost: Prisma.Decimal }
        >();
        for (const line of calculatedLines) {
          const current = resultGroups.get(line.item.resultProductUnitId) ?? {
            quantity: ZERO,
            totalCost: ZERO,
          };
          resultGroups.set(line.item.resultProductUnitId, {
            quantity: current.quantity.add(line.resultQty),
            totalCost: current.totalCost.add(line.resultCost),
          });
        }
        const resultMovements = new Map<string, bigint>();
        for (const [resultId, group] of resultGroups) {
          const weightedUnitCost = group.totalCost
            .div(group.quantity)
            .toDecimalPlaces(2);
          const movement = await tx.inventoryMovement.create({
            data: {
              movementNumber: await generateInventoryMovementNumber(
                tx,
                'IN',
                now,
              ),
              productUnitId: BigInt(resultId),
              direction: 'IN',
              quantity: group.quantity,
              movementType: INVENTORY_MOVEMENT_TYPES.TRANSFORMATION_RESULT_IN,
              originType: INVENTORY_ORIGIN_TYPES.INVENTORY_TRANSFORMATION,
              originId: transformation.transformationId,
              originNumber: transformation.transformationNumber,
              transformationId: transformation.transformationId,
              movementDate: transformation.transformationDate,
              note: dto.note?.trim() || null,
              createdBy: actorId,
            },
          });
          resultMovements.set(resultId, movement.inventoryMovementId);
          const layer = await tx.fifoLayer.create({
            data: {
              fifoLayerNumber: await generateFifoLayerNumber(tx, now),
              productUnitId: BigInt(resultId),
              originType: 'INVENTORY_TRANSFORMATION',
              originInventoryMovementId: movement.inventoryMovementId,
              originId: transformation.transformationId,
              originalQty: group.quantity,
              remainingQty: group.quantity,
              unitCost: weightedUnitCost,
              originalCost: group.totalCost,
              remainingCost: group.totalCost,
              createdBy: actorId,
            },
          });
          await recordInitialFifoIn(tx, {
            fifoLayerId: layer.fifoLayerId,
            inventoryMovementId: movement.inventoryMovementId,
            quantity: group.quantity,
            unitCost: weightedUnitCost,
            totalCost: group.totalCost,
            createdBy: actorId,
          });
          await tx.inventoryStock.update({
            where: { productUnitId: BigInt(resultId) },
            data: {
              actualQty: { increment: group.quantity },
              availableQty: { increment: group.quantity },
            },
          });
        }

        for (const line of calculatedLines) {
          const detail = await tx.inventoryTransformationDetail.create({
            data: {
              transformationId: transformation.transformationId,
              lineNumber: line.index + 1,
              sourceProductUnitId: BigInt(line.item.sourceProductUnitId),
              sourceQuantity: new Prisma.Decimal(line.item.sourceQuantity),
              resultProductUnitId: BigInt(line.item.resultProductUnitId),
              resultQuantity: line.resultQty,
              sourceCostTotal: line.allocatedSourceCost,
              suggestedUnitCost: line.suggested,
              appliedUnitCost: line.applied,
              resultCostTotal: line.resultCost,
              valuationVariance: line.resultCost.sub(line.allocatedSourceCost),
              note: line.item.note?.trim() || null,
              createdBy: actorId,
            },
          });
          await tx.inventoryTransformationMovementDetail.createMany({
            data: [
              {
                transformationDetailId: detail.transformationDetailId,
                inventoryMovementId: sourceMovements.get(
                  line.item.sourceProductUnitId,
                )!,
                movementRole: 'SOURCE',
                allocatedQuantity: new Prisma.Decimal(line.item.sourceQuantity),
                allocatedCost: line.allocatedSourceCost,
              },
              {
                transformationDetailId: detail.transformationDetailId,
                inventoryMovementId: resultMovements.get(
                  line.item.resultProductUnitId,
                )!,
                movementRole: 'RESULT',
                allocatedQuantity: line.resultQty,
                allocatedCost: line.resultCost,
              },
            ],
          });
        }
        await this.logDocument(
          tx,
          actorId,
          'INVENTORY_TRANSFORMATION',
          transformation.transformationId,
          transformation.transformationNumber,
          'COMPLETED',
          ip,
        );
        return this.getTransformation(
          transformation.transformationId.toString(),
          tx,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listTransformations(query: InventoryListQueryDto) {
    const page = Number(query.page ?? 1),
      limit = Number(query.limit ?? 20);
    const where: Prisma.InventoryTransformationWhereInput = {
      ...(query.search
        ? {
            transformationNumber: {
              contains: query.search,
              mode: 'insensitive',
            },
          }
        : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            transformationDate: {
              ...(query.dateFrom
                ? { gte: new Date(`${query.dateFrom}T00:00:00`) }
                : {}),
              ...(query.dateTo
                ? { lte: new Date(`${query.dateTo}T23:59:59.999`) }
                : {}),
            },
          }
        : {}),
    };
    const [data, totalData] = await Promise.all([
      this.prisma.inventoryTransformation.findMany({
        where,
        include: {
          _count: { select: { details: true } },
          createdByUser: { select: { fullName: true } },
        },
        orderBy: [{ transformationDate: 'desc' }, { transformationId: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inventoryTransformation.count({ where }),
    ]);
    return toApiValue({
      data,
      meta: {
        currentPage: page,
        pageSize: limit,
        totalData,
        totalPage: Math.ceil(totalData / limit),
      },
    });
  }

  async getTransformation(
    id: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const item = await db.inventoryTransformation.findUnique({
      where: { transformationId: BigInt(id) },
      include: {
        createdByUser: { select: { fullName: true } },
        details: {
          include: {
            sourceProductUnit: { include: { product: true, unit: true } },
            resultProductUnit: { include: { product: true, unit: true } },
          },
          orderBy: { lineNumber: 'asc' },
        },
      },
    });
    if (!item)
      throw new HttpException(
        'Inventory Transformation tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    return toApiValue({
      ...item,
      details: item.details.map((detail) => ({
        ...detail,
        sourceProductName: detail.sourceProductUnit.product.productName,
        sourceUnitName: detail.sourceProductUnit.unit.unitName,
        resultProductName: detail.resultProductUnit.product.productName,
        resultUnitName: detail.resultProductUnit.unit.unitName,
      })),
    });
  }

  async listStockHistory(query: MovementHistoryQueryDto) {
    const page = Number(query.page ?? 1),
      limit = Number(query.limit ?? 20);
    const searchCondition = query.search
      ? Prisma.sql`AND p.product_name ILIKE ${`%${query.search.trim()}%`}`
      : Prisma.empty;
    const categoryCondition = query.categoryId
      ? Prisma.sql`AND p.category_id = ${BigInt(query.categoryId)}`
      : Prisma.empty;
    const brandCondition = query.brandId
      ? Prisma.sql`AND p.brand_id = ${BigInt(query.brandId)}`
      : Prisma.empty;
    const supplierCondition = query.supplierId
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM product_supplier ps
          WHERE ps.product_id = p.product_id
            AND ps.supplier_id = ${BigInt(query.supplierId)}
            AND ps.is_active = TRUE
        )`
      : Prisma.empty;
    const [orderedIds, countRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ productUnitId: bigint }>>(Prisma.sql`
        SELECT pu.product_unit_id AS "productUnitId"
        FROM product_unit pu
        JOIN product p ON p.product_id = pu.product_id
        LEFT JOIN inventory_stock s ON s.product_unit_id = pu.product_unit_id
        WHERE pu.is_parent = TRUE AND pu.is_active = TRUE AND p.is_active = TRUE
        ${searchCondition}
        ${categoryCondition}
        ${brandCondition}
        ${supplierCondition}
        ORDER BY
          CASE WHEN COALESCE(s.available_qty, 0) <= p.minimum_inventory_qty THEN 0 ELSE 1 END,
          (COALESCE(s.available_qty, 0) - p.minimum_inventory_qty) ASC,
          p.product_name ASC,
          pu.product_unit_id ASC
        OFFSET ${(page - 1) * limit} LIMIT ${limit}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total
        FROM product_unit pu
        JOIN product p ON p.product_id = pu.product_id
        WHERE pu.is_parent = TRUE AND pu.is_active = TRUE AND p.is_active = TRUE
        ${searchCondition}
        ${categoryCondition}
        ${brandCondition}
        ${supplierCondition}
      `),
    ]);
    const ids = orderedIds.map((row) => row.productUnitId);
    const unordered = ids.length
      ? await this.prisma.productUnit.findMany({
          where: { productUnitId: { in: ids } },
          include: {
            product: true,
            unit: true,
            inventoryStocks: true,
            childUnits: { where: { isActive: true }, include: { unit: true } },
          },
        })
      : [];
    const unitMap = new Map(
      unordered.map((unit) => [unit.productUnitId.toString(), unit]),
    );
    const data = ids.flatMap((id) => {
      const unit = unitMap.get(id.toString());
      return unit ? [unit] : [];
    });
    const totalData = Number(countRows[0]?.total ?? 0);
    return toApiValue({
      data: data.map((unit) => {
        const stock = unit.inventoryStocks[0];
        const actualQty = Number(stock?.actualQty ?? 0),
          availableQty = Number(stock?.availableQty ?? 0),
          packedQty = Number(stock?.packedQty ?? 0);
        const displayUnits = [
          { conversionFactor: unit.conversionFactor, unit: unit.unit },
          ...unit.childUnits,
        ];
        const minimumQty = Number(unit.product.minimumInventoryQty);
        return {
          productUnitId: unit.productUnitId,
          productName: unit.product.productName,
          unitName: unit.unit.unitName,
          actualQty,
          availableQty,
          packedQty,
          warehouseQty: actualQty - packedQty,
          committedQty: actualQty - availableQty,
          minimumQty,
          minimumDisplay: formatStockQuantity(minimumQty, displayUnits),
          isLowStock: availableQty <= minimumQty,
          actualDisplay: formatStockQuantity(actualQty, displayUnits),
          warehouseDisplay: formatStockQuantity(
            actualQty - packedQty,
            displayUnits,
          ),
          packedDisplay: formatStockQuantity(packedQty, displayUnits),
          availableDisplay: formatStockQuantity(
            Math.max(availableQty, 0),
            displayUnits,
          ),
          shortageDisplay: formatStockQuantity(
            Math.max(-availableQty, 0),
            displayUnits,
          ),
        };
      }),
      meta: {
        currentPage: page,
        pageSize: limit,
        totalData,
        totalPage: Math.ceil(totalData / limit),
      },
    });
  }

  async listProductMovements(
    productUnitId: string,
    query: MovementHistoryQueryDto,
  ) {
    const page = Number(query.page ?? 1),
      limit = Number(query.limit ?? 50);
    const where: Prisma.InventoryMovementWhereInput = {
      productUnitId: BigInt(productUnitId),
      ...(query.direction ? { direction: query.direction } : {}),
    };
    const [data, totalData] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where,
        include: {
          createdByUser: { select: { fullName: true } },
          consumedLayers: { select: { totalCost: true } },
          generatedLayers: { select: { originalCost: true } },
        },
        orderBy: [{ movementDate: 'desc' }, { inventoryMovementId: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);
    return toApiValue({
      data: data.map((movement) => ({
        ...movement,
        totalCost:
          movement.direction === 'IN'
            ? movement.generatedLayers.reduce(
                (sum, layer) => sum.add(layer.originalCost),
                ZERO,
              )
            : movement.consumedLayers.reduce(
                (sum, layer) => sum.add(layer.totalCost),
                ZERO,
              ),
      })),
      meta: {
        currentPage: page,
        pageSize: limit,
        totalData,
        totalPage: Math.ceil(totalData / limit),
      },
    });
  }

  private async logDocument(
    tx: Prisma.TransactionClient,
    actorId: bigint,
    entityType: string,
    entityId: bigint,
    entityNumber: string,
    status: string,
    ip?: string,
  ) {
    const transactionId = createAuditTransactionId();
    await writeActivityLog(tx, {
      userId: actorId,
      activityType:
        status === 'DRAFT' ? ACTIVITY_TYPES.CREATE : ACTIVITY_TYPES.UPDATE,
      module: 'INVENTORY',
      entityType,
      entityId,
      entityNumber,
      description: `${status} ${entityType} ${entityNumber}`,
    });
    await writeAuditLog(tx, {
      userId: actorId,
      transactionId,
      module: 'INVENTORY',
      operation:
        status === 'DRAFT' ? AUDIT_OPERATIONS.CREATE : AUDIT_OPERATIONS.UPDATE,
      entityType,
      entityId,
      entityNumber,
      source: 'Inventory Workspace',
      changedFields: changedFields(null, { status }),
      ipAddress: ip,
    });
  }

  async listAdjustments(query: InventoryListQueryDto) {
    const page = Number(query.page ?? 1),
      limit = Number(query.limit ?? 20);
    const where: Prisma.InventoryAdjustmentWhereInput = {
      status:
        query.tab === 'HISTORY' ? { in: ['APPROVED', 'CANCELLED'] } : 'DRAFT',
      ...(query.search
        ? {
            OR: [
              {
                adjustmentNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              { reason: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            adjustmentDate: {
              ...(query.dateFrom
                ? { gte: new Date(`${query.dateFrom}T00:00:00`) }
                : {}),
              ...(query.dateTo
                ? { lte: new Date(`${query.dateTo}T23:59:59.999`) }
                : {}),
            },
          }
        : {}),
    };
    const [data, totalData] = await Promise.all([
      this.prisma.inventoryAdjustment.findMany({
        where,
        include: {
          _count: { select: { details: true } },
          createdByUser: { select: { fullName: true } },
          stockOpname: { select: { stockOpnameNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inventoryAdjustment.count({ where }),
    ]);
    return toApiValue({
      data,
      meta: {
        currentPage: page,
        pageSize: limit,
        totalData,
        totalPage: Math.ceil(totalData / limit),
      },
    });
  }

  async getAdjustment(
    id: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const item = await db.inventoryAdjustment.findUnique({
      where: { adjustmentId: BigInt(id) },
      include: {
        details: {
          include: { productUnit: { include: { product: true, unit: true } } },
        },
        createdByUser: { select: { fullName: true } },
        approvedByUser: { select: { fullName: true } },
        stockOpname: {
          select: { stockOpnameId: true, stockOpnameNumber: true },
        },
      },
    });
    if (!item)
      throw new HttpException(
        'Stock Adjustment tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    return toApiValue({
      ...item,
      details: item.details.map((detail) => ({
        ...detail,
        productName: detail.productUnit.product.productName,
        unitName: detail.productUnit.unit.unitName,
      })),
    });
  }

  private async validateOpnameProducts(
    tx: Prisma.TransactionClient,
    ids: bigint[],
    excludeId?: bigint,
  ) {
    const units = await tx.productUnit.findMany({
      where: {
        productUnitId: { in: ids },
        isParent: true,
        isActive: true,
        product: { isActive: true },
      },
      include: { inventoryStocks: true },
    });
    if (units.length !== ids.length)
      throw new HttpException(
        'Terdapat produk atau unit dasar yang tidak valid.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const conflict = await tx.stockOpnameDetail.findFirst({
      where: {
        productUnitId: { in: ids },
        stockOpname: {
          status: 'DRAFT',
          ...(excludeId ? { stockOpnameId: { not: excludeId } } : {}),
        },
      },
      include: {
        stockOpname: true,
        productUnit: { include: { product: true } },
      },
    });
    if (conflict)
      throw new HttpException(
        `${conflict.productUnit.product.productName} sudah digunakan pada ${conflict.stockOpname.stockOpnameNumber}.`,
        HttpStatus.CONFLICT,
      );
    return new Map(
      units.map((unit) => [
        unit.productUnitId.toString(),
        {
          actualQty: unit.inventoryStocks[0]?.actualQty ?? ZERO,
          packedQty: unit.inventoryStocks[0]?.packedQty ?? ZERO,
        },
      ]),
    );
  }

  private async validateSupplier(
    tx: Prisma.TransactionClient,
    supplierId?: string,
  ) {
    if (!supplierId) return null;
    const supplier = await tx.supplier.findFirst({
      where: { supplierId: BigInt(supplierId), isActive: true },
      select: { supplierId: true },
    });
    if (!supplier) {
      throw new HttpException(
        'Supplier tidak valid atau sudah nonaktif.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return supplier.supplierId;
  }

  async createOpname(actorId: bigint, dto: SaveOpnameDto, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const supplierId = await this.validateSupplier(tx, dto.supplierId);
      const ids = dto.items.map((item) => BigInt(item.productUnitId));
      const stocks = await this.validateOpnameProducts(tx, ids);
      const now = new Date();
      const opname = await tx.stockOpname.create({
        data: {
          stockOpnameNumber: await this.generateNumber(
            tx,
            'STO',
            now,
            'stockOpname',
            'stockOpnameNumber',
          ),
          opnameDate: new Date(dto.opnameDate),
          supplierId,
          status: 'DRAFT',
          note: dto.note?.trim() || null,
          createdBy: actorId,
          details: {
            create: dto.items.map((item) => {
              const stock = stocks.get(item.productUnitId)!;
              const systemQty = stock.actualQty;
              const counted = new Prisma.Decimal(item.warehouseQty);
              const packed = stock.packedQty;
              return {
                productUnitId: BigInt(item.productUnitId),
                systemQty,
                countedQty: counted,
                packedQty: packed,
                varianceQty: counted.add(packed).sub(systemQty),
                unitCost:
                  item.unitCost === undefined
                    ? null
                    : new Prisma.Decimal(item.unitCost),
                note: item.note?.trim() || null,
                createdBy: actorId,
              };
            }),
          },
        },
      });
      if (dto.status === 'APPROVED')
        await this.approveOpnameInTransaction(
          tx,
          opname.stockOpnameId,
          actorId,
          now,
          ip,
        );
      await this.logDocument(
        tx,
        actorId,
        'STOCK_OPNAME',
        opname.stockOpnameId,
        opname.stockOpnameNumber,
        dto.status,
        ip,
      );
      return this.getOpname(opname.stockOpnameId.toString(), tx);
    });
  }

  async updateOpname(
    actorId: bigint,
    id: string,
    dto: SaveOpnameDto,
    ip?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const stockOpnameId = BigInt(id);
      const current = await tx.stockOpname.findUnique({
        where: { stockOpnameId },
      });
      if (!current || current.status !== 'DRAFT')
        throw new HttpException(
          'Hanya Stock Opname DRAFT yang dapat diedit.',
          HttpStatus.CONFLICT,
        );
      const ids = dto.items.map((item) => BigInt(item.productUnitId));
      const supplierId = await this.validateSupplier(tx, dto.supplierId);
      const stocks = await this.validateOpnameProducts(tx, ids, stockOpnameId);
      await tx.stockOpnameDetail.deleteMany({ where: { stockOpnameId } });
      await tx.stockOpname.update({
        where: { stockOpnameId },
        data: {
          opnameDate: new Date(dto.opnameDate),
          supplierId,
          note: dto.note?.trim() || null,
          updatedBy: actorId,
          details: {
            create: dto.items.map((item) => {
              const stock = stocks.get(item.productUnitId)!;
              const systemQty = stock.actualQty;
              const counted = new Prisma.Decimal(item.warehouseQty);
              const packed = stock.packedQty;
              return {
                productUnitId: BigInt(item.productUnitId),
                systemQty,
                countedQty: counted,
                packedQty: packed,
                varianceQty: counted.add(packed).sub(systemQty),
                unitCost:
                  item.unitCost === undefined
                    ? null
                    : new Prisma.Decimal(item.unitCost),
                note: item.note?.trim() || null,
                createdBy: actorId,
              };
            }),
          },
        },
      });
      const now = new Date();
      if (dto.status === 'APPROVED')
        await this.approveOpnameInTransaction(
          tx,
          stockOpnameId,
          actorId,
          now,
          ip,
        );
      await this.logDocument(
        tx,
        actorId,
        'STOCK_OPNAME',
        stockOpnameId,
        current.stockOpnameNumber,
        dto.status,
        ip,
      );
      return this.getOpname(id, tx);
    });
  }

  async checkOpname(id: string) {
    const opname = await this.prisma.stockOpname.findUnique({
      where: { stockOpnameId: BigInt(id) },
      include: {
        details: {
          include: {
            productUnit: { include: { product: true, inventoryStocks: true } },
          },
        },
      },
    });
    if (!opname || opname.status !== 'DRAFT')
      throw new HttpException(
        'Stock Opname DRAFT tidak ditemukan.',
        HttpStatus.CONFLICT,
      );
    return opname.details.flatMap((detail) => {
      const stock = detail.productUnit.inventoryStocks[0];
      const current = stock?.actualQty ?? ZERO;
      const currentPacked = stock?.packedQty ?? ZERO;
      return current.equals(detail.systemQty) &&
        currentPacked.equals(detail.packedQty)
        ? []
        : [
            {
              productUnitId: detail.productUnitId.toString(),
              productName: detail.productUnit.product.productName,
              snapshotQty: Number(detail.systemQty),
              currentQty: Number(current),
            },
          ];
    });
  }

  async refreshOpnameSnapshots(actorId: bigint, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const opname = await tx.stockOpname.findUnique({
        where: { stockOpnameId: BigInt(id) },
        include: { details: true },
      });
      if (!opname || opname.status !== 'DRAFT')
        throw new HttpException(
          'Stock Opname DRAFT tidak ditemukan.',
          HttpStatus.CONFLICT,
        );
      for (const detail of opname.details) {
        const stock = await tx.inventoryStock.findUnique({
          where: { productUnitId: detail.productUnitId },
        });
        const systemQty = stock?.actualQty ?? ZERO;
        const packedQty = stock?.packedQty ?? ZERO;
        await tx.stockOpnameDetail.update({
          where: { stockOpnameDetailId: detail.stockOpnameDetailId },
          data: {
            systemQty,
            packedQty,
            varianceQty: detail.countedQty.add(packedQty).sub(systemQty),
          },
        });
      }
      await tx.stockOpname.update({
        where: { stockOpnameId: opname.stockOpnameId },
        data: { updatedBy: actorId },
      });
      return this.getOpname(id, tx);
    });
  }

  private async approveOpnameInTransaction(
    tx: Prisma.TransactionClient,
    stockOpnameId: bigint,
    actorId: bigint,
    now: Date,
    ip?: string,
  ) {
    const opname = await tx.stockOpname.findUnique({
      where: { stockOpnameId },
      include: {
        details: { include: { productUnit: { include: { product: true } } } },
      },
    });
    if (!opname || opname.status !== 'DRAFT')
      throw new HttpException(
        'Hanya Stock Opname DRAFT yang dapat disetujui.',
        HttpStatus.CONFLICT,
      );
    const orderedDetails = [...opname.details].sort((left, right) =>
      left.productUnitId < right.productUnitId ? -1 : 1,
    );
    for (const detail of orderedDetails) {
      const stock = await this.lockInventoryStock(tx, detail.productUnitId);
      if (
        !(stock?.actualQty ?? ZERO).equals(detail.systemQty) ||
        !(stock?.packedQty ?? ZERO).equals(detail.packedQty)
      )
        throw new HttpException(
          'Stok berubah. Perbarui snapshot tanpa menghapus hasil hitung Anda.',
          HttpStatus.CONFLICT,
        );
    }
    const differences = opname.details.filter(
      (detail) => !detail.varianceQty.equals(0),
    );
    if (differences.length) {
      const adjustment = await tx.inventoryAdjustment.create({
        data: {
          adjustmentNumber: await this.generateNumber(
            tx,
            'IA',
            now,
            'inventoryAdjustment',
            'adjustmentNumber',
          ),
          adjustmentDate: opname.opnameDate,
          reason: `Hasil Stock Opname ${opname.stockOpnameNumber}`,
          note: opname.note,
          status: 'DRAFT',
          sourceType: 'STOCK_OPNAME',
          stockOpnameId,
          createdBy: actorId,
          details: {
            create: differences.map((detail) => ({
              productUnitId: detail.productUnitId,
              direction: detail.varianceQty.greaterThan(0) ? 'IN' : 'OUT',
              quantity: detail.varianceQty.abs(),
              unitCost: detail.varianceQty.greaterThan(0)
                ? detail.unitCost
                : null,
              note: detail.note,
              createdBy: actorId,
            })),
          },
        },
      });
      await this.postAdjustment(tx, adjustment.adjustmentId, actorId, now);
      await this.logDocument(
        tx,
        actorId,
        'INVENTORY_ADJUSTMENT',
        adjustment.adjustmentId,
        adjustment.adjustmentNumber,
        'APPROVED',
        ip,
      );
    }
    return tx.stockOpname.update({
      where: { stockOpnameId },
      data: {
        status: 'APPROVED',
        approvedAt: now,
        approvedBy: actorId,
        updatedBy: actorId,
      },
    });
  }

  async approveOpname(actorId: bigint, id: string, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const result = await this.approveOpnameInTransaction(
        tx,
        BigInt(id),
        actorId,
        new Date(),
        ip,
      );
      await this.logDocument(
        tx,
        actorId,
        'STOCK_OPNAME',
        result.stockOpnameId,
        result.stockOpnameNumber,
        'APPROVED',
        ip,
      );
      return toApiValue(result);
    });
  }

  async cancelOpname(actorId: bigint, id: string, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.stockOpname.findUnique({
        where: { stockOpnameId: BigInt(id) },
      });
      if (!current || current.status !== 'DRAFT')
        throw new HttpException(
          'Hanya Stock Opname DRAFT yang dapat dibatalkan.',
          HttpStatus.CONFLICT,
        );
      const result = await tx.stockOpname.update({
        where: { stockOpnameId: current.stockOpnameId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy: actorId,
          updatedBy: actorId,
        },
      });
      await this.logDocument(
        tx,
        actorId,
        'STOCK_OPNAME',
        result.stockOpnameId,
        result.stockOpnameNumber,
        'CANCELLED',
        ip,
      );
      return toApiValue(result);
    });
  }

  async listOpnames(query: InventoryListQueryDto) {
    const page = Number(query.page ?? 1),
      limit = Number(query.limit ?? 20);
    const where: Prisma.StockOpnameWhereInput = {
      status:
        query.tab === 'HISTORY' ? { in: ['APPROVED', 'CANCELLED'] } : 'DRAFT',
      ...(query.search
        ? { stockOpnameNumber: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            opnameDate: {
              ...(query.dateFrom
                ? { gte: new Date(`${query.dateFrom}T00:00:00`) }
                : {}),
              ...(query.dateTo
                ? { lte: new Date(`${query.dateTo}T23:59:59.999`) }
                : {}),
            },
          }
        : {}),
    };
    const [data, totalData] = await Promise.all([
      this.prisma.stockOpname.findMany({
        where,
        include: {
          _count: { select: { details: true } },
          createdByUser: { select: { fullName: true } },
          supplier: { select: { supplierName: true } },
          adjustment: {
            select: { adjustmentId: true, adjustmentNumber: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.stockOpname.count({ where }),
    ]);
    return toApiValue({
      data,
      meta: {
        currentPage: page,
        pageSize: limit,
        totalData,
        totalPage: Math.ceil(totalData / limit),
      },
    });
  }

  async getOpname(
    id: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const item = await db.stockOpname.findUnique({
      where: { stockOpnameId: BigInt(id) },
      include: {
        details: {
          include: { productUnit: { include: { product: true, unit: true } } },
        },
        createdByUser: { select: { fullName: true } },
        approvedByUser: { select: { fullName: true } },
        supplier: { select: { supplierName: true } },
        adjustment: { select: { adjustmentId: true, adjustmentNumber: true } },
      },
    });
    if (!item)
      throw new HttpException(
        'Stock Opname tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    return toApiValue({
      ...item,
      details: item.details.map((detail) => ({
        ...detail,
        productName: detail.productUnit.product.productName,
        unitName: detail.productUnit.unit.unitName,
      })),
    });
  }
}
