import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';

export interface PaymentAmountInput {
  paymentAmount: number | string;
}

export function calculateTotalPaid(
  invoiceTotal: Prisma.Decimal,
  payments: readonly PaymentAmountInput[] | undefined,
): Prisma.Decimal {
  const totalPaid = (payments ?? []).reduce(
    (total, payment) => total.add(new Prisma.Decimal(payment.paymentAmount)),
    new Prisma.Decimal(0),
  );

  if (totalPaid.greaterThan(invoiceTotal)) {
    throw new HttpException(
      'Total pembayaran tidak boleh melebihi total faktur',
      HttpStatus.BAD_REQUEST,
    );
  }

  return totalPaid;
}
