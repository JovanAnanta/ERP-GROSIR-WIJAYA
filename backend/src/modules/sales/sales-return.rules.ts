import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';

const ZERO = new Prisma.Decimal(0);

export function assertReturnQuantity(input: {
  sold: Prisma.Decimal;
  soldBonus: Prisma.Decimal;
  previouslyReturned: Prisma.Decimal;
  previouslyReturnedBonus: Prisma.Decimal;
  requested: Prisma.Decimal;
  requestedBonus: Prisma.Decimal;
}) {
  if (
    input.requested.lessThan(0) ||
    input.requestedBonus.lessThan(0) ||
    input.requested.add(input.previouslyReturned).greaterThan(input.sold) ||
    input.requestedBonus
      .add(input.previouslyReturnedBonus)
      .greaterThan(input.soldBonus)
  ) {
    throw new HttpException(
      'Jumlah retur melebihi jumlah normal atau bonus yang dijual.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export function resolveReturnSettlement(
  returnTotal: Prisma.Decimal,
  sourceOutstanding: Prisma.Decimal,
) {
  const receivableOffset = Prisma.Decimal.min(
    Prisma.Decimal.max(ZERO, returnTotal),
    Prisma.Decimal.max(ZERO, sourceOutstanding),
  );
  return {
    receivableOffset,
    residualCredit: returnTotal.sub(receivableOffset),
  };
}
