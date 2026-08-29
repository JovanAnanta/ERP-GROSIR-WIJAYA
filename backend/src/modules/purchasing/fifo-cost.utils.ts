import { Prisma } from '../../../generated/prisma/client.js';

export function toBaseQuantity(
  quantity: Prisma.Decimal,
  conversionFactor: Prisma.Decimal,
  baseConversionFactor: Prisma.Decimal,
) {
  if (baseConversionFactor.lessThanOrEqualTo(0)) {
    throw new Error('Base conversion factor must be greater than zero.');
  }
  return quantity.mul(conversionFactor).div(baseConversionFactor);
}

export function toBaseUnitCost(
  totalCost: Prisma.Decimal,
  baseQuantity: Prisma.Decimal,
) {
  if (baseQuantity.lessThanOrEqualTo(0)) {
    throw new Error('Base quantity must be greater than zero.');
  }
  return totalCost.div(baseQuantity);
}

export function effectiveRemainingUnitCost(
  remainingCost: Prisma.Decimal,
  remainingQuantity: Prisma.Decimal,
  originalCost: Prisma.Decimal,
  originalQuantity: Prisma.Decimal,
) {
  return remainingQuantity.greaterThan(0)
    ? toBaseUnitCost(remainingCost, remainingQuantity)
    : toBaseUnitCost(originalCost, originalQuantity);
}
