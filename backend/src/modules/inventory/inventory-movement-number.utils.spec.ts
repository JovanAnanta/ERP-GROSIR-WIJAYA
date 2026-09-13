import { jest } from '@jest/globals';
import { Prisma } from '../../../generated/prisma/client.js';
import { generateInventoryMovementNumber } from './inventory-movement-number.utils.js';

describe('generateInventoryMovementNumber', () => {
  it('uses one direction-aware template and increments its daily sequence', async () => {
    const tx = {
      $executeRaw: jest.fn<any>().mockResolvedValue(1),
      inventoryMovement: {
        findFirst: jest.fn<any>().mockResolvedValue({
          movementNumber: 'IM-OUT-310826-0000041',
        }),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      generateInventoryMovementNumber(tx, 'OUT', new Date(2026, 7, 31)),
    ).resolves.toBe('IM-OUT-310826-0000042');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('starts IN and OUT sequences independently', async () => {
    const tx = {
      $executeRaw: jest.fn<any>().mockResolvedValue(1),
      inventoryMovement: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    } as unknown as Prisma.TransactionClient;

    await expect(
      generateInventoryMovementNumber(tx, 'IN', new Date(2026, 7, 31)),
    ).resolves.toBe('IM-IN-310826-0000001');
  });
});
