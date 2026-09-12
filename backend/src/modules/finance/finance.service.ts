import { randomUUID } from 'node:crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  postFinancialMovement,
  postJournalEntry,
} from '../../common/financial/financial-posting.js';
import { generateFinancialAccountTransactionNumber } from '../../common/financial/transaction-number.utils.js';
import {
  ACTIVITY_TYPES,
  AUDIT_OPERATIONS,
  changedFields,
  createAuditTransactionId,
  writeActivityLog,
  writeAuditLog,
} from '../../common/logging/business-logger.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  ChangeFinancialAccountStatusDto,
  CreateFinancialAccountDto,
  CreateManualFinanceDto,
  CreateTransferDto,
  FinanceListQueryDto,
  FinanceReportQueryDto,
  JournalListQueryDto,
  ProfitLossQueryDto,
  UpdateFinancialAccountDto,
} from './dto/finance.dto.js';

const ZERO = new Prisma.Decimal(0);
const COUNTER_ACCOUNTS: Record<string, string> = {
  OWNER_CAPITAL: '3101',
  OTHER_INCOME: '4201',
  LOAN_RECEIPT: '2102',
  SUPPLIER_REFUND: '1391',
  CASH_DIFFERENCE: '4202',
  SALARY: '6101',
  ELECTRICITY: '6102',
  WATER: '6103',
  INTERNET: '6104',
  TRANSPORT: '6105',
  TAX: '6106',
  OTHER_EXPENSE: '6199',
  ASSET_PURCHASE: '1401',
};

