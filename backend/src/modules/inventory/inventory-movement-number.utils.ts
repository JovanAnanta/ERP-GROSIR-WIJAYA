import { Prisma } from '../../../generated/prisma/client.js';

export async function generateInventoryMovementNumber(
  tx: Prisma.TransactionClient,
  direction: 'IN' | 'OUT',
  date = new Date(),
): Promise<string> {
  const stamp = `${String(date.getDate()).padStart(2, '0')}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getFullYear()).slice(-2)}`;
  const prefix = `IM-${direction}-${stamp}-`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`INVENTORY_MOVEMENT_NUMBER:${prefix}`}))`;
  const last = await tx.inventoryMovement.findFirst({
    where: { movementNumber: { startsWith: prefix } },
    orderBy: { movementNumber: 'desc' },
    select: { movementNumber: true },
  });
  const next = last ? Number(last.movementNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(next).padStart(7, '0')}`;
}
