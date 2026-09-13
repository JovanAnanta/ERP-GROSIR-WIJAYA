import { HttpStatus } from '@nestjs/common';
import { jest } from '@jest/globals';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { PurchaseInvoiceService } from './purchase-invoice.service.js';

describe('PurchaseInvoiceService payment serialization', () => {
  it('rejects an invoice total that does not match items minus discount', async () => {
    const service = new PurchaseInvoiceService({} as PrismaService);
    const validate = service as unknown as {
      validateInvoiceReferences: (
        tx: Prisma.TransactionClient,
        dto: Record<string, unknown>,
      ) => Promise<void>;
    };
    await expect(
      validate.validateInvoiceReferences({} as Prisma.TransactionClient, {
        supplierId: '1',
        invoiceDate: '2026-09-09',
        invoiceTotal: 90,
        discountAmount: 0,
        status: 'DRAFT',
        priceHistoryAction: 'IGNORE',
        items: [
          {
            productUnitId: '1',
            purchasedQty: 1,
            bonusQty: 2,
            price: 100,
          },
        ],
      }),
    ).rejects.toMatchObject({ status: HttpStatus.UNPROCESSABLE_ENTITY });
  });

  it('locks the invoice row before checking outstanding and rejects overpayment', async () => {
    // TAMBAHKAN <any> DI SINI
    const lockInvoice = jest
      .fn<any>()
      .mockResolvedValue([{ purchase_invoice_id: BigInt(11) }]);

    // TAMBAHKAN <any> DI SINI
    const findInvoice = jest.fn<any>().mockResolvedValue({
      purchaseInvoiceId: BigInt(11),
      purchaseInvoiceNumber: 'PI-010126-0000001',
      supplierId: BigInt(4),
      status: 'COMPLETED',
      statusPayment: 'PARTIAL',
      paidAmount: new Prisma.Decimal('50.00'),
      outstandingAmount: new Prisma.Decimal('50.00'),
    });

    const tx = {
      $queryRaw: lockInvoice,
      purchaseInvoice: { findUnique: findInvoice },
      financialAccount: {
        // TAMBAHKAN <any> DI SINI
        findUnique: jest.fn<any>().mockResolvedValue({ isActive: true }),
      },
      // TAMBAHKAN <any> DI SINI
      purchaseInvoicePayment: { create: jest.fn<any>() },
    };

    const prisma = {
      // TAMBAHKAN <any> DI SINI
      $transaction: jest
        .fn<any>()
        .mockImplementation(async (callback: (client: typeof tx) => unknown) =>
          callback(tx),
        ),
    } as unknown as PrismaService;

    const service = new PurchaseInvoiceService(prisma);

    await expect(
      service.addPayment(BigInt(1), '11', {
        financialAccountId: '2',
        paymentAmount: 50.01,
        paymentMethod: 'TRANSFER',
        paymentDate: '2026-08-28',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });

    expect(lockInvoice).toHaveBeenCalledTimes(1);
    expect(findInvoice).toHaveBeenCalledTimes(1);
    expect(lockInvoice.mock.invocationCallOrder[0]).toBeLessThan(
      findInvoice.mock.invocationCallOrder[0],
    );
    expect(tx.purchaseInvoicePayment.create).not.toHaveBeenCalled();
  });

  it('returns invoice card pagination metadata without changing data shape', async () => {
    const count = jest.fn<any>().mockResolvedValue(1);
    const rows = [
      {
        purchaseInvoiceId: BigInt(9),
        purchaseInvoiceNumber: 'PI-TEST',
        purchaseOrderId: null,
        supplierId: BigInt(2),
        supplier: { supplierName: 'Supplier PI' },
        returns: [],
        invoiceDate: new Date('2026-08-29'),
        dueDate: new Date('2026-09-01'),
        invoiceTotal: new Prisma.Decimal(100),
        paidAmount: new Prisma.Decimal(0),
        outstandingAmount: new Prisma.Decimal(100),
        statusPayment: 'UNPAID',
        status: 'COMPLETED',
        note: null,
        createdAt: new Date('2026-08-29'),
        createdBy: BigInt(1),
        updatedAt: null,
        updatedBy: null,
      },
    ];
    const findMany = jest.fn<any>().mockResolvedValue(rows);
    const prisma = {
      purchaseInvoice: { count, findMany },
    } as unknown as PrismaService;

    const result = await new PurchaseInvoiceService(prisma).findAll({
      supplierId: '2',
      tab: 'ACTIVE',
      page: '1',
      limit: '20',
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      supplierName: 'Supplier PI',
      invoiceTotal: 100,
    });
    expect(result.meta).toEqual({
      currentPage: 1,
      pageSize: 20,
      totalData: 1,
      totalPage: 1,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
    expect(count).toHaveBeenCalledTimes(1);
  });
});
