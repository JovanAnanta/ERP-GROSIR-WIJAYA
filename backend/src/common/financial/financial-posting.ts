import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  generateFinancialAccountTransactionNumber,
  generateJournalEntryNumber,
} from './transaction-number.utils.js';

const ZERO = new Prisma.Decimal(0);

export interface FinancialPostingInput {
  financialAccountId: bigint;
  direction: 'IN' | 'OUT';
  amount: Prisma.Decimal;
  transactionType: string;
  paymentMethod?: string;
  sourceModule: string;
  referenceType: string;
  referenceId?: bigint;
  referenceNumber?: string;
  transactionDate: Date;
  description: string;
  note?: string;
  createdBy: bigint;
  counterChartAccountCode: string;
  transactionGroupId?: string;
  reversalOfId?: bigint;
  postingKey?: string;
  createJournal?: boolean;
}

export interface JournalPostingLine {
  chartAccountCode: string;
  debitAmount?: Prisma.Decimal;
  creditAmount?: Prisma.Decimal;
  description?: string;
}

export interface JournalPostingInput {
  postingKey: string;
  transactionDate: Date;
  description: string;
  sourceType: string;
  sourceId?: bigint;
  sourceNumber?: string;
  financialAccountTransactionId?: bigint;
  createdBy: bigint;
  lines: JournalPostingLine[];
}

function summaryDate(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return new Date(
    `${value('year')}-${value('month')}-${value('day')}T00:00:00.000Z`,
  );
}

