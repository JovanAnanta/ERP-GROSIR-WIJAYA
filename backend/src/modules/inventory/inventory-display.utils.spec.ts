import { Prisma } from '../../../generated/prisma/client.js';
import {
  calculateUnitCosts,
  formatStockQuantity,
} from './inventory-display.utils.js';

const units = [
  {
    productUnitId: 2n,
    conversionFactor: new Prisma.Decimal(12),
    displayOrder: 2,
    unit: { unitName: 'DUS' },
  },
  {
    productUnitId: 1n,
    conversionFactor: new Prisma.Decimal(1),
    displayOrder: 1,
    unit: { unitName: 'LUSIN' },
  },
];

describe('inventory display conversions', () => {
  it('formats parent-unit quantity from largest unit to smallest unit', () => {
    expect(formatStockQuantity(20, units)).toBe('1 DUS 8 LUSIN');
  });

  it('derives every unit cost from the parent/smallest unit cost', () => {
    expect(
      calculateUnitCosts(
        new Prisma.Decimal(10_000),
        new Prisma.Decimal(1),
        units,
      ),
    ).toEqual([
      { productUnitId: 2n, unitName: 'DUS', unitCost: 120_000 },
      { productUnitId: 1n, unitName: 'LUSIN', unitCost: 10_000 },
    ]);
  });
});
