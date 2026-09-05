import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

const enabled = process.env.SALES_E2E_ENABLED === 'true';
const describeSales = enabled ? describe : describe.skip;

describeSales('Sales workflow against an isolated PostgreSQL database', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let agent: ReturnType<typeof request.agent>;
  let actorId: bigint;
  let customerId: bigint;
  let childUnitId: bigint;
  let parentUnitId: bigint;
  let accountId: bigint;

  const date = '2026-09-05T08:00:00.000Z';

  beforeAll(async () => {
    BigInt.prototype.toJSON = function (): string {
      return this.toString();
    };
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
    agent = request.agent(app.getHttpServer());

    const role = await prisma.role.create({
      data: {
        roleCode: 'SUPER_OWNER',
        roleName: 'Super Owner',
        isActive: true,
      },
    });
    const testPassword = process.env.E2E_ADMIN_PASSWORD;
    if (!testPassword) throw new Error('E2E_ADMIN_PASSWORD is required.');
    const actor = await prisma.user.create({
      data: {
        username: 'admin',
        passwordHash: await bcrypt.hash(testPassword, 10),
        fullName: 'Sales E2E Admin',
        roleId: role.roleId,
        isActive: true,
      },
    });
    actorId = actor.userId;
    const category = await prisma.category.create({
      data: {
        categoryName: 'E2E Sales Category',
        isActive: true,
        createdBy: actorId,
      },
    });
    const parentUnit = await prisma.unit.create({
      data: { unitName: 'E2E BAL', isActive: true, createdBy: actorId },
    });
    const childUnit = await prisma.unit.create({
      data: { unitName: 'E2E KG', isActive: true, createdBy: actorId },
    });
    const product = await prisma.product.create({
      data: {
        productName: 'E2E Tepung',
        categoryId: category.categoryId,
        isActive: true,
        minimumInventoryQty: 0,
        createdBy: actorId,
      },
    });
    const parent = await prisma.productUnit.create({
      data: {
        productId: product.productId,
        unitId: parentUnit.unitId,
        conversionFactor: 1,
        displayOrder: 1,
        isParent: true,
        isActive: true,
        createdBy: actorId,
      },
    });
    parentUnitId = parent.productUnitId;
    const child = await prisma.productUnit.create({
      data: {
        productId: product.productId,
        unitId: childUnit.unitId,
        parentProductUnitId: parent.productUnitId,
        conversionFactor: 0.04,
        displayOrder: 2,
        isParent: false,
        isActive: true,
        createdBy: actorId,
      },
    });
    childUnitId = child.productUnitId;
    await prisma.inventoryStock.create({
      data: {
        productId: product.productId,
        productUnitId: parent.productUnitId,
        actualQty: 10,
        availableQty: 10,
        packedQty: 0,
      },
    });
    const openingMovement = await prisma.inventoryMovement.create({
      data: {
        movementNumber: 'IM-IN-050926-9000001',
        productUnitId: parent.productUnitId,
        direction: 'IN',
        quantity: 10,
        movementType: 'OPENING_BALANCE',
        originType: 'OPENING_BALANCE',
        originId: 1,
        originNumber: 'OB-050926-9000001',
        movementDate: new Date(date),
        createdBy: actorId,
      },
    });
    await prisma.fifoLayer.create({
      data: {
        fifoLayerNumber: 'FIFO-050926-9000001',
        productUnitId: parent.productUnitId,
        originType: 'OPENING_BALANCE',
        originInventoryMovementId: openingMovement.inventoryMovementId,
        originId: 1,
        originalQty: 10,
        remainingQty: 10,
        unitCost: 250_000,
        originalCost: 2_500_000,
        remainingCost: 2_500_000,
        createdBy: actorId,
      },
    });
    const customer = await prisma.customer.create({
      data: {
        customerName: 'E2E Customer',
        phone: '080000000001',
        isActive: true,
        createdBy: actorId,
      },
    });
    customerId = customer.customerId;
    const account = await prisma.financialAccount.create({
      data: {
        accountName: 'KAS',
        accountType: 'CASH',
        openingBalance: 0,
        currentBalance: 0,
        isActive: true,
        createdBy: actorId,
      },
    });
    accountId = account.financialAccountId;

    const login = await agent
      .post('/api/v1/auth/login')
      .set('x-device-id', 'sales-e2e')
      .send({ username: 'admin', password: process.env.E2E_ADMIN_PASSWORD });
    expect(login.status).toBe(200);
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  const invoicePayload = (quantity: number, overrides = {}) => ({
    customerId: customerId.toString(),
    partyType: 'CUSTOMER',
    customerName: 'E2E Customer',
    salesChannel: 'MANUAL',
    paymentType: 'CREDIT',
    invoiceDate: date,
    dueDate: '2026-09-12',
    discountAmount: 0,
    status: 'DRAFT',
    snapshotMode: 'IGNORE',
    items: [
      {
        productUnitId: childUnitId.toString(),
        quantity,
        unitPrice: 10_000,
        discountAmount: 0,
        bonusQuantity: 0,
      },
    ],
    ...overrides,
  });

  it('serializes payment/completion, preserves partial SO allocation, and restores the exact parent FIFO quantity', async () => {
    const created = await agent
      .post('/api/v1/sales/invoices')
      .send(invoicePayload(25));
    expect(created.status).toBe(201);
    const invoiceId = created.body.data.salesInvoiceId as string;

    const payment = {
      financialAccountId: accountId.toString(),
      paymentAmount: 150_000,
      paymentMethod: 'CASH',
      paymentDate: date,
    };
    const concurrentPayments = await Promise.all([
      agent.post(`/api/v1/sales/invoices/${invoiceId}/payments`).send(payment),
      agent.post(`/api/v1/sales/invoices/${invoiceId}/payments`).send(payment),
    ]);
    expect(concurrentPayments.filter((response) => response.status < 300)).toHaveLength(1);
    expect(concurrentPayments.filter((response) => response.status === 422)).toHaveLength(1);

    const completion = await agent.post(
      `/api/v1/sales/invoices/${invoiceId}/complete`,
    );
    expect(completion.status).toBe(201);
    const completed = await prisma.salesInvoice.findUniqueOrThrow({
      where: { salesInvoiceId: BigInt(invoiceId) },
    });
    expect(completed.status).toBe('COMPLETED');
    expect(completed.outstandingAmount.toString()).toBe('100000');

    const sourceMovement = await prisma.inventoryMovement.findFirstOrThrow({
      where: { originType: 'SALES_INVOICE', originId: BigInt(invoiceId) },
    });
    expect(sourceMovement.productUnitId).toBe(parentUnitId);
    expect(sourceMovement.quantity.toString()).toBe('1');

    const returned = await agent
      .post(`/api/v1/sales/invoices/${invoiceId}/returns`)
      .send({
        returnDate: date,
        status: 'COMPLETED',
        resolutionType: 'REFUND',
        financialAccountId: accountId.toString(),
        refundPaymentMethod: 'CASH',
        items: [
          {
            salesInvoiceDetailId: (
              await prisma.salesInvoiceDetail.findFirstOrThrow({
                where: { salesInvoiceId: BigInt(invoiceId) },
              })
            ).salesInvoiceDetailId.toString(),
            quantity: 25,
            bonusQuantity: 0,
          },
        ],
      });
    expect(returned.status).toBe(201);
    const returnMovement = await prisma.inventoryMovement.findFirstOrThrow({
      where: {
        originType: 'SALES_RETURN',
        originId: BigInt(returned.body.data.salesReturnId),
      },
    });
    expect(returnMovement.productUnitId).toBe(parentUnitId);
    expect(returnMovement.quantity.toString()).toBe('1');
    const restoredStock = await prisma.inventoryStock.findUniqueOrThrow({
      where: { productUnitId: parentUnitId },
    });
    expect(restoredStock.actualQty.toString()).toBe('10');
    expect(restoredStock.availableQty.toString()).toBe('10');

    const orderCreated = await agent.post('/api/v1/sales/orders').send({
      customerId: customerId.toString(),
      customerName: 'E2E Customer',
      orderDate: date,
      status: 'DRAFT',
      salesChannel: 'MANUAL',
      discountAmount: 0,
      items: invoicePayload(10).items,
    });
    expect(orderCreated.status).toBe(201);
    const orderId = orderCreated.body.data.salesOrderId as string;
    const orderDetail = await prisma.salesOrderDetail.findFirstOrThrow({
      where: { salesOrderId: BigInt(orderId) },
    });
    const firstConversion = await agent.post('/api/v1/sales/invoices').send(
      invoicePayload(3, {
        salesOrderId: orderId,
        items: [
          {
            ...invoicePayload(3).items[0],
            salesOrderDetailId: orderDetail.salesOrderDetailId.toString(),
          },
        ],
      }),
    );
    expect(firstConversion.status).toBe(201);
    const secondConversion = await agent.post('/api/v1/sales/invoices').send(
      invoicePayload(2, {
        salesOrderId: orderId,
        items: [
          {
            ...invoicePayload(2).items[0],
            salesOrderDetailId: orderDetail.salesOrderDetailId.toString(),
          },
        ],
      }),
    );
    expect(secondConversion.status).toBe(201);
    const orderDetailResponse = await agent.get(`/api/v1/sales/orders/${orderId}`);
    expect(orderDetailResponse.status).toBe(200);
    expect(orderDetailResponse.body.data.hasInvoiceReference).toBe(true);
    expect(orderDetailResponse.body.data.details[0].remainingQuantity).toBe(5);
    expect(orderDetailResponse.body.data.status).not.toBe('COMPLETED');
    expect(
      orderDetailResponse.body.data.details[0].invoices
        .map((row: { quantity: number }) => row.quantity)
        .sort((a: number, b: number) => a - b),
    ).toEqual([2, 3]);
    const partialInvoiceTrace = await agent.get(
      `/api/v1/sales/invoices/${firstConversion.body.data.salesInvoiceId}`,
    );
    expect(partialInvoiceTrace.status).toBe(200);
    expect(partialInvoiceTrace.body.data.sourceOrderProgress.status).not.toBe(
      'COMPLETED',
    );
    expect(
      partialInvoiceTrace.body.data.sourceOrderProgress.remainingItems[0]
        .remainingQuantity,
    ).toBe(5);
    const editReferencedOrder = await agent
      .put(`/api/v1/sales/orders/${orderId}`)
      .send({
        customerId: customerId.toString(),
        orderDate: date,
        status: 'DRAFT',
        salesChannel: 'MANUAL',
        discountAmount: 0,
        items: invoicePayload(10).items,
      });
    expect(editReferencedOrder.status).toBe(409);

    const competingConversions = await Promise.all([
      agent.post('/api/v1/sales/invoices').send(
        invoicePayload(4, {
          salesOrderId: orderId,
          items: [
            {
              ...invoicePayload(4).items[0],
              salesOrderDetailId: orderDetail.salesOrderDetailId.toString(),
            },
          ],
        }),
      ),
      agent.post('/api/v1/sales/invoices').send(
        invoicePayload(4, {
          salesOrderId: orderId,
          items: [
            {
              ...invoicePayload(4).items[0],
              salesOrderDetailId: orderDetail.salesOrderDetailId.toString(),
            },
          ],
        }),
      ),
    ]);
    expect(
      competingConversions.filter((response) => response.status < 300),
    ).toHaveLength(1);
    expect(
      competingConversions.filter((response) => response.status === 409),
    ).toHaveLength(1);

    const afterConcurrentConversion = await agent.get(
      `/api/v1/sales/orders/${orderId}`,
    );
    expect(
      afterConcurrentConversion.body.data.details[0].remainingQuantity,
    ).toBe(1);
    const finalConversion = await agent.post('/api/v1/sales/invoices').send(
      invoicePayload(1, {
        salesOrderId: orderId,
        items: [
          {
            ...invoicePayload(1).items[0],
            salesOrderDetailId: orderDetail.salesOrderDetailId.toString(),
          },
        ],
      }),
    );
    expect(finalConversion.status).toBe(201);
    const fulfilledOrder = await agent.get(`/api/v1/sales/orders/${orderId}`);
    expect(fulfilledOrder.body.data.status).toBe('COMPLETED');
    expect(fulfilledOrder.body.data.details[0].remainingQuantity).toBe(0);
    const completedInvoiceTrace = await agent.get(
      `/api/v1/sales/invoices/${firstConversion.body.data.salesInvoiceId}`,
    );
    expect(completedInvoiceTrace.body.data.sourceOrderProgress.status).toBe(
      'COMPLETED',
    );
    expect(
      completedInvoiceTrace.body.data.sourceOrderProgress.remainingItems,
    ).toHaveLength(0);

    const directSplit = await agent.post('/api/v1/sales/invoices').send(
      invoicePayload(3, {
        orderItems: invoicePayload(2).items,
      }),
    );
    expect(directSplit.status).toBe(201);
    expect(directSplit.body.data.salesOrder).toBeTruthy();
    const directSplitInvoiceDetail =
      await prisma.salesInvoiceDetail.findFirstOrThrow({
        where: {
          salesInvoiceId: BigInt(directSplit.body.data.salesInvoiceId),
        },
      });
    const directSplitOrderDetail =
      await prisma.salesOrderDetail.findFirstOrThrow({
        where: {
          salesOrderId: BigInt(directSplit.body.data.salesOrder.salesOrderId),
        },
      });
    expect(directSplitInvoiceDetail.productUnitId).toBe(childUnitId);
    expect(directSplitOrderDetail.productUnitId).toBe(childUnitId);
    expect(directSplitInvoiceDetail.quantity.toString()).toBe('3');
    expect(directSplitOrderDetail.quantity.toString()).toBe('2');

    const concurrentInvoice = await agent
      .post('/api/v1/sales/invoices')
      .send(invoicePayload(1));
    const concurrentInvoiceId = concurrentInvoice.body.data.salesInvoiceId as string;
    const [paymentResponse, completionResponse] = await Promise.all([
      agent
        .post(`/api/v1/sales/invoices/${concurrentInvoiceId}/payments`)
        .send({ ...payment, paymentAmount: 10_000 }),
      agent.post(`/api/v1/sales/invoices/${concurrentInvoiceId}/complete`),
    ]);
    expect(paymentResponse.status).toBeLessThan(300);
    expect(completionResponse.status).toBeLessThan(300);
    const finalInvoice = await prisma.salesInvoice.findUniqueOrThrow({
      where: { salesInvoiceId: BigInt(concurrentInvoiceId) },
    });
    expect(finalInvoice.status).toBe('COMPLETED');
    expect(finalInvoice.statusPayment).toBe('PAID');
    expect(finalInvoice.outstandingAmount.toString()).toBe('0');
    expect(
      await prisma.inventoryMovement.count({
        where: {
          originType: 'SALES_INVOICE',
          originId: BigInt(concurrentInvoiceId),
        },
      }),
    ).toBe(1);

    const activeInvoices = await agent.get('/api/v1/sales/invoices').query({
      tab: 'ACTIVE',
      page: 1,
      limit: 100,
    });
    expect(activeInvoices.status).toBe(200);
    expect(
      activeInvoices.body.data.some(
        (row: { salesInvoiceId: string }) =>
          row.salesInvoiceId === concurrentInvoiceId,
      ),
    ).toBe(false);
    const historyInvoices = await agent.get('/api/v1/sales/invoices').query({
      tab: 'HISTORY',
      page: 1,
      limit: 100,
    });
    expect(historyInvoices.status).toBe(200);
    expect(
      historyInvoices.body.data.some(
        (row: { salesInvoiceId: string }) =>
          row.salesInvoiceId === concurrentInvoiceId,
      ),
    ).toBe(true);
  }, 60_000);
});
