import { HttpException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { Prisma } from '../../../generated/prisma/client.js';
import { consumeFifoLayers } from './fifo-consumption.utils.js';

function createTransaction(layers: Array<Record<string, unknown>>) {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([]),
    fifoLayer: {
      findMany: jest.fn().mockResolvedValue(layers),
      update: jest.fn().mockResolvedValue({}),
    },
    fifoLayerTransaction: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

describe('FIFO consumption', () => {
  it('consumes the oldest layers and records the exact cost atomically', async () => {
    const tx = createTransaction([
      {
        fifoLayerId: 1n,
        remainingQty: new Prisma.Decimal(3),
        remainingCost: new Prisma.Decimal(30),
        unitCost: new Prisma.Decimal(10),
      },
      {
        fifoLayerId: 2n,
        remainingQty: new Prisma.Decimal(5),
        remainingCost: new Prisma.Decimal(100),
        unitCost: new Prisma.Decimal(20),
      },
    ]);

    const total = await consumeFifoLayers(
      tx as unknown as Prisma.TransactionClient,
      {
        productUnitId: 10n,
        quantity: new Prisma.Decimal(6),
        inventoryMovementId: 20n,
        createdBy: 30n,
      },
    );

    expect(total.toNumber()).toBe(90);
    expect(tx.fifoLayer.update).toHaveBeenNthCalledWith(1, {
      where: { fifoLayerId: 1n },
      data: {
        remainingQty: new Prisma.Decimal(0),
        remainingCost: new Prisma.Decimal(0),
      },
    });
    expect(tx.fifoLayer.update).toHaveBeenNthCalledWith(2, {
      where: { fifoLayerId: 2n },
      data: {
        remainingQty: new Prisma.Decimal(2),
        remainingCost: new Prisma.Decimal(40),
      },
    });
    expect(tx.fifoLayerTransaction.create).toHaveBeenCalledTimes(2);
  });

  it('rejects insufficient FIFO before writing any layer', async () => {
    const tx = createTransaction([
      {
        fifoLayerId: 1n,
        remainingQty: new Prisma.Decimal(2),
        remainingCost: new Prisma.Decimal(20),
        unitCost: new Prisma.Decimal(10),
      },
    ]);

    await expect(
      consumeFifoLayers(tx as unknown as Prisma.TransactionClient, {
        productUnitId: 10n,
        quantity: new Prisma.Decimal(3),
        inventoryMovementId: 20n,
        createdBy: 30n,
      }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(tx.fifoLayer.update).not.toHaveBeenCalled();
    expect(tx.fifoLayerTransaction.create).not.toHaveBeenCalled();
  });
});
