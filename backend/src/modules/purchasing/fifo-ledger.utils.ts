import { Prisma } from '../../../generated/prisma/client.js';

/** FIFO numbers identify layers; business sources are tracked separately. */
export async function generateFifoLayerNumber(
  tx: Prisma.TransactionClient,
  now: Date,
): Promise<string> {
  const date = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear()).slice(-2)}`;
  const prefix = `FIFO-${date}-`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`FIFO_LAYER_NUMBER:${prefix}`}))`;
  const last = await tx.fifoLayer.findFirst({
    where: { fifoLayerNumber: { startsWith: prefix } },
    orderBy: { fifoLayerNumber: 'desc' },
    select: { fifoLayerNumber: true },
  });
  const sequence = last
    ? Number(last.fifoLayerNumber.slice(prefix.length)) + 1
    : 1;
  return `${prefix}${String(sequence).padStart(7, '0')}`;
}

export async function recordInitialFifoIn(
  tx: Prisma.TransactionClient,
  input: {
    fifoLayerId: bigint;
    inventoryMovementId: bigint;
    quantity: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    totalCost: Prisma.Decimal;
    createdBy: bigint;
  },
) {
  return tx.fifoLayerTransaction.create({
    data: {
      fifoLayerId: input.fifoLayerId,
      inventoryMovementId: input.inventoryMovementId,
      quantity: input.quantity,
      direction: 'IN',
      unitCost: input.unitCost,
      totalCost: input.totalCost,
      quantityBefore: new Prisma.Decimal(0),
      quantityAfter: input.quantity,
      createdBy: input.createdBy,
    },
  });
}
