import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  AUDIT_OPERATIONS,
  changedFields,
  writeAuditLog,
} from '../logging/business-logger.js';

const ZERO = new Prisma.Decimal(0);

export async function consumeFifoLayers(
  tx: Prisma.TransactionClient,
  input: {
    productUnitId: bigint;
    quantity: Prisma.Decimal;
    inventoryMovementId: bigint;
    createdBy: bigint;
    insufficientMessage?: string;
    audit?: {
      transactionId: string;
      entityNumber: string;
      source: string;
      ipAddress?: string;
    };
  },
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`FIFO_CONSUME:${input.productUnitId.toString()}`}))`;
  await tx.$queryRaw`SELECT fifo_layer_id FROM fifo_layer WHERE product_unit_id = ${input.productUnitId} AND remaining_qty > 0 ORDER BY created_at ASC, fifo_layer_id ASC FOR UPDATE`;
  const layers = await tx.fifoLayer.findMany({
    where: { productUnitId: input.productUnitId, remainingQty: { gt: 0 } },
    orderBy: [{ createdAt: 'asc' }, { fifoLayerId: 'asc' }],
  });
  const available = layers.reduce(
    (sum, layer) => sum.add(layer.remainingQty),
    ZERO,
  );
  if (available.lessThan(input.quantity)) {
    throw new HttpException(
      input.insufficientMessage ??
        'Stok FIFO tidak mencukupi. Transaksi dibatalkan.',
      HttpStatus.CONFLICT,
    );
  }
  let remaining = input.quantity;
  let totalCost = ZERO;
  for (const layer of layers) {
    if (remaining.lessThanOrEqualTo(0)) break;
    const take = Prisma.Decimal.min(remaining, layer.remainingQty);
    const unitCost = layer.remainingQty.greaterThan(0)
      ? layer.remainingCost.div(layer.remainingQty)
      : layer.unitCost;
    const cost = take.mul(unitCost).toDecimalPlaces(2);
    const quantityAfter = layer.remainingQty.sub(take);
    const remainingCost = Prisma.Decimal.max(
      ZERO,
      layer.remainingCost.sub(cost),
    );
    const updatedLayer = await tx.fifoLayer.update({
      where: { fifoLayerId: layer.fifoLayerId },
      data: { remainingQty: quantityAfter, remainingCost },
    });
    const transaction = await tx.fifoLayerTransaction.create({
      data: {
        fifoLayerId: layer.fifoLayerId,
        inventoryMovementId: input.inventoryMovementId,
        quantity: take,
        direction: 'OUT',
        unitCost,
        totalCost: cost,
        quantityBefore: layer.remainingQty,
        quantityAfter,
        createdBy: input.createdBy,
      },
    });
    if (input.audit) {
      await writeAuditLog(tx, {
        userId: input.createdBy,
        transactionId: input.audit.transactionId,
        module: 'FIFO',
        operation: AUDIT_OPERATIONS.UPDATE,
        entityType: 'FIFO_LAYER',
        entityId: layer.fifoLayerId,
        entityNumber: input.audit.entityNumber,
        source: input.audit.source,
        changedFields: changedFields(layer, updatedLayer, [
          'remainingQty',
          'remainingCost',
        ]),
        ipAddress: input.audit.ipAddress,
      });
      await writeAuditLog(tx, {
        userId: input.createdBy,
        transactionId: input.audit.transactionId,
        module: 'FIFO',
        operation: AUDIT_OPERATIONS.CREATE,
        entityType: 'FIFO_LAYER_TRANSACTION',
        entityId: transaction.fifoLayerTransactionId,
        entityNumber: input.audit.entityNumber,
        source: input.audit.source,
        changedFields: changedFields(null, transaction),
        ipAddress: input.audit.ipAddress,
      });
    }
    totalCost = totalCost.add(cost);
    remaining = remaining.sub(take);
  }
  return totalCost.toDecimalPlaces(2);
}
