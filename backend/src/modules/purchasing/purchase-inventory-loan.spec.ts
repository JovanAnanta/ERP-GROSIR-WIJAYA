import { jest } from '@jest/globals';
import { PurchaseInvoiceService } from './purchase-invoice.service.js';

describe('PurchaseInvoiceService Inventory Loan conversion', () => {
  const baseDto = {
    supplierId: '7',
    invoiceDate: '2026-09-08T00:00:00.000Z',
    dueDate: '2026-09-15T00:00:00.000Z',
    invoiceTotal: 120000,
    discountAmount: 0,
    status: 'DRAFT' as const,
    priceHistoryAction: 'MERGE' as const,
    payments: [
      {
        financialAccountId: '1',
        paymentAmount: 120000,
        paymentMethod: 'CASH' as const,
      },
    ],
    items: [{ productUnitId: '9', purchasedQty: 2, price: 60000 }],
  };

  it('uses the standard PI creation path as completed unpaid and links the Loan resolution', async () => {
    const service = new PurchaseInvoiceService({} as never);
    const internal = service as unknown as {
      createInvoiceTx: jest.Mock;
    };
    internal.createInvoiceTx = jest.fn().mockResolvedValue({
      purchaseInvoiceId: 81n,
      purchaseInvoiceNumber: 'PI-080926-0000001',
    });

    await service.createCompletedInventoryLoanInvoiceTx(
      {} as never,
      3n,
      44n,
      baseDto,
    );

    expect(internal.createInvoiceTx).toHaveBeenCalledWith(
      expect.anything(),
      3n,
      expect.objectContaining({
        supplierId: '7',
        purchaseOrderId: undefined,
        status: 'COMPLETED',
        priceHistoryAction: 'IGNORE',
        payments: [],
      }),
      { inventoryLoanResolutionId: 44n },
    );
  });

  it('rejects an unpaid completed PI conversion without a due date', async () => {
    const service = new PurchaseInvoiceService({} as never);

    await expect(
      service.createCompletedInventoryLoanInvoiceTx({} as never, 3n, 44n, {
        ...baseDto,
        dueDate: undefined,
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
