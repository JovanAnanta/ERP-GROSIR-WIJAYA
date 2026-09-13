import { HttpException } from '@nestjs/common';
import {
  Prisma,
  SalesPaymentStatus,
} from '../../../generated/prisma/client.js';
import {
  assertValidSourceAllocation,
  assertValidSalesPayment,
  calculateSalesLineSubtotal,
  assertGuestPaymentIsUnpaidOrPaid,
  resolveSalesPaymentStatus,
  resolveSalesPaymentType,
  resolveSalesInvoiceTerms,
  toSalesParentQuantity,
} from './sales-rules.utils.js';

describe('sales business rules', () => {
  it('treats a named guest without a customer as non-credit without a due date', () => {
    expect(
      resolveSalesInvoiceTerms({
        paymentType: 'CREDIT',
        dueDate: '2026-09-10',
      }),
    ).toEqual({ partyType: 'GUEST', paymentType: 'CASH', dueDate: undefined });
  });

  it('preserves payment terms for a selected customer', () => {
    expect(
      resolveSalesInvoiceTerms({
        customerId: '7',
        paymentType: 'CREDIT',
        dueDate: '2026-09-10',
      }),
    ).toEqual({
      partyType: 'CUSTOMER',
      paymentType: 'CREDIT',
      dueDate: '2026-09-10',
    });
  });
  it('calculates revenue from paid quantity without charging bonus quantity', () => {
    const result = calculateSalesLineSubtotal(
      new Prisma.Decimal(10),
      new Prisma.Decimal(12_000),
      new Prisma.Decimal(5_000),
    );
    expect(result.toNumber()).toBe(115_000);
  });

  it('converts a selected sales unit back to the configured FIFO parent unit', () => {
    expect(
      toSalesParentQuantity({
        quantity: new Prisma.Decimal(25),
        selectedConversionFactor: new Prisma.Decimal('0.04'),
        parentConversionFactor: new Prisma.Decimal(1),
      }).toString(),
    ).toBe('1');
    expect(
      toSalesParentQuantity({
        quantity: new Prisma.Decimal(2),
        selectedConversionFactor: new Prisma.Decimal(1),
        parentConversionFactor: new Prisma.Decimal(1),
      }).toString(),
    ).toBe('2');
  });

  it.each([
    ['negative quantity', '-1', '1', '1'],
    ['zero selected conversion', '1', '0', '1'],
    ['zero parent conversion', '1', '1', '0'],
  ])(
    'rejects an invalid parent-unit conversion: %s',
    (_case, quantity, selectedConversionFactor, parentConversionFactor) => {
      expect(() =>
        toSalesParentQuantity({
          quantity: new Prisma.Decimal(quantity),
          selectedConversionFactor: new Prisma.Decimal(
            selectedConversionFactor,
          ),
          parentConversionFactor: new Prisma.Decimal(parentConversionFactor),
        }),
      ).toThrow(HttpException);
    },
  );

  it.each([
    [0, 100_000, SalesPaymentStatus.UNPAID],
    [25_000, 75_000, SalesPaymentStatus.PARTIAL],
    [100_000, 0, SalesPaymentStatus.PAID],
  ])(
    'resolves payment status from immutable payment totals',
    (paid, outstanding, expected) => {
      expect(
        resolveSalesPaymentStatus(
          new Prisma.Decimal(paid),
          new Prisma.Decimal(outstanding),
        ),
      ).toBe(expected);
    },
  );

  it('automatically treats an unpaid or partially paid customer invoice as credit', () => {
    expect(
      resolveSalesPaymentType({
        partyType: 'CUSTOMER',
        outstandingAmount: new Prisma.Decimal(75_000),
      }),
    ).toBe('CREDIT');
    expect(
      resolveSalesPaymentType({
        partyType: 'CUSTOMER',
        outstandingAmount: new Prisma.Decimal(0),
      }),
    ).toBe('CASH');
  });

  it('preserves customer credit history after the invoice is later paid', () => {
    expect(
      resolveSalesPaymentType({
        partyType: 'CUSTOMER',
        outstandingAmount: new Prisma.Decimal(0),
        previousPaymentType: 'CREDIT',
      }),
    ).toBe('CREDIT');
  });

  it('allows Guest to be unpaid or paid, but rejects partial payment', () => {
    expect(() =>
      assertGuestPaymentIsUnpaidOrPaid({
        partyType: 'GUEST',
        paidAmount: new Prisma.Decimal(0),
        outstandingAmount: new Prisma.Decimal(100_000),
      }),
    ).not.toThrow();
    expect(() =>
      assertGuestPaymentIsUnpaidOrPaid({
        partyType: 'GUEST',
        paidAmount: new Prisma.Decimal(100_000),
        outstandingAmount: new Prisma.Decimal(0),
      }),
    ).not.toThrow();
    expect(() =>
      assertGuestPaymentIsUnpaidOrPaid({
        partyType: 'GUEST',
        paidAmount: new Prisma.Decimal(25_000),
        outstandingAmount: new Prisma.Decimal(75_000),
      }),
    ).toThrow(HttpException);
  });

  it('rejects overpayment before any financial mutation is written', () => {
    expect(() =>
      assertValidSalesPayment(
        new Prisma.Decimal(100_001),
        new Prisma.Decimal(100_000),
      ),
    ).toThrow(HttpException);
  });

  it.each([
    [11, 0, 10, 0],
    [5, 3, 10, 2],
    [10, 1, 10, 2],
  ])(
    'rejects invalid partial SO allocation (qty=%s, bonus=%s)',
    (requestedQuantity, requestedBonus, orderedQuantity, orderedBonus) => {
      expect(() =>
        assertValidSourceAllocation({
          orderedQuantity: new Prisma.Decimal(orderedQuantity),
          orderedBonusQuantity: new Prisma.Decimal(orderedBonus),
          fulfilledQuantity: new Prisma.Decimal(0),
          fulfilledBonusQuantity: new Prisma.Decimal(0),
          requestedQuantity: new Prisma.Decimal(requestedQuantity),
          requestedBonusQuantity: new Prisma.Decimal(requestedBonus),
        }),
      ).toThrow(HttpException);
    },
  );

  it('allows a partial SO allocation while preserving the original order quantity', () => {
    expect(() =>
      assertValidSourceAllocation({
        orderedQuantity: new Prisma.Decimal(10),
        orderedBonusQuantity: new Prisma.Decimal(2),
        fulfilledQuantity: new Prisma.Decimal(3),
        fulfilledBonusQuantity: new Prisma.Decimal(1),
        requestedQuantity: new Prisma.Decimal(2),
        requestedBonusQuantity: new Prisma.Decimal(0),
      }),
    ).not.toThrow();
  });
});
