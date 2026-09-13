import { jest } from '@jest/globals';
import { Prisma } from '../../../generated/prisma/client.js';
import { InventoryLoanService } from './inventory-loan.service.js';

const decimal = (value: number) => new Prisma.Decimal(value);

describe('InventoryLoanService FIFO integration', () => {
  const service = new InventoryLoanService(
    {} as never,
    {} as never,
    {} as never,
  );
  const internal = service as unknown as {
    planRecoveredWriteOffAllocation: (
      tx: Prisma.TransactionClient,
      writeOffDetailId: bigint,
      quantity: Prisma.Decimal,
    ) => Promise<
      Array<{
        inventoryLoanFifoAllocationId: bigint;
        fifoLayerId: bigint;
        quantity: Prisma.Decimal;
      }>
    >;
    revalueIncomingLoanCost: (
      tx: Prisma.TransactionClient,
      loanDetailId: bigint,
      productUnitId: bigint,
      quantity: Prisma.Decimal,
      previousUnitCost: Prisma.Decimal,
      finalUnitCost: Prisma.Decimal,
      slices: Array<{
        inventoryLoanFifoAllocationId: bigint;
        fifoLayerId: bigint;
        quantity: Prisma.Decimal;
        unitCost: Prisma.Decimal;
        totalCost: Prisma.Decimal;
      }>,
    ) => Promise<{ inventory: Prisma.Decimal; consumed: Prisma.Decimal }>;
  };

  it('reuses the original write-off allocations without reopening the active obligation', async () => {
    const tx = {
      inventoryLoanResolutionAllocation: {
        findMany: jest.fn().mockResolvedValue([
          {
            inventoryLoanFifoAllocationId: 11n,
            fifoLayerId: 101n,
            quantity: decimal(4),
            unitCost: decimal(10),
          },
          {
            inventoryLoanFifoAllocationId: 12n,
            fifoLayerId: 102n,
            quantity: decimal(5),
            unitCost: decimal(10),
          },
        ]),
        groupBy: jest.fn().mockResolvedValue([
          {
            inventoryLoanFifoAllocationId: 11n,
            _sum: { quantity: decimal(1) },
          },
        ]),
      },
      inventoryLoanResolutionDetail: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ inventoryLoanResolutionDetailId: 91n }]),
      },
    } as unknown as Prisma.TransactionClient;

    const slices = await internal.planRecoveredWriteOffAllocation(
      tx,
      80n,
      decimal(6),
    );

    expect(slices.map((slice) => Number(slice.quantity))).toEqual([3, 3]);
    expect(slices.map((slice) => slice.fifoLayerId)).toEqual([101n, 102n]);
  });

  it('can revalue a recovered incoming write-off even when its active allocation is zero', async () => {
    const executeLock = jest.fn().mockResolvedValue(0);
    const rowLock = jest.fn().mockResolvedValue([]);
    const update = jest.fn().mockImplementation(
      (input: {
        data: {
          originalCost: Prisma.Decimal;
          remainingCost: Prisma.Decimal;
          unitCost: Prisma.Decimal;
        };
      }) =>
        Promise.resolve({
          fifoLayerId: 101n,
          productUnitId: 7n,
          originalQty: decimal(10),
          remainingQty: decimal(4),
          originalCost: input.data.originalCost,
          remainingCost: input.data.remainingCost,
          unitCost: input.data.unitCost,
        }),
    );
    const findMany = jest.fn().mockResolvedValue([
      {
        inventoryLoanFifoAllocationId: 11n,
        remainingAllocationQuantity: decimal(0),
        fifoLayerId: 101n,
        fifoLayer: {
          fifoLayerId: 101n,
          productUnitId: 7n,
          originalQty: decimal(10),
          remainingQty: decimal(4),
          originalCost: decimal(100),
          remainingCost: decimal(40),
          unitCost: decimal(10),
        },
      },
    ]);
    const tx = {
      $executeRaw: executeLock,
      $queryRaw: rowLock,
      inventoryLoanFifoAllocation: { findMany },
      fifoLayer: { update },
    } as unknown as Prisma.TransactionClient;

    const result = await internal.revalueIncomingLoanCost(
      tx,
      5n,
      7n,
      decimal(2),
      decimal(10),
      decimal(15),
      [
        {
          inventoryLoanFifoAllocationId: 11n,
          fifoLayerId: 101n,
          quantity: decimal(2),
          unitCost: decimal(10),
          totalCost: decimal(20),
        },
      ],
    );

    expect(Number(result.inventory)).toBe(10);
    expect(Number(result.consumed)).toBe(0);
    expect(update).toHaveBeenCalledWith({
      where: { fifoLayerId: 101n },
      data: {
        originalCost: decimal(110),
        remainingCost: decimal(50),
        unitCost: decimal(11),
      },
    });
    expect(executeLock.mock.invocationCallOrder[0]).toBeLessThan(
      findMany.mock.invocationCallOrder[0],
    );
    expect(rowLock.mock.invocationCallOrder[0]).toBeLessThan(
      findMany.mock.invocationCallOrder[0],
    );
  });
});
