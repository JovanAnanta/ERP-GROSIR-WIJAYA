import { HttpException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { FinanceService } from './finance.service.js';

function serviceWithAccount(input: {
  balance: number;
  isDefault: boolean;
  isActive?: boolean;
}) {
  const update = jest.fn<any>();
  const account = {
    financialAccountId: 10n,
    accountName: 'Bank BCA',
    accountType: 'BANK',
    currentBalance: new Prisma.Decimal(input.balance),
    openingBalance: new Prisma.Decimal(0),
    isDefault: input.isDefault,
    isActive: input.isActive ?? true,
  };
  const tx = {
    $executeRaw: jest.fn<any>().mockResolvedValue(1),
    financialAccount: {
      findUnique: jest.fn<any>().mockResolvedValue(account),
      update,
    },
  };
  const prisma = {
    $transaction: jest
      .fn<any>()
      .mockImplementation(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
  } as unknown as PrismaService;
  return { service: new FinanceService(prisma), update };
}

describe('FinanceService financial-account safety', () => {
  it('mencatat saldo awal sebagai mutasi pembuka dan jurnal seimbang', async () => {
    const cashChart = {
      chartAccountId: 1n,
      accountCode: '1101',
      isActive: true,
    };
    const openingChart = {
      chartAccountId: 2n,
      accountCode: '3901',
      isActive: true,
    };
    const transactionCreate = jest
      .fn<
        (input: { data: Record<string, unknown> }) => Record<string, unknown>
      >()
      .mockImplementation(({ data }) => ({
        ...data,
        financialAccountTransactionId: 20n,
      }));
    const journalCreate = jest.fn<any>().mockResolvedValue({
      journalEntryId: 30n,
    });
    const tx = {
      $executeRaw: jest.fn<any>().mockResolvedValue(1),
      financialAccount: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        create: jest
          .fn<
            (input: {
              data: Record<string, unknown>;
            }) => Record<string, unknown>
          >()
          .mockImplementation(({ data }) => ({
            ...data,
            financialAccountId: 10n,
          })),
      },
      chartOfAccount: {
        findUnique: jest
          .fn<any>()
          .mockResolvedValueOnce(cashChart)
          .mockResolvedValueOnce(openingChart),
        findMany: jest.fn<any>().mockResolvedValue([cashChart, openingChart]),
      },
      financialAccountTransaction: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        create: transactionCreate,
      },
      journalEntry: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        create: journalCreate,
      },
      journalAccountDailySummary: {
        upsert: jest.fn<any>().mockResolvedValue(undefined),
      },
      activityLog: { create: jest.fn<any>().mockResolvedValue(undefined) },
      auditLog: { create: jest.fn<any>().mockResolvedValue(undefined) },
    };
    const prisma = {
      $transaction: jest
        .fn<any>()
        .mockImplementation(async (callback: (client: typeof tx) => unknown) =>
          callback(tx),
        ),
    } as unknown as PrismaService;

    const account = await new FinanceService(prisma).createAccount(1n, {
      accountName: 'Kas Toko',
      accountType: 'CASH',
      openingBalance: 500000,
      openingBalanceDate: '2026-09-09',
    });

    expect(account.currentBalance.toString()).toBe('500000');
    expect(transactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transactionType: 'OPENING_BALANCE',
          balanceBefore: expect.anything(),
          balanceAfter: expect.anything(),
        }),
      }),
    );
    expect(journalCreate).toHaveBeenCalledTimes(1);
  });

  it('menolak menonaktifkan akun yang masih mempunyai saldo', async () => {
    const { service, update } = serviceWithAccount({
      balance: 1000,
      isDefault: false,
    });

    await expect(
      service.changeAccountStatus(1n, 10n, { isActive: false }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(update).not.toHaveBeenCalled();
  });

  it('menolak menonaktifkan akun default walaupun saldonya nol', async () => {
    const { service, update } = serviceWithAccount({
      balance: 0,
      isDefault: true,
    });

    await expect(
      service.changeAccountStatus(1n, 10n, { isActive: false }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(update).not.toHaveBeenCalled();
  });
});
