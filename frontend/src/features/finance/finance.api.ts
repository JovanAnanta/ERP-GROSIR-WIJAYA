import { apiClient } from "@/lib/axios";

export interface FinanceAccount { financialAccountId: string; accountName: string; accountType: "CASH" | "BANK"; accountNumber?: string | null; bankName?: string | null; openingBalance?: number; currentBalance: number; isActive?: boolean; isDefault: boolean; createdAt?: string; updatedAt?: string | null; _count?: { transactions: number } }
export interface ChartAccount { chartAccountId: string; accountCode: string; accountName: string; accountType: string; normalBalance: "DEBIT" | "CREDIT" }
export interface FinanceTransaction {
  financialAccountTransactionId: string; transactionNumber: string; transactionType: string; direction: "IN" | "OUT";
  amount: number; transactionDate: string; description?: string | null; note?: string | null; sourceModule: string;
  referenceType: string; referenceId?: string | null; referenceNumber?: string | null; balanceBefore?: number | null; balanceAfter?: number | null;
  financialAccount: { accountName: string; accountType: string }; createdByUser: { fullName: string };
}
export interface FinanceSummary { accounts: FinanceAccount[]; currentBalance: number; openingBalance: number; totalIn: number; totalOut: number; netMovement: number; closingBalance: number; transactionCount: number }
export interface FinanceReportRow { period: string; totalIn: number; totalOut: number; transactionCount: number }
export interface JournalLine { journalEntryLineId: string; debitAmount: number; creditAmount: number; description?: string | null; chartAccount: { chartAccountId: string; accountCode: string; accountName: string; accountType: string } }
export interface JournalEntry { journalEntryId: string; journalNumber: string; transactionDate: string; description: string; sourceType: string; sourceNumber?: string | null; lines: JournalLine[] }
export interface ProfitLossRow { chartAccountId: string; accountCode: string; accountName: string; accountType: "REVENUE" | "COGS" | "EXPENSE"; amount: number }
export interface ProfitLossReport { rows: ProfitLossRow[]; totals: { revenue: number; costOfGoodsSold: number; grossProfit: number; operatingExpenses: number; netProfit: number }; coverage: { isComplete: boolean; completedSales: number; salesAccruals: number; completedPurchases: number; purchaseAccruals: number; message: string } }
export interface FinanceFilters { page?: number; limit?: number; dateFrom?: string; dateTo?: string; accountId?: string; direction?: string; sourceModule?: string; search?: string }
export interface CreateManualFinancePayload {
  financialAccountId: string;
  direction: "IN" | "OUT";
  amount: number;
  transactionDate: string;
  source: string;
  description: string;
  referenceNumber?: string;
  note?: string;
}
export interface CreateTransferPayload {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  transactionDate: string;
  referenceNumber?: string;
  note?: string;
}
export interface SaveFinancialAccountPayload {
  accountName: string;
  accountType: "CASH" | "BANK";
  bankName?: string;
  accountNumber?: string;
  openingBalance: number;
  openingBalanceDate?: string;
  isDefault?: boolean;
}
export interface UpdateFinancialAccountPayload {
  accountName: string;
  bankName?: string;
  accountNumber?: string;
}
const params = (value: FinanceFilters) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== "" && item !== undefined));

function unwrap(value: unknown): unknown {
  let current = value;
  while (
    current &&
    typeof current === "object" &&
    "success" in current &&
    "data" in current
  ) {
    current = (current as { data: unknown }).data;
  }
  return current;
}

function requireArray<T>(value: unknown, label: string): T[] {
  const result = unwrap(value);
  if (!Array.isArray(result)) throw new Error(`Response ${label} tidak valid.`);
  return result as T[];
}

function requireObject<T extends object>(value: unknown, label: string): T {
  const result = unwrap(value);
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error(`Response ${label} tidak valid.`);
  return result as T;
}

export const financeApi = {
  async accounts() { return requireArray<FinanceAccount>(await apiClient.get<unknown, unknown>("/finance/accounts"), "akun keuangan"); },
  async accountSettings() { return requireArray<FinanceAccount>(await apiClient.get<unknown, unknown>("/finance/account-settings"), "pengaturan akun keuangan"); },
  async chartAccounts() { return requireArray<ChartAccount>(await apiClient.get<unknown, unknown>("/finance/chart-accounts"), "daftar akun jurnal"); },
  async categories() { return requireObject<Record<"IN" | "OUT", string[][]>>(await apiClient.get<unknown, unknown>("/finance/categories"), "kategori keuangan"); },
  async transactions(filters: FinanceFilters) { const value = requireObject<{ items: unknown; pagination: { page: number; limit: number; total: number; totalPages: number }; totals?: unknown[] }>(await apiClient.get<unknown, unknown>("/finance/transactions", { params: params(filters) }), "buku kas"); return { ...value, items: requireArray<FinanceTransaction>(value.items, "transaksi keuangan"), totals: value.totals ?? [] }; },
  async summary(filters: FinanceFilters) { return requireObject<FinanceSummary>(await apiClient.get<unknown, unknown>("/finance/summary", { params: params(filters) }), "ringkasan keuangan"); },
  async health() { return requireObject<{ healthy: boolean; unlinkedSalesPayments: number; unlinkedPurchasePayments: number; unlinkedSalesReturnRefunds: number; unlinkedPurchaseReturnCashbacks: number; unbalancedJournals: number; balanceMismatches: number }>(await apiClient.get<unknown, unknown>("/finance/health"), "pemeriksaan keuangan"); },
  async report(filters: { dateFrom: string; dateTo: string; accountId?: string; groupBy: "DAY" | "WEEK" | "MONTH" }) { return requireArray<FinanceReportRow>(await apiClient.get<unknown, unknown>("/finance/report", { params: params(filters) }), "laporan keuangan"); },
  async journals(filters: { page?: number; limit?: number; dateFrom?: string; dateTo?: string; chartAccountId?: string; search?: string }) { const value = requireObject<{ items: unknown; pagination: { page: number; limit: number; total: number; totalPages: number }; totals: { debit: number; credit: number } }>(await apiClient.get<unknown, unknown>("/finance/journals", { params: params(filters) }), "jurnal umum"); return { ...value, items: requireArray<JournalEntry>(value.items, "baris jurnal") }; },
  async profitLoss(filters: { dateFrom: string; dateTo: string }) { return requireObject<ProfitLossReport>(await apiClient.get<unknown, unknown>("/finance/profit-loss", { params: params(filters) }), "laporan laba rugi"); },
  createTransaction(payload: CreateManualFinancePayload) { return apiClient.post("/finance/transactions", payload); },
  transfer(payload: CreateTransferPayload) { return apiClient.post("/finance/transfers", payload); },
  createAccount(payload: SaveFinancialAccountPayload) { return apiClient.post("/finance/accounts", payload); },
  updateAccount(id: string, payload: UpdateFinancialAccountPayload) { return apiClient.patch(`/finance/accounts/${id}`, payload); },
  changeAccountStatus(id: string, isActive: boolean) { return apiClient.patch(`/finance/accounts/${id}/status`, { isActive }); },
  setDefaultAccount(id: string) { return apiClient.post(`/finance/accounts/${id}/default`); },
};
