import { jest } from '@jest/globals';
import { PrismaService } from '../../database/prisma.service.js';
import { PurchaseOrderService } from './purchase-order.service.js';

describe('PurchaseOrderService transaction numbering', () => {
  it('acquires the PostgreSQL advisory lock without decoding its void result', async () => {
    // TAMBAHKAN <any> DI SINI
    const executeLock = jest.fn<any>().mockResolvedValue(1);

    const tx = {
      $executeRaw: executeLock,
      supplier: {
        // TAMBAHKAN <any> DI SINI
        findUnique: jest.fn<any>().mockResolvedValue({ isActive: true }),
      },
      // TAMBAHKAN <any> DI SINI
      productUnit: { count: jest.fn<any>().mockResolvedValue(1) },
      purchaseOrder: {
        // TAMBAHKAN <any> DI SINI
        findFirst: jest.fn<any>().mockResolvedValue(null),
        // TAMBAHKAN <any> DI SINI
        create: jest.fn<any>().mockResolvedValue({
          purchaseOrderId: BigInt(1),
          details: [],
        }),
      },
      // TAMBAHKAN <any> DI SINI
      activityLog: { create: jest.fn<any>().mockResolvedValue({}) },
      auditLog: { create: jest.fn<any>().mockResolvedValue({}) },
    };

    const prisma = {
      // TAMBAHKAN <any> DI SINI
      $transaction: jest
        .fn<any>()
        .mockImplementation(async (callback: (client: typeof tx) => unknown) =>
          callback(tx),
        ),
    } as unknown as PrismaService;

    const service = new PurchaseOrderService(prisma);
    await service.create(BigInt(1), {
      supplierId: '1',
      status: 'DRAFT',
      items: [{ productUnitId: '2', quantity: 1 }],
    });

    expect(executeLock).toHaveBeenCalledTimes(1);
  });

  it('returns active PO cards with server-side pagination metadata', async () => {
    const count = jest.fn<any>().mockResolvedValue(2);
    const rows = [
      {
        purchaseOrderId: BigInt(10),
        purchaseOrderNumber: 'PO-290826-0000001',
        supplierId: BigInt(3),
        orderDate: new Date('2026-08-29'),
        expectedDate: new Date('2026-08-30'),
        status: 'READY',
        note: null,
        createdAt: new Date('2026-08-29'),
        createdBy: BigInt(1),
        updatedAt: null,
        updatedBy: null,
        supplier: { supplierName: 'Supplier Test' },
        createdByUser: { fullName: 'Administrator' },
        updatedByUser: null,
        details: [
          {
            purchaseOrderDetailId: BigInt(20),
            purchaseOrderId: BigInt(10),
            productUnitId: BigInt(5),
            quantity: { toString: () => '4' },
            note: null,
            productUnit: {
              productId: BigInt(6),
              product: { productName: 'Produk A' },
              unit: { unitName: 'Dus' },
            },
          },
        ],
      },
    ];
    const findMany = jest.fn<any>().mockResolvedValue(rows);
    const prisma = {
      purchaseOrder: { count, findMany },
    } as unknown as PrismaService;

    const service = new PurchaseOrderService(prisma);
    const result = await service.findAll({
      tab: 'ACTIVE',
      page: '1',
      limit: '20',
    });

    expect(result.meta).toEqual({
      currentPage: 1,
      pageSize: 20,
      totalData: 2,
      totalPage: 1,
    });
    expect(result.data[0]).toMatchObject({
      supplierName: 'Supplier Test',
      totalItem: 1,
      totalQuantity: 4,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
        where: { status: { in: ['DRAFT', 'READY'] } },
      }),
    );
    expect(count).toHaveBeenCalledWith({
      where: { status: { in: ['DRAFT', 'READY'] } },
    });
  });

  it('allows an existing READY purchase order to be edited', async () => {
    const update = jest
      .fn<any>()
      .mockResolvedValue({ purchaseOrderId: BigInt(7), details: [] });
    const tx = {
      $queryRaw: jest
        .fn<any>()
        .mockResolvedValue([{ purchase_order_id: BigInt(7) }]),
      purchaseOrder: {
        findUnique: jest.fn<any>().mockResolvedValue({
          purchaseOrderId: BigInt(7),
          purchaseOrderNumber: 'PO-READY',
          status: 'READY',
          details: [],
        }),
        update,
      },
      supplier: {
        findUnique: jest.fn<any>().mockResolvedValue({ isActive: true }),
      },
      productUnit: { count: jest.fn<any>().mockResolvedValue(1) },
      purchaseOrderDetail: {
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
      activityLog: { create: jest.fn<any>().mockResolvedValue({}) },
      auditLog: { create: jest.fn<any>().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest
        .fn<any>()
        .mockImplementation(async (callback: (client: typeof tx) => unknown) =>
          callback(tx),
        ),
    } as unknown as PrismaService;

    await new PurchaseOrderService(prisma).update(BigInt(1), '7', {
      supplierId: '3',
      status: 'READY',
      expectedDate: '2026-08-30',
      items: [{ productUnitId: '5', quantity: 4 }],
    });

    expect(update).toHaveBeenCalledTimes(1);
  });
});
