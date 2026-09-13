import { HttpException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  postFinancialMovement,
  postJournalEntry,
} from './financial-posting.js';

function transaction(balance = 1000) {
  const cashChart = { chartAccountId: 1n, accountCode: '1101', isActive: true };
  const counter = { chartAccountId: 2n, accountCode: '1201', isActive: true };
  return {
    $executeRaw: jest.fn<any>().mockResolvedValue(1),
    financialAccount: {
      findUnique: jest.fn<any>().mockResolvedValue({
        financialAccountId: 1n,
        accountName: 'KAS',
        accountType: 'CASH',
        currentBalance: new Prisma.Decimal(balance),
        isActive: true,
        chartAccount: cashChart,
      }),
      update: jest.fn<any>().mockResolvedValue(undefined),
    },
    chartOfAccount: {
      findUnique: jest.fn<any>().mockResolvedValue(counter),
      findMany: jest.fn<any>().mockResolvedValue([cashChart, counter]),
    },
    financialAccountTransaction: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest
        .fn<any>()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...data, financialAccountTransactionId: 10n }),
        ),
    },
    financialDailySummary: {
      upsert: jest.fn<any>().mockResolvedValue(undefined),
    },
    journalAccountDailySummary: {
      upsert: jest.fn<any>().mockResolvedValue(undefined),
    },
    journalEntry: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest
        .fn<any>()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...data, journalEntryId: 11n }),
        ),
    },
  };
}

const input = {
  financialAccountId: 1n,
  direction: 'OUT' as const,
  amount: new Prisma.Decimal(250),
  transactionType: 'PURCHASE_PAYMENT',
  sourceModule: 'PURCHASE',
  referenceType: 'PURCHASE_INVOICE',
  referenceId: 5n,
  referenceNumber: 'PI-080926-0000001',
  transactionDate: new Date('2026-09-08T10:00:00+07:00'),
  description: 'Pembayaran PI',
  createdBy: 1n,
  counterChartAccountCode: '2101',
};

describe('postFinancialMovement', () => {
  it('mengunci akun dan menulis saldo, ringkasan, serta jurnal seimbang', async () => {
    const tx = transaction();
    const result = await postFinancialMovement(tx as never, input);
    expect(result.balanceBefore.toString()).toBe('1000');
    expect(result.balanceAfter.toString()).toBe('750');
    expect(tx.financialAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentBalance: expect.anything() }),
      }),
    );
    expect(tx.financialDailySummary.upsert).toHaveBeenCalledTimes(1);
    expect(tx.journalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lines: expect.objectContaining({ create: expect.any(Array) }),
        }),
      }),
    );
    expect(tx.journalAccountDailySummary.upsert).toHaveBeenCalledTimes(2);
  });

  it('menolak kas keluar yang membuat saldo negatif sebelum ada mutasi', async () => {
    const tx = transaction(100);
    await expect(
      postFinancialMovement(tx as never, input),
    ).rejects.toBeInstanceOf(HttpException);
    expect(tx.financialAccountTransaction.create).not.toHaveBeenCalled();
    expect(tx.financialAccount.update).not.toHaveBeenCalled();
  });

  it('menolak akun yang sudah dinonaktifkan walaupun masih terbuka di frontend', async () => {
    const tx = transaction();
    tx.financialAccount.findUnique.mockResolvedValueOnce({
      financialAccountId: 1n,
      accountName: 'Bank Lama',
      accountType: 'BANK',
      currentBalance: new Prisma.Decimal(1000),
      isActive: false,
      chartAccount: { chartAccountId: 1n, accountCode: '1102' },
    });

    await expect(
      postFinancialMovement(tx as never, input),
    ).rejects.toBeInstanceOf(HttpException);
    expect(tx.financialAccountTransaction.create).not.toHaveBeenCalled();
    expect(tx.financialAccount.update).not.toHaveBeenCalled();
  });

  it('membatalkan jurnal yang tidak seimbang sebelum ditulis', async () => {
    const tx = transaction();
    await expect(
      postJournalEntry(tx as never, {
        postingKey: 'TEST:UNBALANCED',
        transactionDate: new Date(),
        description: 'Tidak seimbang',
        sourceType: 'TEST',
        createdBy: 1n,
        lines: [
          { chartAccountCode: '1101', debitAmount: new Prisma.Decimal(100) },
          { chartAccountCode: '1201', creditAmount: new Prisma.Decimal(90) },
        ],
      }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });
});
