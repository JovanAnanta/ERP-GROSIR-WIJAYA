import { Prisma } from '../../../generated/prisma/client.js';
import {
  inventoryLoanOutstanding,
  splitLoanCostRevaluation,
} from './inventory-loan.rules.js';

describe('Inventory Loan business rules', () => {
  it('menghitung sisa dari return, invoice, dan write-off tanpa hitung ganda', () => {
    expect(
      inventoryLoanOutstanding({
        quantity: new Prisma.Decimal(10),
        returnedQuantity: new Prisma.Decimal(3),
        convertedQuantity: new Prisma.Decimal(2),
        writtenOffQuantity: new Prisma.Decimal(1),
      }).toString(),
    ).toBe('4');
  });

  it('membagi koreksi modal antara inventory tersisa dan HPP terpakai', () => {
    const result = splitLoanCostRevaluation({
      quantity: new Prisma.Decimal(10),
      remainingQuantity: new Prisma.Decimal(6),
      oldUnitCost: new Prisma.Decimal(100),
      finalUnitCost: new Prisma.Decimal(110),
    });
    expect(result.inventory.toString()).toBe('60');
    expect(result.consumed.toString()).toBe('40');
    expect(result.total.toString()).toBe('100');
  });

  it('mendukung koreksi modal turun tanpa kehilangan keseimbangan', () => {
    const result = splitLoanCostRevaluation({
      quantity: new Prisma.Decimal(5),
      remainingQuantity: new Prisma.Decimal(2),
      oldUnitCost: new Prisma.Decimal(120),
      finalUnitCost: new Prisma.Decimal(100),
    });
    expect(result.inventory.add(result.consumed).equals(result.total)).toBe(
      true,
    );
    expect(result.total.toString()).toBe('-100');
  });
});
