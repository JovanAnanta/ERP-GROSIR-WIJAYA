import { jest } from '@jest/globals';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { InventoryService } from './inventory.service.js';

function buildOutTransaction(layerQuantities: string[]) {
  const decimal = (value: string) => new Prisma.Decimal(value);
  const fifoLayers = layerQuantities.map((quantity, index) => ({
    fifoLayerId: BigInt(index + 1),
    remainingQty: decimal(quantity),
    remainingCost: decimal(quantity).mul(index === 0 ? 10 : 20),
    originalQty: decimal(quantity),
    originalCost: decimal(quantity).mul(index === 0 ? 10 : 20),
  }));
  const tx = {
    $executeRaw: jest.fn<any>().mockResolvedValue(1),
    $queryRaw: jest.fn<any>().mockResolvedValue([{ inventory_stock_id: 1n }]),
    inventoryAdjustment: {
      findUnique: jest.fn<any>().mockResolvedValue({
        adjustmentId: 11n,
        adjustmentNumber: 'IA-300826-0000001',
        adjustmentDate: new Date('2026-08-30'),
        reason: 'Barang rusak',
        status: 'DRAFT',
        details: [
          {
            adjustmentDetailId: 12n,
            productUnitId: 20n,
            direction: 'OUT',
            quantity: decimal('8'),
            unitCost: null,
            note: null,
            productUnit: { isParent: true, product: { productName: 'Beras' } },
          },
        ],
      }),
      update: jest.fn<any>().mockResolvedValue({
        adjustmentId: 11n,
        adjustmentNumber: 'IA-300826-0000001',
        status: 'APPROVED',
      }),
    },
    inventoryMovement: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue({ inventoryMovementId: 30n }),
    },
    inventoryStock: {
      findUnique: jest.fn<any>().mockResolvedValue({
        actualQty: decimal('10'),
        availableQty: decimal('10'),
      }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    fifoLayer: {
      findMany: jest.fn<any>().mockResolvedValue(fifoLayers),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    fifoLayerTransaction: { create: jest.fn<any>().mockResolvedValue({}) },
    inventoryAdjustmentDetail: { update: jest.fn<any>().mockResolvedValue({}) },
    activityLog: { create: jest.fn<any>().mockResolvedValue({}) },
    auditLog: { create: jest.fn<any>().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn<any>((callback: (client: unknown) => unknown) =>
      callback(tx),
    ),
  } as unknown as PrismaService;
  return { service: new InventoryService(prisma), tx };
}

describe('InventoryService FIFO adjustment posting', () => {
  it('consumes multiple FIFO layers from oldest to newest', async () => {
    const { service, tx } = buildOutTransaction(['3', '7']);

    await service.approveAdjustment(1n, '11');

    expect(tx.fifoLayerTransaction.create).toHaveBeenCalledTimes(2);
    const first = tx.fifoLayerTransaction.create.mock.calls[0][0] as {
      data: { quantity: Prisma.Decimal };
    };
    const second = tx.fifoLayerTransaction.create.mock.calls[1][0] as {
      data: { quantity: Prisma.Decimal };
    };
    expect(first.data.quantity.equals(3)).toBe(true);
    expect(second.data.quantity.equals(5)).toBe(true);
    expect(tx.inventoryStock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          actualQty: { decrement: new Prisma.Decimal(8) },
          availableQty: { decrement: new Prisma.Decimal(8) },
        },
      }),
    );
    const detailUpdate = tx.inventoryAdjustmentDetail.update.mock
      .calls[0][0] as { data: { totalCost: Prisma.Decimal } };
    expect(detailUpdate.data.totalCost.equals(130)).toBe(true);
  });

  it('rejects the complete adjustment when aggregate FIFO is insufficient', async () => {
    const { service, tx } = buildOutTransaction(['3', '4']);

    await expect(
      service.approveAdjustment(1n, '11'),
    ).rejects.toMatchObject<HttpException>({ status: HttpStatus.CONFLICT });
    expect(tx.fifoLayer.update).not.toHaveBeenCalled();
    expect(tx.inventoryStock.update).not.toHaveBeenCalled();
    expect(tx.inventoryAdjustment.update).not.toHaveBeenCalled();
  });
});
