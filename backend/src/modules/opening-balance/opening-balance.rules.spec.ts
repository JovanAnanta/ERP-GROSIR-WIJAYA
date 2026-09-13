import { HttpException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { calculateInventoryOpeningAmounts } from './opening-balance.rules.js';

const decimal = (value: number) => new Prisma.Decimal(value);

describe('inventory opening balance calculations', () => {
  it('converts the selected unit into the configured FIFO parent unit', () => {
    const result = calculateInventoryOpeningAmounts({
      quantity: decimal(2),
      inputUnitCost: decimal(250000),
      selectedConversionFactor: decimal(25),
      parentConversionFactor: decimal(1),
    });
    expect(result.parentQuantity.toString()).toBe('50');
    expect(result.totalCost.toString()).toBe('500000');
    expect(result.parentUnitCost.toString()).toBe('10000');
  });

  it('does not create a value for a zero quantity', () => {
    const result = calculateInventoryOpeningAmounts({
      quantity: decimal(0),
      inputUnitCost: decimal(250000),
      selectedConversionFactor: decimal(25),
      parentConversionFactor: decimal(1),
    });
    expect(result.parentQuantity.isZero()).toBe(true);
    expect(result.totalCost.isZero()).toBe(true);
    expect(result.parentUnitCost.isZero()).toBe(true);
  });

  it('rejects invalid conversion factors', () => {
    expect(() =>
      calculateInventoryOpeningAmounts({
        quantity: decimal(1),
        inputUnitCost: decimal(10),
        selectedConversionFactor: decimal(0),
        parentConversionFactor: decimal(1),
      }),
    ).toThrow(HttpException);
  });
});
