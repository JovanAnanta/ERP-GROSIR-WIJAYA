import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { calculateTotalPaid } from './purchase-payment.utils.js';

describe('calculateTotalPaid', () => {
  it('accepts a payment equal to the invoice total', () => {
    const result = calculateTotalPaid(new Prisma.Decimal('100.00'), [
      { paymentAmount: '100.00' },
    ]);

    expect(result.equals(new Prisma.Decimal('100.00'))).toBe(true);
  });

  it('accepts partial payments', () => {
    const result = calculateTotalPaid(new Prisma.Decimal('100.00'), [
      { paymentAmount: '35.25' },
    ]);

    expect(result.equals(new Prisma.Decimal('35.25'))).toBe(true);
  });

  it('rejects payments exceeding the invoice total', () => {
    try {
      calculateTotalPaid(new Prisma.Decimal('100.00'), [
        { paymentAmount: '100.01' },
      ]);
      throw new Error('Expected overpayment to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    }
  });
});
