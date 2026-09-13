import { jest } from '@jest/globals';
import { AliasService } from './alias.service.js';

describe('AliasService', () => {
  it('uses a non-deserializing advisory lock and saves an alias atomically', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
      product: {
        findUnique: jest.fn().mockResolvedValue({ isActive: true }),
      },
      unit: { findUnique: jest.fn() },
      productAlias: {
        create: jest.fn().mockResolvedValue({ productAliasId: 9n }),
      },
      unitAlias: { create: jest.fn() },
      activityLog: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(
        async (operation: (client: typeof tx) => Promise<unknown>) =>
          operation(tx),
      ),
    };

    const service = new AliasService(prisma as never);
    await expect(
      service.create(1n, {
        kind: 'PRODUCT',
        targetId: '2',
        aliases: ['JCK'],
      }),
    ).resolves.toEqual({ count: 1 });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.productAlias.create).toHaveBeenCalledWith({
      data: { productId: 2n, aliasName: 'JCK', createdBy: 1n },
    });
    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