export async function postJournalEntry(
  tx: Prisma.TransactionClient,
  input: JournalPostingInput,
) {
  if (input.lines.length < 2) {
    throw new HttpException(
      'Jurnal minimal memiliki dua baris.',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
  const normalized = input.lines.map((line) => ({
    ...line,
    debitAmount: new Prisma.Decimal(line.debitAmount ?? ZERO),
    creditAmount: new Prisma.Decimal(line.creditAmount ?? ZERO),
  }));
  for (const line of normalized) {
    const oneSideOnly =
      (line.debitAmount.greaterThan(ZERO) && line.creditAmount.equals(ZERO)) ||
      (line.creditAmount.greaterThan(ZERO) && line.debitAmount.equals(ZERO));
    if (!oneSideOnly) {
      throw new HttpException(
        'Setiap baris jurnal harus memiliki tepat satu nilai Debit atau Kredit.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  const debit = normalized.reduce(
    (sum, line) => sum.add(line.debitAmount),
    ZERO,
  );
  const credit = normalized.reduce(
    (sum, line) => sum.add(line.creditAmount),
    ZERO,
  );
  if (!debit.equals(credit)) {
    throw new HttpException(
      'Jurnal tidak seimbang. Seluruh transaksi dibatalkan.',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  const codes = [...new Set(normalized.map((line) => line.chartAccountCode))];
  const accounts = await tx.chartOfAccount.findMany({
    where: { accountCode: { in: codes }, isActive: true },
  });
  const accountByCode = new Map(
    accounts.map((account) => [account.accountCode, account]),
  );
  const missing = codes.filter((code) => !accountByCode.has(code));
  if (missing.length) {
    throw new HttpException(
      `Konfigurasi akun jurnal belum lengkap: ${missing.join(', ')}.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  const journal = await tx.journalEntry.create({
    data: {
      journalNumber: await generateJournalEntryNumber(
        tx,
        input.transactionDate,
      ),
      postingKey: input.postingKey,
      transactionDate: input.transactionDate,
      description: input.description,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceNumber: input.sourceNumber,
      financialAccountTransactionId: input.financialAccountTransactionId,
      createdBy: input.createdBy,
      lines: {
        create: normalized.map((line) => ({
          chartAccountId: accountByCode.get(line.chartAccountCode)!
            .chartAccountId,
          debitAmount: line.debitAmount,
          creditAmount: line.creditAmount,
          description: line.description ?? input.description,
        })),
      },
    },
  });

  const grouped = new Map<
    bigint,
    { debit: Prisma.Decimal; credit: Prisma.Decimal }
  >();
  for (const line of normalized) {
    const accountId = accountByCode.get(line.chartAccountCode)!.chartAccountId;
    const current = grouped.get(accountId) ?? { debit: ZERO, credit: ZERO };
    grouped.set(accountId, {
      debit: current.debit.add(line.debitAmount),
      credit: current.credit.add(line.creditAmount),
    });
  }
  const date = summaryDate(input.transactionDate);
  await Promise.all(
    [...grouped.entries()].map(([chartAccountId, value]) =>
      tx.journalAccountDailySummary.upsert({
        where: {
          chartAccountId_summaryDate: { chartAccountId, summaryDate: date },
        },
        create: {
          chartAccountId,
          summaryDate: date,
          totalDebit: value.debit,
          totalCredit: value.credit,
          entryCount: 1,
        },
        update: {
          totalDebit: { increment: value.debit },
          totalCredit: { increment: value.credit },
          entryCount: { increment: 1 },
        },
      }),
    ),
  );
  return journal;
}

export async function postFinancialMovement(
  tx: Prisma.TransactionClient,
  input: FinancialPostingInput,
) {
  if (!input.amount.isFinite() || input.amount.lessThanOrEqualTo(ZERO)) {
    throw new HttpException(
      'Nominal transaksi harus lebih besar dari nol.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
  await tx.$executeRaw`SELECT financial_account_id FROM financial_account WHERE financial_account_id = ${input.financialAccountId} FOR UPDATE`;
  const account = await tx.financialAccount.findUnique({
    where: { financialAccountId: input.financialAccountId },
    include: { chartAccount: true },
  });
  if (!account || !account.isActive) {
    throw new HttpException(
      'Akun kas/bank tidak tersedia atau tidak aktif.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
  const before = new Prisma.Decimal(account.currentBalance);
  const after =
    input.direction === 'IN'
      ? before.add(input.amount)
      : before.sub(input.amount);
  if (after.lessThan(ZERO)) {
    throw new HttpException(
      `Saldo ${account.accountName} tidak mencukupi.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  const defaultCashCode =
    account.accountType.toUpperCase() === 'CASH' ? '1101' : '1102';
  const [cashChart, counterChart] = await Promise.all([
    account.chartAccount
      ? Promise.resolve(account.chartAccount)
      : tx.chartOfAccount.findUnique({
          where: { accountCode: defaultCashCode },
        }),
    tx.chartOfAccount.findUnique({
      where: { accountCode: input.counterChartAccountCode },
    }),
  ]);
  if (!cashChart || !counterChart || !counterChart.isActive) {
    throw new HttpException(
      'Konfigurasi akun jurnal untuk transaksi ini belum lengkap.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  const financialTransaction = await tx.financialAccountTransaction.create({
    data: {
      transactionNumber: await generateFinancialAccountTransactionNumber(
        tx,
        input.transactionDate,
      ),
      financialAccountId: input.financialAccountId,
      transactionType: input.transactionType,
      paymentMethod: input.paymentMethod,
      direction: input.direction,
      amount: input.amount,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      transactionDate: input.transactionDate,
      note: input.note,
      description: input.description,
      sourceModule: input.sourceModule,
      referenceNumber: input.referenceNumber,
      balanceBefore: before,
      balanceAfter: after,
      transactionGroupId: input.transactionGroupId,
      counterChartAccountId: counterChart.chartAccountId,
      reversalOfId: input.reversalOfId,
      createdBy: input.createdBy,
    },
  });
  await tx.financialAccount.update({
    where: { financialAccountId: input.financialAccountId },
    data: {
      currentBalance: after,
      updatedAt: new Date(),
      updatedBy: input.createdBy,
    },
  });
  const date = summaryDate(input.transactionDate);
  await tx.financialDailySummary.upsert({
    where: {
      financialAccountId_summaryDate: {
        financialAccountId: input.financialAccountId,
        summaryDate: date,
      },
    },
    create: {
      financialAccountId: input.financialAccountId,
      summaryDate: date,
      totalIn: input.direction === 'IN' ? input.amount : ZERO,
      totalOut: input.direction === 'OUT' ? input.amount : ZERO,
      transactionCount: 1,
    },
    update: {
      totalIn:
        input.direction === 'IN' ? { increment: input.amount } : undefined,
      totalOut:
        input.direction === 'OUT' ? { increment: input.amount } : undefined,
      transactionCount: { increment: 1 },
    },
  });
  const journal =
    input.createJournal === false
      ? null
      : await postJournalEntry(tx, {
          postingKey:
            input.postingKey ??
            `FINANCIAL:${financialTransaction.financialAccountTransactionId}`,
          transactionDate: input.transactionDate,
          description: input.description,
          sourceType: input.referenceType,
          sourceId: input.referenceId,
          sourceNumber: input.referenceNumber,
          financialAccountTransactionId:
            financialTransaction.financialAccountTransactionId,
          createdBy: input.createdBy,
          lines:
            input.direction === 'IN'
              ? [
                  {
                    chartAccountCode: cashChart.accountCode,
                    debitAmount: input.amount,
                  },
                  {
                    chartAccountCode: counterChart.accountCode,
                    creditAmount: input.amount,
                  },
                ]
              : [
                  {
                    chartAccountCode: counterChart.accountCode,
                    debitAmount: input.amount,
                  },
                  {
                    chartAccountCode: cashChart.accountCode,
                    creditAmount: input.amount,
                  },
                ],
        });
  return {
    account,
    balanceBefore: before,
    balanceAfter: after,
    financialTransaction,
    journal,
  };
}
