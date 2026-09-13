import { Prisma } from '../../../generated/prisma/client.js';
import {
  assertReturnQuantity,
  resolveReturnSettlement,
} from './sales-return.rules.js';

describe('sales return rules', () => {
  it('tracks normal and bonus quantities independently', () => {
    expect(() =>
      assertReturnQuantity({
        sold: new Prisma.Decimal(10),
        soldBonus: new Prisma.Decimal(2),
        previouslyReturned: new Prisma.Decimal(3),
        previouslyReturnedBonus: new Prisma.Decimal(1),
        requested: new Prisma.Decimal(7),
        requestedBonus: new Prisma.Decimal(1),
      }),
    ).not.toThrow();
    expect(() =>
      assertReturnQuantity({
        sold: new Prisma.Decimal(10),
        soldBonus: new Prisma.Decimal(2),
        previouslyReturned: new Prisma.Decimal(3),
        previouslyReturnedBonus: new Prisma.Decimal(1),
        requested: new Prisma.Decimal(0),
        requestedBonus: new Prisma.Decimal(2),
      }),
    ).toThrow('jumlah normal atau bonus');
  });

  it('offsets receivable before producing refundable credit', () => {
    const result = resolveReturnSettlement(
      new Prisma.Decimal(125),
      new Prisma.Decimal(80),
    );
    expect(result.receivableOffset.toString()).toBe('80');
    expect(result.residualCredit.toString()).toBe('45');
  });
});
