import { jest } from '@jest/globals';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  generateFifoLayerNumber,
  recordInitialFifoIn,
} from './fifo-ledger.utils.js';

describe('FIFO ledger helpers', () => {
  it('generates one consistent daily FIFO layer number format', async () => {
    const tx = {
      $executeRaw: jest.fn<any>().mockResolvedValue(1),
      fifoLayer: {
        findFirst: jest.fn<any>().mockResolvedValue({
          fifoLayerNumber: 'FIFO-290826-0000041',
        }),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      generateFifoLayerNumber(tx, new Date('2026-08-29T04:00:00Z')),
    ).resolves.toBe('FIFO-290826-0000042');
  });

  it('records creation of a layer as an IN transaction from zero', async () => {
    const create = jest.fn<any>().mockResolvedValue({});
    const tx = {
      fifoLayerTransaction: { create },
    } as unknown as Prisma.TransactionClient;

    await recordInitialFifoIn(tx, {
      fifoLayerId: 7n,
      inventoryMovementId: 8n,
      quantity: new Prisma.Decimal('12.5'),
      unitCost: new Prisma.Decimal('1000'),
      totalCost: new Prisma.Decimal('12500'),
      createdBy: 1n,
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fifoLayerId: 7n,
        inventoryMovementId: 8n,
        direction: 'IN',
        quantityBefore: new Prisma.Decimal(0),
        quantityAfter: new Prisma.Decimal('12.5'),
      }),
    });
  });
});
