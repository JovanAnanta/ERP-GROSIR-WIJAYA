import { HttpStatus } from '@nestjs/common';
import { jest } from '@jest/globals';
import { PrismaService } from '../../database/prisma.service.js';
import { PurchaseReturnService } from './purchase-return.service.js';

describe('PurchaseReturnService business boundaries', () => {
  it('requires an expected date for replacement returns before touching data', async () => {
    const tx = {};
    const prisma = {
      $transaction: jest
        .fn<any>()
        .mockImplementation(async (callback: (client: typeof tx) => unknown) =>
          callback(tx),
        ),
    } as unknown as PrismaService;

    const service = new PurchaseReturnService(prisma);
    await expect(
      service.create(BigInt(1), {
        purchaseInvoiceId: '10',
        returnDate: '2026-08-29',
        resolutionType: 'REPLACEMENT',
        status: 'DRAFT',
        reason: 'Barang rusak',
        items: [
          {
            purchaseInvoiceDetailId: '20',
            productUnitId: '30',
            quantity: 1,
            unitCost: 1000,
          },
        ],
      }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });
});
