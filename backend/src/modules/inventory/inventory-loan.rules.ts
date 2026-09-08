import { Prisma } from '../../../generated/prisma/client.js';

export function inventoryLoanOutstanding(input: {
  quantity: Prisma.Decimal;
  returnedQuantity: Prisma.Decimal;
  convertedQuantity: Prisma.Decimal;
  writtenOffQuantity: Prisma.Decimal;
}) {
  return input.quantity
    .sub(input.returnedQuantity)
    .sub(input.convertedQuantity)
    .sub(input.writtenOffQuantity);
}

export function splitLoanCostRevaluation(input: {
  quantity: Prisma.Decimal;
  remainingQuantity: Prisma.Decimal;
  oldUnitCost: Prisma.Decimal;
  finalUnitCost: Prisma.Decimal;
}) {
  const remaining = Prisma.Decimal.min(input.quantity, input.remainingQuantity);
  const consumed = input.quantity.sub(remaining);
  const difference = input.finalUnitCost.sub(input.oldUnitCost);
  return {
    inventory: remaining.mul(difference).toDecimalPlaces(2),
    consumed: consumed.mul(difference).toDecimalPlaces(2),
    total: input.quantity.mul(difference).toDecimalPlaces(2),
  };
}
