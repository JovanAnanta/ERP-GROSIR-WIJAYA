import { HttpException, HttpStatus } from '@nestjs/common';
import {
  Prisma,
  SalesPaymentStatus,
} from '../../../generated/prisma/client.js';

const ZERO = new Prisma.Decimal(0);

// Customer selection, not a client-supplied party label, determines credit eligibility.
export function resolveSalesInvoiceTerms(input: {
  customerId?: string;
  paymentType: 'CASH' | 'CREDIT';
  dueDate?: string;
}) {
  return input.customerId
    ? {
        partyType: 'CUSTOMER' as const,
        paymentType: input.paymentType,
        dueDate: input.dueDate,
      }
    : {
        partyType: 'GUEST' as const,
        paymentType: 'CASH' as const,
        dueDate: undefined,
      };
}

export function calculateSalesLineSubtotal(
  quantity: Prisma.Decimal,
  unitPrice: Prisma.Decimal,
  discountAmount: Prisma.Decimal,
) {
  return quantity.mul(unitPrice).sub(discountAmount).toDecimalPlaces(2);
}

export function toSalesParentQuantity(input: {
  quantity: Prisma.Decimal;
  selectedConversionFactor: Prisma.Decimal;
  parentConversionFactor: Prisma.Decimal;
}) {
  if (
    input.quantity.lessThan(ZERO) ||
    input.selectedConversionFactor.lessThanOrEqualTo(ZERO) ||
    input.parentConversionFactor.lessThanOrEqualTo(ZERO)
  ) {
    throw new HttpException(
      'Konversi satuan Sales tidak valid.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
  return input.quantity
    .mul(input.selectedConversionFactor)
    .div(input.parentConversionFactor);
}

export function resolveSalesPaymentStatus(
  paidAmount: Prisma.Decimal,
  outstandingAmount: Prisma.Decimal,
): SalesPaymentStatus {
  if (outstandingAmount.equals(0)) return SalesPaymentStatus.PAID;
  return paidAmount.greaterThan(0)
    ? SalesPaymentStatus.PARTIAL
    : SalesPaymentStatus.UNPAID;
}

export function resolveSalesPaymentType(input: {
  partyType: 'CUSTOMER' | 'GUEST';
  outstandingAmount: Prisma.Decimal;
  previousPaymentType?: 'CASH' | 'CREDIT';
}): 'CASH' | 'CREDIT' {
  if (input.partyType === 'GUEST') return 'CASH';
  return input.previousPaymentType === 'CREDIT' ||
    input.outstandingAmount.greaterThan(0)
    ? 'CREDIT'
    : 'CASH';
}

export function assertGuestPaymentIsUnpaidOrPaid(input: {
  partyType: 'CUSTOMER' | 'GUEST';
  paidAmount: Prisma.Decimal;
  outstandingAmount: Prisma.Decimal;
}) {
  if (
    input.partyType === 'GUEST' &&
    input.paidAmount.greaterThan(0) &&
    input.outstandingAmount.greaterThan(0)
  ) {
    throw new HttpException(
      'Guest hanya dapat memilih belum bayar atau bayar lunas.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export function assertValidSalesPayment(
  amount: Prisma.Decimal,
  outstandingAmount: Prisma.Decimal,
) {
  if (amount.lessThanOrEqualTo(0)) {
    throw new HttpException(
      'Nominal pembayaran harus lebih besar dari nol.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
  if (amount.greaterThan(outstandingAmount)) {
    throw new HttpException(
      'Nominal pembayaran melebihi outstanding.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export function assertValidSourceAllocation(input: {
  orderedQuantity: Prisma.Decimal;
  orderedBonusQuantity: Prisma.Decimal;
  fulfilledQuantity: Prisma.Decimal;
  fulfilledBonusQuantity: Prisma.Decimal;
  requestedQuantity: Prisma.Decimal;
  requestedBonusQuantity: Prisma.Decimal;
}) {
  const nextQuantity = input.fulfilledQuantity.add(input.requestedQuantity);
  const nextBonus = input.fulfilledBonusQuantity.add(
    input.requestedBonusQuantity,
  );
  if (nextQuantity.greaterThan(input.orderedQuantity)) {
    throw new HttpException(
      'Qty konversi melebihi sisa Sales Order.',
      HttpStatus.CONFLICT,
    );
  }
  if (nextBonus.greaterThan(input.orderedBonusQuantity)) {
    throw new HttpException(
      'Qty bonus konversi melebihi sisa bonus Sales Order.',
      HttpStatus.CONFLICT,
    );
  }
  if (
    nextQuantity.greaterThanOrEqualTo(input.orderedQuantity) &&
    nextBonus.lessThan(input.orderedBonusQuantity)
  ) {
    throw new HttpException(
      'Sisa bonus Sales Order harus disertakan saat qty utama dipenuhi seluruhnya.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
