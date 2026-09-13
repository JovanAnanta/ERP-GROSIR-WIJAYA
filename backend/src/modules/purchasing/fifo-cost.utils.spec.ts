import { Prisma } from '../../../generated/prisma/client.js';
import {
  effectiveRemainingUnitCost,
  toBaseQuantity,
  toBaseUnitCost,
} from './fifo-cost.utils.js';

describe('FIFO base-unit calculations', () => {
  it('stores purchase cost in the smallest/base unit', () => {
    const baseQuantity = toBaseQuantity(
      new Prisma.Decimal(2),
      new Prisma.Decimal(12),
      new Prisma.Decimal(1),
    );
    const baseUnitCost = toBaseUnitCost(
      new Prisma.Decimal(240000),
      baseQuantity,
    );

    expect(baseQuantity.toString()).toBe('24');
    expect(baseUnitCost.toString()).toBe('10000');
  });

  it('spreads invoice cost across purchased and bonus quantities', () => {
    const purchasedQuantity = toBaseQuantity(
      new Prisma.Decimal(10),
      new Prisma.Decimal(1),
      new Prisma.Decimal(1),
    );
    const bonusQuantity = toBaseQuantity(
      new Prisma.Decimal(2),
      new Prisma.Decimal(1),
      new Prisma.Decimal(1),
    );
    const baseUnitCost = toBaseUnitCost(
      new Prisma.Decimal(120000),
      purchasedQuantity.add(bonusQuantity),
    );

    expect(purchasedQuantity.add(bonusQuantity).toString()).toBe('12');
    expect(baseUnitCost.toString()).toBe('10000');
  });

  it('uses remaining cost for compatibility with legacy FIFO unitCost values', () => {
    const cost = effectiveRemainingUnitCost(
      new Prisma.Decimal(60000),
      new Prisma.Decimal(6),
      new Prisma.Decimal(120000),
      new Prisma.Decimal(12),
    );

    expect(cost.toString()).toBe('10000');
  });
});
