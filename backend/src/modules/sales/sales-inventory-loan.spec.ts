import { Prisma } from '../../../generated/prisma/client.js';
import { jest } from '@jest/globals';
import { PrismaService } from '../../database/prisma.service.js';
import { SalesService } from './sales.service.js';

describe('SalesService Inventory Loan conversion', () => {
  const invoiceDto = {
    customerId: '7',
    partyType: 'CUSTOMER' as const,
    customerName: 'Toko Mitra',
    salesChannel: 'MANUAL' as const,
    paymentType: 'CREDIT' as const,
    invoiceDate: '2026-09-08',
    dueDate: '2026-09-15',
    discountAmount: 0,
    status: 'COMPLETED' as const,
    snapshotMode: 'IGNORE' as const,
    items: [
      {
        productUnitId: '11',
        quantity: 2,
        unitPrice: 15_000,
        discountAmount: 0,
        bonusQuantity: 0,
      },
    ],
  };

  it('creates a commercial SI without reserving stock, links it, then completes it', async () => {
    const service = new SalesService({} as PrismaService);
    const create = jest.spyOn(service, 'createInvoiceTx').mockResolvedValue({
      salesInvoiceId: '91',
      salesInvoiceNumber: 'SI-080926-0000001',
      salesOrder: null,
    });
    const internal = service as unknown as {
      completeInvoiceTx: (
        tx: Prisma.TransactionClient,
        actorId: bigint,
        id: bigint,
      ) => Promise<unknown>;
    };
    const complete = jest
      .spyOn(internal, 'completeInvoiceTx')
      .mockResolvedValue({});
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      inventoryLoanResolution: { update },
    } as unknown as Prisma.TransactionClient;

    await service.createCompletedInventoryLoanInvoiceTx(
      tx,
      3n,
      41n,
      invoiceDto,
    );

    expect(create).toHaveBeenCalledWith(
      tx,
      3n,
      expect.objectContaining({
        customerId: '7',
        partyType: 'CUSTOMER',
        paymentType: 'CREDIT',
        status: 'DRAFT',
        snapshotMode: 'IGNORE',
        payments: [],
      }),
      expect.anything(),
      { skipInventoryReservation: true },
    );
    expect(update).toHaveBeenCalledWith({
      where: { inventoryLoanResolutionId: 41n },
      data: { salesInvoiceId: 91n },
    });
    expect(complete).toHaveBeenCalledWith(tx, 3n, 91n);
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(
      complete.mock.invocationCallOrder[0],
    );
  });

  it('rejects an unpaid completed Loan SI without a due date', async () => {
    const service = new SalesService({} as PrismaService);
    await expect(
      service.createCompletedInventoryLoanInvoiceTx(
        {} as Prisma.TransactionClient,
        3n,
        41n,
        { ...invoiceDto, dueDate: undefined },
      ),
    ).rejects.toMatchObject({ status: 422 });
  });
});
