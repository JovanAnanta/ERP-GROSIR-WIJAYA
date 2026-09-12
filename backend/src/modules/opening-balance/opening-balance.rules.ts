import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';

const ZERO = new Prisma.Decimal(0);

export function calculateInventoryOpeningAmounts(input: {
  quantity: Prisma.Decimal;
  inputUnitCost: Prisma.Decimal;
  selectedConversionFactor: Prisma.Decimal;
  parentConversionFactor: Prisma.Decimal;
}) {
  if (
    input.quantity.lessThan(ZERO) ||
    input.inputUnitCost.lessThan(ZERO) ||
    input.selectedConversionFactor.lessThanOrEqualTo(ZERO) ||
    input.parentConversionFactor.lessThanOrEqualTo(ZERO)
  ) {
    throw new HttpException(
      'Qty, modal, atau konversi saldo awal tidak valid.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
  const parentQuantity = input.quantity
    .mul(input.selectedConversionFactor)
    .div(input.parentConversionFactor)
    .toDecimalPlaces(3);
  const totalCost = input.quantity.greaterThan(ZERO)
    ? input.quantity.mul(input.inputUnitCost).toDecimalPlaces(2)
    : ZERO;
  const parentUnitCost = parentQuantity.greaterThan(ZERO)
    ? totalCost.div(parentQuantity).toDecimalPlaces(6)
    : ZERO;
  return { parentQuantity, totalCost, parentUnitCost };
}