function dateRange(from?: string, to?: string) {
  const start = from ? new Date(`${from}T00:00:00.000+07:00`) : undefined;
  const end = to ? new Date(`${to}T23:59:59.999+07:00`) : undefined;
  if (start && end && start > end) {
    throw new HttpException(
      'Tanggal awal tidak boleh melewati tanggal akhir.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
  return { start, end };
}

function assertNotFuture(date: Date) {
  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);
  if (date >= tomorrow) {
    throw new HttpException(
      'Tanggal transaksi tidak boleh di masa depan.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

function cleanOptional(value?: string) {
  const cleaned = value?.trim();
  return cleaned || null;
}

function validateAccountIdentity(input: {
  accountName: string;
  accountType: 'CASH' | 'BANK';
  bankName?: string;
}) {
  const accountName = input.accountName.trim();
  if (!accountName) {
    throw new HttpException(
      'Nama akun wajib diisi.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
  const bankName = cleanOptional(input.bankName);
  if (input.accountType === 'BANK' && !bankName) {
    throw new HttpException(
      'Nama bank wajib diisi untuk rekening bank.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
  return { accountName, bankName };
}

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async accounts() {
    return this.prisma.financialAccount.findMany({
      where: { isActive: true },
      orderBy: [{ accountType: 'asc' }, { accountName: 'asc' }],
      select: {
        financialAccountId: true,
        accountName: true,
        accountType: true,
        accountNumber: true,
        bankName: true,
        currentBalance: true,
        isDefault: true,
      },
    });
  }

  async accountSettings() {
    return this.prisma.financialAccount.findMany({
      orderBy: [
        { isActive: 'desc' },
        { accountType: 'asc' },
        { isDefault: 'desc' },
        { accountName: 'asc' },
      ],
      select: {
        financialAccountId: true,
        accountName: true,
        accountType: true,
        accountNumber: true,
        bankName: true,
        openingBalance: true,
        currentBalance: true,
        isActive: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { transactions: true } },
      },
    });
  }

  async createAccount(actorId: bigint, dto: CreateFinancialAccountDto) {
    const identity = validateAccountIdentity(dto);
    const openingBalance = new Prisma.Decimal(dto.openingBalance);
    const openingDate = dto.openingBalanceDate
      ? new Date(dto.openingBalanceDate)
      : new Date();
    assertNotFuture(openingDate);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`FINANCIAL_ACCOUNT:${dto.accountType}`}))`;
      const duplicate = await tx.financialAccount.findFirst({
        where: {
          accountName: { equals: identity.accountName, mode: 'insensitive' },
        },
        select: { financialAccountId: true },
      });
      if (duplicate) {
        throw new HttpException(
          'Nama akun kas/bank sudah digunakan.',
          HttpStatus.CONFLICT,
        );
      }
      const chartAccount = await tx.chartOfAccount.findUnique({
        where: { accountCode: dto.accountType === 'CASH' ? '1101' : '1102' },
      });
      if (!chartAccount?.isActive) {
        throw new HttpException(
          'Konfigurasi akun jurnal kas/bank belum tersedia.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      const currentDefault = await tx.financialAccount.findFirst({
        where: {
          accountType: dto.accountType,
          isActive: true,
          isDefault: true,
        },
        select: { financialAccountId: true },
      });
      const makeDefault = Boolean(dto.isDefault) || !currentDefault;
      if (makeDefault) {
        await tx.financialAccount.updateMany({
          where: { accountType: dto.accountType, isDefault: true },
          data: { isDefault: false, updatedAt: new Date(), updatedBy: actorId },
        });
      }
      const account = await tx.financialAccount.create({
        data: {
          accountName: identity.accountName,
          accountType: dto.accountType,
          bankName: dto.accountType === 'BANK' ? identity.bankName : null,
          accountNumber:
            dto.accountType === 'BANK'
              ? cleanOptional(dto.accountNumber)
              : null,
          openingBalance,
          currentBalance: openingBalance,
          isActive: true,
          isDefault: makeDefault,
          chartAccountId: chartAccount.chartAccountId,
          createdBy: actorId,
        },
      });

      let openingTransaction = null;
      if (openingBalance.greaterThan(ZERO)) {
        const openingEquity = await tx.chartOfAccount.findUnique({
          where: { accountCode: '3901' },
        });
        if (!openingEquity?.isActive) {
          throw new HttpException(
            'Konfigurasi jurnal saldo awal belum tersedia.',
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
        openingTransaction = await tx.financialAccountTransaction.create({
          data: {
            transactionNumber: await generateFinancialAccountTransactionNumber(
              tx,
              openingDate,
            ),
            financialAccountId: account.financialAccountId,
            transactionType: 'OPENING_BALANCE',
            direction: 'IN',
            amount: openingBalance,
            referenceType: 'FINANCIAL_ACCOUNT',
            referenceId: account.financialAccountId,
            referenceNumber: account.accountName,
            transactionDate: openingDate,
            description: `Saldo awal ${account.accountName}`,
            sourceModule: 'FINANCE',
            balanceBefore: ZERO,
            balanceAfter: openingBalance,
            counterChartAccountId: openingEquity.chartAccountId,
            createdBy: actorId,
          },
        });
        await postJournalEntry(tx, {
          postingKey: `OPENING_BALANCE:FINANCIAL_ACCOUNT:${account.financialAccountId}`,
          transactionDate: openingDate,
          description: `Saldo awal ${account.accountName}`,
          sourceType: 'FINANCIAL_ACCOUNT',
          sourceId: account.financialAccountId,
          sourceNumber: account.accountName,
          financialAccountTransactionId:
            openingTransaction.financialAccountTransactionId,
          createdBy: actorId,
          lines: [
            {
              chartAccountCode: chartAccount.accountCode,
              debitAmount: openingBalance,
            },
            { chartAccountCode: '3901', creditAmount: openingBalance },
          ],
        });
      }

      const auditId = createAuditTransactionId();
      await writeActivityLog(tx, {
        userId: actorId,
        activityType: ACTIVITY_TYPES.CREATE,
        module: 'FINANCIAL',
        description: `Akun ${account.accountName} dibuat.`,
        entityType: 'FinancialAccount',
        entityId: account.financialAccountId,
        entityNumber: account.accountName,
      });
      await writeAuditLog(tx, {
        userId: actorId,
        transactionId: auditId,
        module: 'FINANCIAL',
        operation: AUDIT_OPERATIONS.CREATE,
        entityType: 'FinancialAccount',
        entityId: account.financialAccountId,
        entityNumber: account.accountName,
        source: 'FinanceService.createAccount',
        changedFields: changedFields(null, account),
      });
      if (openingTransaction) {
        await writeAuditLog(tx, {
          userId: actorId,
          transactionId: auditId,
          module: 'FINANCIAL',
          operation: AUDIT_OPERATIONS.CREATE,
          entityType: 'FinancialAccountTransaction',
          entityId: openingTransaction.financialAccountTransactionId,
          entityNumber: openingTransaction.transactionNumber,
          source: 'FinanceService.createAccount',
          changedFields: changedFields(null, openingTransaction),
        });
      }
      return account;
    });
  }

  async updateAccount(
    actorId: bigint,
    accountId: bigint,
    dto: UpdateFinancialAccountDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT financial_account_id FROM financial_account WHERE financial_account_id = ${accountId} FOR UPDATE`;
      const existing = await tx.financialAccount.findUnique({
        where: { financialAccountId: accountId },
      });
      if (!existing) {
        throw new HttpException('Akun tidak ditemukan.', HttpStatus.NOT_FOUND);
      }
      const identity = validateAccountIdentity({
        accountName: dto.accountName,
        accountType: existing.accountType as 'CASH' | 'BANK',
        bankName: dto.bankName,
      });
      const duplicate = await tx.financialAccount.findFirst({
        where: {
          financialAccountId: { not: accountId },
          accountName: { equals: identity.accountName, mode: 'insensitive' },
        },
        select: { financialAccountId: true },
      });
      if (duplicate) {
        throw new HttpException(
          'Nama akun kas/bank sudah digunakan.',
          HttpStatus.CONFLICT,
        );
      }
      const updated = await tx.financialAccount.update({
        where: { financialAccountId: accountId },
        data: {
          accountName: identity.accountName,
          bankName: existing.accountType === 'BANK' ? identity.bankName : null,
          accountNumber:
            existing.accountType === 'BANK'
              ? cleanOptional(dto.accountNumber)
              : null,
          updatedAt: new Date(),
          updatedBy: actorId,
        },
      });
      const auditId = createAuditTransactionId();
      await writeActivityLog(tx, {
        userId: actorId,
        activityType: ACTIVITY_TYPES.UPDATE,
        module: 'FINANCIAL',
        description: `Informasi akun ${updated.accountName} diperbarui.`,
        entityType: 'FinancialAccount',
        entityId: accountId,
        entityNumber: updated.accountName,
      });
      await writeAuditLog(tx, {
        userId: actorId,
        transactionId: auditId,
        module: 'FINANCIAL',
        operation: AUDIT_OPERATIONS.UPDATE,
        entityType: 'FinancialAccount',
        entityId: accountId,
        entityNumber: updated.accountName,
        source: 'FinanceService.updateAccount',
        changedFields: changedFields(existing, updated, [
          'accountName',
          'bankName',
          'accountNumber',
          'updatedBy',
        ]),
      });
      return updated;
    });
  }

  async setDefaultAccount(actorId: bigint, accountId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.financialAccount.findUnique({
        where: { financialAccountId: accountId },
      });
      if (!account?.isActive) {
        throw new HttpException(
          'Hanya akun aktif yang dapat dijadikan default.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`FINANCIAL_ACCOUNT:${account.accountType}`}))`;
      await tx.$executeRaw`SELECT financial_account_id FROM financial_account WHERE financial_account_id = ${accountId} FOR UPDATE`;
      const lockedAccount = await tx.financialAccount.findUnique({
        where: { financialAccountId: accountId },
      });
      if (!lockedAccount?.isActive) {
        throw new HttpException(
          'Hanya akun aktif yang dapat dijadikan default.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      const previous = await tx.financialAccount.findFirst({
        where: {
          accountType: lockedAccount.accountType,
          isActive: true,
          isDefault: true,
        },
      });
      await tx.financialAccount.updateMany({
        where: { accountType: lockedAccount.accountType, isDefault: true },
        data: { isDefault: false, updatedAt: new Date(), updatedBy: actorId },
      });
      const updated = await tx.financialAccount.update({
        where: { financialAccountId: accountId },
        data: { isDefault: true, updatedAt: new Date(), updatedBy: actorId },
      });
      const auditId = createAuditTransactionId();
      if (previous && previous.financialAccountId !== accountId) {
        await writeAuditLog(tx, {
          userId: actorId,
          transactionId: auditId,
          module: 'FINANCIAL',
          operation: AUDIT_OPERATIONS.UPDATE,
          entityType: 'FinancialAccount',
          entityId: previous.financialAccountId,
          entityNumber: previous.accountName,
          source: 'FinanceService.setDefaultAccount',
          changedFields: changedFields(
            previous,
            { ...previous, isDefault: false },
            ['isDefault'],
          ),
        });
      }
      await writeActivityLog(tx, {
        userId: actorId,
        activityType: ACTIVITY_TYPES.UPDATE,
        module: 'FINANCIAL',
        description: `${updated.accountName} dijadikan akun ${updated.accountType === 'CASH' ? 'tunai' : 'transfer'} default.`,
        entityType: 'FinancialAccount',
        entityId: accountId,
        entityNumber: updated.accountName,
      });
      await writeAuditLog(tx, {
        userId: actorId,
        transactionId: auditId,
        module: 'FINANCIAL',
        operation: AUDIT_OPERATIONS.UPDATE,
        entityType: 'FinancialAccount',
        entityId: accountId,
        entityNumber: updated.accountName,
        source: 'FinanceService.setDefaultAccount',
        changedFields: changedFields(lockedAccount, updated, ['isDefault']),
      });
      return updated;
    });
  }

  async changeAccountStatus(
    actorId: bigint,
    accountId: bigint,
    dto: ChangeFinancialAccountStatusDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT financial_account_id FROM financial_account WHERE financial_account_id = ${accountId} FOR UPDATE`;
      const existing = await tx.financialAccount.findUnique({
        where: { financialAccountId: accountId },
      });
      if (!existing) {
        throw new HttpException('Akun tidak ditemukan.', HttpStatus.NOT_FOUND);
      }
      if (existing.isActive === dto.isActive) return existing;
      if (!dto.isActive && !existing.currentBalance.equals(ZERO)) {
        throw new HttpException(
          'Akun hanya dapat dinonaktifkan setelah saldonya menjadi Rp0.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      if (!dto.isActive && existing.isDefault) {
        throw new HttpException(
          'Pindahkan akun default sebelum menonaktifkan akun ini.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      const updated = await tx.financialAccount.update({
        where: { financialAccountId: accountId },
        data: {
          isActive: dto.isActive,
          updatedAt: new Date(),
          updatedBy: actorId,
        },
      });
      const auditId = createAuditTransactionId();
      await writeActivityLog(tx, {
        userId: actorId,
        activityType: ACTIVITY_TYPES.UPDATE,
        module: 'FINANCIAL',
        description: `${updated.accountName} ${dto.isActive ? 'diaktifkan' : 'dinonaktifkan'}.`,
        entityType: 'FinancialAccount',
        entityId: accountId,
        entityNumber: updated.accountName,
      });
      await writeAuditLog(tx, {
        userId: actorId,
        transactionId: auditId,
        module: 'FINANCIAL',
        operation: AUDIT_OPERATIONS.UPDATE,
        entityType: 'FinancialAccount',
        entityId: accountId,
        entityNumber: updated.accountName,
        source: 'FinanceService.changeAccountStatus',
        changedFields: changedFields(existing, updated, ['isActive']),
      });
      return updated;
    });
  }

  async chartAccounts() {
    return this.prisma.chartOfAccount.findMany({
      where: { isActive: true },
      orderBy: { accountCode: 'asc' },
      select: {
        chartAccountId: true,
        accountCode: true,
        accountName: true,
        accountType: true,
        normalBalance: true,
      },
    });
  }

  categories() {
    return {
      IN: [
        ['OWNER_CAPITAL', 'Setoran modal'],
        ['OTHER_INCOME', 'Pendapatan lain-lain'],
        ['LOAN_RECEIPT', 'Penerimaan pinjaman'],
        ['SUPPLIER_REFUND', 'Pengembalian dari supplier'],
        ['CASH_DIFFERENCE', 'Koreksi selisih kas'],
      ],
      OUT: [
        ['SALARY', 'Gaji'],
        ['ELECTRICITY', 'Listrik'],
        ['WATER', 'Air'],
        ['INTERNET', 'Internet'],
        ['TRANSPORT', 'Transportasi'],
        ['TAX', 'Pajak'],
        ['ASSET_PURCHASE', 'Pembelian aset/perlengkapan'],
        ['OTHER_EXPENSE', 'Pengeluaran lainnya'],
      ],
    };
  }

  async list(query: FinanceListQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 50);
    const { start, end } = dateRange(query.dateFrom, query.dateTo);
    const where: Prisma.FinancialAccountTransactionWhereInput = {
      ...(query.accountId
        ? { financialAccountId: BigInt(query.accountId) }
        : {}),
      ...(query.direction ? { direction: query.direction } : {}),
      ...(query.sourceModule ? { sourceModule: query.sourceModule } : {}),
      ...(start || end
        ? {
            transactionDate: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lte: end } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                transactionNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                referenceNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              { description: { contains: query.search, mode: 'insensitive' } },
              { note: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total, totals] = await Promise.all([
      this.prisma.financialAccountTransaction.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [
          { transactionDate: 'desc' },
          { financialAccountTransactionId: 'desc' },
        ],
        include: {
          financialAccount: {
            select: { accountName: true, accountType: true },
          },
          createdByUser: { select: { fullName: true } },
        },
      }),
      this.prisma.financialAccountTransaction.count({ where }),
      this.prisma.financialAccountTransaction.groupBy({
        by: ['direction'],
        where,
        _sum: { amount: true },
        _count: true,
      }),
    ]);
    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      totals,
    };
  }

  async summary(query: FinanceListQueryDto) {
    const { start, end } = dateRange(query.dateFrom, query.dateTo);
    const accountWhere = query.accountId
      ? { financialAccountId: BigInt(query.accountId) }
      : {};
    const summaryWhere: Prisma.FinancialDailySummaryWhereInput = {
      ...accountWhere,
      ...(start || end
        ? {
            summaryDate: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lte: end } : {}),
            },
          }
        : {}),
    };
    const [accounts, grouped, afterPeriod, openingAfterPeriod] =
      await Promise.all([
        this.prisma.financialAccount.findMany({
          where: query.accountId ? accountWhere : { isActive: true },
          orderBy: { accountName: 'asc' },
        }),
        this.prisma.financialDailySummary.aggregate({
          where: summaryWhere,
          _sum: { totalIn: true, totalOut: true, transactionCount: true },
        }),
        end
          ? this.prisma.financialDailySummary.aggregate({
              where: {
                ...accountWhere,
                summaryDate: { gt: end },
              },
              _sum: { totalIn: true, totalOut: true },
            })
          : Promise.resolve({ _sum: { totalIn: null, totalOut: null } }),
        end
          ? this.prisma.financialAccountTransaction.aggregate({
              where: {
                ...accountWhere,
                transactionType: 'OPENING_BALANCE',
                transactionDate: { gt: end },
                status: 'COMPLETED',
              },
              _sum: { amount: true },
            })
          : Promise.resolve({ _sum: { amount: null } }),
      ]);
    const current = accounts.reduce(
      (value, account) => value.add(account.currentBalance),
      ZERO,
    );
    const afterNet = new Prisma.Decimal(afterPeriod._sum.totalIn ?? 0).sub(
      afterPeriod._sum.totalOut ?? 0,
    );
    const closing = current
      .sub(afterNet)
      .sub(openingAfterPeriod._sum.amount ?? ZERO);
    const totalIn = new Prisma.Decimal(grouped._sum.totalIn ?? 0);
    const totalOut = new Prisma.Decimal(grouped._sum.totalOut ?? 0);
    return {
      accounts,
      currentBalance: current,
      openingBalance: closing.sub(totalIn).add(totalOut),
      totalIn,
      totalOut,
      netMovement: totalIn.sub(totalOut),
      closingBalance: closing,
      transactionCount: grouped._sum.transactionCount ?? 0,
    };
  }

  async journals(query: JournalListQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 50);
    const { start, end } = dateRange(query.dateFrom, query.dateTo);
    const where: Prisma.JournalEntryWhereInput = {
      status: 'POSTED',
      ...(start || end
        ? {
            transactionDate: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lte: end } : {}),
            },
          }
        : {}),
      ...(query.chartAccountId
        ? {
            lines: {
              some: { chartAccountId: BigInt(query.chartAccountId) },
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                journalNumber: { contains: query.search, mode: 'insensitive' },
              },
              { sourceNumber: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              {
                lines: {
                  some: {
                    chartAccount: {
                      OR: [
                        {
                          accountCode: {
                            contains: query.search,
                            mode: 'insensitive',
                          },
                        },
                        {
                          accountName: {
                            contains: query.search,
                            mode: 'insensitive',
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const totalsPromise = !query.search
      ? this.prisma.journalAccountDailySummary.aggregate({
          where: {
            ...(query.chartAccountId
              ? { chartAccountId: BigInt(query.chartAccountId) }
              : {}),
            ...(start || end
              ? {
                  summaryDate: {
                    ...(start ? { gte: start } : {}),
                    ...(end ? { lte: end } : {}),
                  },
                }
              : {}),
          },
          _sum: { totalDebit: true, totalCredit: true },
        })
      : this.prisma.journalEntryLine.aggregate({
          where: {
            journalEntry: where,
            ...(query.chartAccountId
              ? { chartAccountId: BigInt(query.chartAccountId) }
              : {}),
          },
          _sum: { debitAmount: true, creditAmount: true },
        });
    const [items, total, totals] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ transactionDate: 'desc' }, { journalEntryId: 'desc' }],
        include: {
          lines: {
            ...(query.chartAccountId
              ? { where: { chartAccountId: BigInt(query.chartAccountId) } }
              : {}),
            include: { chartAccount: true },
            orderBy: { journalEntryLineId: 'asc' },
          },
        },
      }),
      this.prisma.journalEntry.count({ where }),
      totalsPromise,
    ]);
    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      totals: {
        debit:
          ('totalDebit' in totals._sum
            ? totals._sum.totalDebit
            : totals._sum.debitAmount) ?? ZERO,
        credit:
          ('totalCredit' in totals._sum
            ? totals._sum.totalCredit
            : totals._sum.creditAmount) ?? ZERO,
      },
    };
  }

  async profitLoss(query: ProfitLossQueryDto) {
    const { start, end } = dateRange(query.dateFrom, query.dateTo);
    const accountWhere: Prisma.ChartOfAccountWhereInput = {
      isActive: true,
      accountType: { in: ['REVENUE', 'COGS', 'EXPENSE'] },
    };
    const [accounts, groupedLines] = await Promise.all([
      this.prisma.chartOfAccount.findMany({
        where: accountWhere,
        orderBy: { accountCode: 'asc' },
      }),
      this.prisma.journalAccountDailySummary.groupBy({
        by: ['chartAccountId'],
        where: {
          chartAccount: accountWhere,
          summaryDate: { gte: start!, lte: end! },
        },
        _sum: { totalDebit: true, totalCredit: true },
      }),
    ]);
    const rows = accounts.map((account) => {
      const aggregate = groupedLines.find(
        (line) => line.chartAccountId === account.chartAccountId,
      );
      const debit = new Prisma.Decimal(aggregate?._sum.totalDebit ?? 0);
      const credit = new Prisma.Decimal(aggregate?._sum.totalCredit ?? 0);
      const amount =
        account.accountType === 'REVENUE'
          ? account.normalBalance === 'CREDIT'
            ? credit.sub(debit)
            : debit.sub(credit).negated()
          : debit.sub(credit);
      return {
        chartAccountId: account.chartAccountId,
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        amount,
      };
    });
    const sumType = (type: string) =>
      rows
        .filter((row) => row.accountType === type)
        .reduce((value, row) => value.add(row.amount), ZERO);
    const revenue = sumType('REVENUE');
    const costOfGoodsSold = sumType('COGS');
    const operatingExpenses = sumType('EXPENSE');
    const [
      completedSales,
      completedPurchases,
      salesAccruals,
      purchaseAccruals,
    ] = await Promise.all([
      this.prisma.salesInvoice.count({
        where: {
          status: 'COMPLETED',
          invoiceDate: { gte: start!, lte: end! },
        },
      }),
      this.prisma.purchaseInvoice.count({
        where: {
          status: 'COMPLETED',
          invoiceDate: { gte: start!, lte: end! },
        },
      }),
      this.prisma.journalEntry.count({
        where: {
          postingKey: { startsWith: 'ACCRUAL:SALES_INVOICE:' },
          transactionDate: { gte: start!, lte: end! },
        },
      }),
      this.prisma.journalEntry.count({
        where: {
          postingKey: { startsWith: 'ACCRUAL:PURCHASE_INVOICE:' },
          transactionDate: { gte: start!, lte: end! },
        },
      }),
    ]);
    const isComplete =
      completedSales <= salesAccruals && completedPurchases <= purchaseAccruals;
    return {
      rows,
      totals: {
        revenue,
        costOfGoodsSold,
        grossProfit: revenue.sub(costOfGoodsSold),
        operatingExpenses,
        netProfit: revenue.sub(costOfGoodsSold).sub(operatingExpenses),
      },
      coverage: {
        isComplete,
        completedSales,
        salesAccruals,
        completedPurchases,
        purchaseAccruals,
        message: isComplete
          ? 'Seluruh dokumen selesai pada cakupan pemeriksaan telah memiliki jurnal accrual.'
          : 'Laporan belum final karena sebagian transaksi Sales/Purchase lama belum memiliki jurnal pendapatan, HPP, atau persediaan.',
      },
    };
  }

  async createManual(actorId: bigint, dto: CreateManualFinanceDto) {
    const date = new Date(dto.transactionDate);
    assertNotFuture(date);
    const counterCode = COUNTER_ACCOUNTS[dto.source];
    if (!counterCode)
      throw new HttpException(
        'Kategori transaksi tidak valid.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    return this.prisma.$transaction(async (tx) => {
      const posted = await postFinancialMovement(tx, {
        financialAccountId: BigInt(dto.financialAccountId),
        direction: dto.direction,
        amount: new Prisma.Decimal(dto.amount),
        transactionType:
          dto.direction === 'IN' ? 'MANUAL_CASH_IN' : 'MANUAL_CASH_OUT',
        sourceModule: 'FINANCE',
        referenceType: 'MANUAL_FINANCE',
        referenceNumber: dto.referenceNumber,
        transactionDate: date,
        description: dto.description,
        note: dto.note,
        createdBy: actorId,
        counterChartAccountCode: counterCode,
      });
      const auditId = createAuditTransactionId();
      await writeActivityLog(tx, {
        userId: actorId,
        activityType: ACTIVITY_TYPES.CREATE,
        module: 'FINANCIAL',
        description: `${dto.direction === 'IN' ? 'Kas masuk' : 'Kas keluar'} ${posted.financialTransaction.transactionNumber} dibuat.`,
        entityType: 'FinancialAccountTransaction',
        entityId: posted.financialTransaction.financialAccountTransactionId,
        entityNumber: posted.financialTransaction.transactionNumber,
      });
      await writeAuditLog(tx, {
        userId: actorId,
        transactionId: auditId,
        module: 'FINANCIAL',
        operation: AUDIT_OPERATIONS.CREATE,
        entityType: 'FinancialAccountTransaction',
        entityId: posted.financialTransaction.financialAccountTransactionId,
        entityNumber: posted.financialTransaction.transactionNumber,
        source: 'FinanceService.createManual',
        changedFields: changedFields(null, posted.financialTransaction),
      });
      await writeAuditLog(tx, {
        userId: actorId,
        transactionId: auditId,
        module: 'FINANCIAL',
        operation: AUDIT_OPERATIONS.UPDATE,
        entityType: 'FinancialAccount',
        entityId: posted.account.financialAccountId,
        entityNumber: posted.account.accountName,
        source: 'FinanceService.createManual',
        changedFields: changedFields(
          posted.account,
          { ...posted.account, currentBalance: posted.balanceAfter },
          ['currentBalance'],
        ),
      });
      return posted.financialTransaction;
    });
  }

  async transfer(actorId: bigint, dto: CreateTransferDto) {
    if (dto.sourceAccountId === dto.destinationAccountId)
      throw new HttpException(
        'Akun asal dan tujuan harus berbeda.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const date = new Date(dto.transactionDate);
    assertNotFuture(date);
    const groupId = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const ordered = [
        BigInt(dto.sourceAccountId),
        BigInt(dto.destinationAccountId),
      ].sort((a, b) => (a < b ? -1 : 1));
      for (const id of ordered)
        await tx.$executeRaw`SELECT financial_account_id FROM financial_account WHERE financial_account_id = ${id} FOR UPDATE`;
      const [source, destination] = await Promise.all([
        tx.financialAccount.findUnique({
          where: { financialAccountId: BigInt(dto.sourceAccountId) },
          include: { chartAccount: true },
        }),
        tx.financialAccount.findUnique({
          where: { financialAccountId: BigInt(dto.destinationAccountId) },
          include: { chartAccount: true },
        }),
      ]);
      if (!source?.chartAccount || !destination?.chartAccount)
        throw new HttpException(
          'Konfigurasi akun transfer belum lengkap.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      const amount = new Prisma.Decimal(dto.amount);
      const out = await postFinancialMovement(tx, {
        financialAccountId: source.financialAccountId,
        direction: 'OUT',
        amount,
        transactionType: 'ACCOUNT_TRANSFER_OUT',
        paymentMethod: 'TRANSFER',
        sourceModule: 'FINANCE',
        referenceType: 'ACCOUNT_TRANSFER',
        referenceNumber: dto.referenceNumber,
        transactionDate: date,
        description: `Transfer ke ${destination.accountName}`,
        note: dto.note,
        createdBy: actorId,
        counterChartAccountCode: destination.chartAccount.accountCode,
        transactionGroupId: groupId,
        createJournal: false,
      });
      const incoming = await postFinancialMovement(tx, {
        financialAccountId: destination.financialAccountId,
        direction: 'IN',
        amount,
        transactionType: 'ACCOUNT_TRANSFER_IN',
        paymentMethod: 'TRANSFER',
        sourceModule: 'FINANCE',
        referenceType: 'ACCOUNT_TRANSFER',
        referenceNumber: dto.referenceNumber,
        transactionDate: date,
        description: `Transfer dari ${source.accountName}`,
        note: dto.note,
        createdBy: actorId,
        counterChartAccountCode: source.chartAccount.accountCode,
        transactionGroupId: groupId,
        createJournal: false,
      });
      await postJournalEntry(tx, {
        postingKey: `TRANSFER:${groupId}`,
        transactionDate: date,
        description: `${source.accountName} ke ${destination.accountName}`,
        sourceType: 'ACCOUNT_TRANSFER',
        sourceNumber: dto.referenceNumber,
        createdBy: actorId,
        lines: [
          {
            chartAccountCode: destination.chartAccount.accountCode,
            debitAmount: amount,
          },
          {
            chartAccountCode: source.chartAccount.accountCode,
            creditAmount: amount,
          },
        ],
      });
      await writeActivityLog(tx, {
        userId: actorId,
        activityType: ACTIVITY_TYPES.CREATE,
        module: 'FINANCIAL',
        description: `Transfer ${out.financialTransaction.transactionNumber} ke ${incoming.financialTransaction.transactionNumber} berhasil.`,
        entityType: 'FinancialAccountTransaction',
        entityId: out.financialTransaction.financialAccountTransactionId,
        entityNumber: out.financialTransaction.transactionNumber,
        metadata: { groupId },
      });
      const auditId = createAuditTransactionId();
      for (const posted of [out, incoming]) {
        await writeAuditLog(tx, {
          userId: actorId,
          transactionId: auditId,
          module: 'FINANCIAL',
          operation: AUDIT_OPERATIONS.CREATE,
          entityType: 'FinancialAccountTransaction',
          entityId: posted.financialTransaction.financialAccountTransactionId,
          entityNumber: posted.financialTransaction.transactionNumber,
          source: 'FinanceService.transfer',
          changedFields: changedFields(null, posted.financialTransaction),
        });
        await writeAuditLog(tx, {
          userId: actorId,
          transactionId: auditId,
          module: 'FINANCIAL',
          operation: AUDIT_OPERATIONS.UPDATE,
          entityType: 'FinancialAccount',
          entityId: posted.account.financialAccountId,
          entityNumber: posted.account.accountName,
          source: 'FinanceService.transfer',
          changedFields: changedFields(
            posted.account,
            { ...posted.account, currentBalance: posted.balanceAfter },
            ['currentBalance'],
          ),
        });
      }
      return {
        groupId,
        out: out.financialTransaction,
        incoming: incoming.financialTransaction,
      };
    });
  }

  async report(query: FinanceReportQueryDto) {
    const { start, end } = dateRange(query.dateFrom, query.dateTo);
    const trunc =
      query.groupBy === 'MONTH'
        ? 'month'
        : query.groupBy === 'WEEK'
          ? 'week'
          : 'day';
    const accountId = query.accountId ? BigInt(query.accountId) : null;
    return this.prisma.$queryRaw<
      Array<{
        period: Date;
        totalIn: Prisma.Decimal;
        totalOut: Prisma.Decimal;
        transactionCount: bigint;
      }>
    >`
      SELECT date_trunc(${trunc}, summary_date) AS period,
        COALESCE(SUM(total_in), 0) AS "totalIn",
        COALESCE(SUM(total_out), 0) AS "totalOut",
        COALESCE(SUM(transaction_count), 0)::bigint AS "transactionCount"
      FROM financial_daily_summary
      WHERE summary_date >= ${start!}::date AND summary_date <= ${end!}::date
        AND (${accountId}::bigint IS NULL OR financial_account_id = ${accountId})
      GROUP BY 1 ORDER BY 1 ASC`;
  }

  async health() {
    const [
      unlinkedSales,
      unlinkedPurchases,
      unlinkedReturns,
      unlinkedPurchaseReturns,
      unbalancedJournals,
      balanceMismatches,
    ] = await Promise.all([
      this.prisma.salesInvoicePayment.count({
        where: { financialAccountTransactionId: null },
      }),
      this.prisma.purchaseInvoicePayment.count({
        where: { financialAccountTransactionId: null },
      }),
      this.prisma.salesReturn.count({
        where: {
          refundAmount: { gt: ZERO },
          financialAccountTransactionId: null,
        },
      }),
      this.prisma.purchaseReturn.count({
        where: {
          resolutionType: 'CASHBACK',
          status: 'COMPLETED',
          financialAccountTransactionId: null,
        },
      }),
      this.prisma.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT COUNT(*) AS count FROM (SELECT je.journal_entry_id FROM journal_entry je JOIN journal_entry_line jl ON jl.journal_entry_id = je.journal_entry_id WHERE je.status = 'POSTED' GROUP BY je.journal_entry_id HAVING SUM(jl.debit_amount) <> SUM(jl.credit_amount)) q`,
      this.prisma.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT COUNT(*) AS count FROM financial_account fa LEFT JOIN (SELECT financial_account_id, SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END) AS movement FROM financial_account_transaction WHERE status = 'COMPLETED' AND transaction_type <> 'OPENING_BALANCE' GROUP BY financial_account_id) ledger ON ledger.financial_account_id = fa.financial_account_id WHERE fa.current_balance <> fa.opening_balance + COALESCE(ledger.movement, 0)`,
    ]);
    return {
      healthy:
        unlinkedSales +
          unlinkedPurchases +
          unlinkedReturns +
          unlinkedPurchaseReturns +
          Number(unbalancedJournals[0]?.count ?? 0) +
          Number(balanceMismatches[0]?.count ?? 0) ===
        0,
      unlinkedSalesPayments: unlinkedSales,
      unlinkedPurchasePayments: unlinkedPurchases,
      unlinkedSalesReturnRefunds: unlinkedReturns,
      unlinkedPurchaseReturnCashbacks: unlinkedPurchaseReturns,
      unbalancedJournals: Number(unbalancedJournals[0]?.count ?? 0),
      balanceMismatches: Number(balanceMismatches[0]?.count ?? 0),
    };
  }
}
