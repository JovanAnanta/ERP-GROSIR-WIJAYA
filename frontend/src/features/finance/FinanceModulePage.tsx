import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CircleAlert,
  LoaderCircle,
  Plus,
  Search,
  WalletCards,
  X,
} from "lucide-react";
import { hasPermission, useAuthStore } from "@/store/authStore";
import { parseApiError } from "@/utils/error";
import {
  financeApi,
  type FinanceAccount,
  type FinanceReportRow,
  type FinanceSummary,
  type FinanceTransaction,
} from "./finance.api";
import FinanceSourceDetailDialog from "./FinanceSourceDetailDialog";
import FinanceAccountingReports from "./FinanceAccountingReports";
import FinancialAccountBalanceCards from "./FinancialAccountBalanceCards";
import FinancialAccountsManager from "./FinancialAccountsManager";

const money = (value: number | string | null | undefined) =>
  `Rp ${Number(value ?? 0).toLocaleString("id-ID")}`;
const defaultAccountId = (
  accounts: FinanceAccount[],
  accountType: "CASH" | "BANK",
) =>
  accounts.find(
    (account) => account.accountType === accountType && account.isDefault,
  )?.financialAccountId ??
  accounts.find((account) => account.accountType === accountType)
    ?.financialAccountId ??
  accounts[0]?.financialAccountId ??
  "";
const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = isoDate(new Date());
const weekAgo = (() => {
  const date = new Date();
  date.setDate(date.getDate() - 6);
  return isoDate(date);
})();
const monthStart = (() => {
  const date = new Date();
  date.setDate(1);
  return isoDate(date);
})();
type Mode = "LEDGER" | "IN" | "OUT" | "TRANSFER";
type FinanceTab = "CASH" | "ACCOUNTS" | "JOURNAL" | "PROFIT_LOSS";

export default function FinanceModulePage() {
  const user = useAuthStore((state) => state.user);
  const canCreate = hasPermission(user, "FINANCIAL_CREATE");
  const canTransfer = hasPermission(user, "FINANCIAL_TRANSFER");
  const canManageAccounts = hasPermission(
    user,
    "FINANCIAL_ACCOUNT_MANAGE",
  );
  const [activeTab, setActiveTab] = useState<FinanceTab>("CASH");
  const [filters, setFilters] = useState({
    page: 1,
    limit: 50,
    dateFrom: weekAgo,
    dateTo: today,
    accountId: "",
    direction: "",
    sourceModule: "",
    search: "",
  });
  const [search, setSearch] = useState("");
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [items, setItems] = useState<FinanceTransaction[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  });
  const [health, setHealth] = useState<{
    healthy: boolean;
    unlinkedSalesPayments: number;
    unlinkedPurchasePayments: number;
    unlinkedSalesReturnRefunds: number;
    unlinkedPurchaseReturnCashbacks: number;
    unbalancedJournals: number;
    balanceMismatches: number;
  } | null>(null);
  const [reportGroup, setReportGroup] = useState<"DAY" | "WEEK" | "MONTH">(
    "DAY",
  );
  const [report, setReport] = useState<FinanceReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<Mode | null>(null);
  const [sourceDetail, setSourceDetail] = useState<FinanceTransaction | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    void Promise.all([financeApi.accounts(), financeApi.health()])
      .then(([accountData, healthData]) => {
        if (!active) return;
        setAccounts(Array.isArray(accountData) ? accountData : []);
        setHealth(healthData);
      })
      .catch((reason) => {
        if (active) setError(parseApiError(reason));
      });
    return () => {
      active = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (activeTab !== "CASH") return;
    setLoading(true);
    setError("");
    try {
      const [transactionData, summaryData, reportData] = await Promise.all([
        financeApi.transactions(filters),
        financeApi.summary(filters),
        financeApi.report({
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          accountId: filters.accountId || undefined,
          groupBy: reportGroup,
        }),
      ]);
      setItems(
        Array.isArray(transactionData.items) ? transactionData.items : [],
      );
      setPagination(transactionData.pagination);
      setSummary(summaryData);
      setReport(Array.isArray(reportData) ? reportData : []);
    } catch (reason) {
      setError(parseApiError(reason));
    } finally {
      setLoading(false);
    }
  }, [activeTab, filters, reportGroup]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setFilters((old) => ({ ...old, page: 1, search })),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  const cards = useMemo(
    () =>
      [
        [
          "Saldo saat ini",
          summary?.currentBalance,
          WalletCards,
          "text-slate-900",
        ],
        [
          "Kas masuk periode",
          summary?.totalIn,
          ArrowDownLeft,
          "text-emerald-700",
        ],
        [
          "Kas keluar periode",
          summary?.totalOut,
          ArrowUpRight,
          "text-rose-700",
        ],
        [
          "Perubahan bersih",
          summary?.netMovement,
          ArrowRightLeft,
          Number(summary?.netMovement ?? 0) >= 0
            ? "text-blue-700"
            : "text-rose-700",
        ],
      ] as const,
    [summary],
  );

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
            Finance & Accounting
          </h1>
          <p className="text-sm text-slate-500">
            Saldo kas/bank, arus uang, dan jejak dokumen dalam satu tempat.
          </p>
        </div>
        {activeTab === "CASH" && (
          <div className="flex flex-wrap gap-2">
            {canCreate && (
              <button
                onClick={() => setModal("IN")}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
              >
                <Plus className="mr-1 inline h-4 w-4" />
                Kas Masuk
              </button>
            )}
            {canCreate && (
              <button
                onClick={() => setModal("OUT")}
                className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white"
              >
                <Plus className="mr-1 inline h-4 w-4" />
                Kas Keluar
              </button>
            )}
            {canTransfer && (
              <button
                onClick={() => setModal("TRANSFER")}
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white"
              >
                <ArrowRightLeft className="mr-1 inline h-4 w-4" />
                Transfer
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border bg-white p-1 shadow-sm">
        {(
          [
            ["CASH", "Buku Kas"],
            ["ACCOUNTS", "Akun Kas & Bank"],
            ["JOURNAL", "Jurnal Umum"],
            ["PROFIT_LOSS", "Laba Rugi"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setActiveTab(value)}
            className={`min-w-max flex-1 rounded-lg px-4 py-2 text-xs font-bold transition ${activeTab === value ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={activeTab === "CASH" ? "contents" : "hidden"}>
        {health && !health.healthy && (
          <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900">
            <CircleAlert className="h-5 w-5 shrink-0" />
            <span>
              Ditemukan pencatatan lama yang perlu ditinjau: pembayaran Sales{" "}
              {health.unlinkedSalesPayments}, pembayaran Purchase{" "}
              {health.unlinkedPurchasePayments}, refund Sales{" "}
              {health.unlinkedSalesReturnRefunds}, cashback Purchase{" "}
              {health.unlinkedPurchaseReturnCashbacks}, selisih saldo{" "}
              {health.balanceMismatches}, jurnal tidak seimbang{" "}
              {health.unbalancedJournals}. Data lama tidak diubah otomatis.
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {cards.map(([label, value, Icon, color]) => (
            <div
              key={label}
              className="rounded-xl border bg-white p-3 shadow-sm sm:p-4"
            >
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <Icon className="h-4 w-4" />
                {label}
              </div>
              <p className={`mt-2 text-base font-black sm:text-xl ${color}`}>
                {money(value)}
              </p>
            </div>
          ))}
        </div>
        <FinancialAccountBalanceCards accounts={accounts} />
        <div className="grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="flex gap-1 sm:col-span-2 lg:col-span-6">
            <button
              onClick={() =>
                setFilters({
                  ...filters,
                  page: 1,
                  dateFrom: today,
                  dateTo: today,
                })
              }
              className="rounded-lg border px-3 py-1.5 text-xs font-bold"
            >
              Hari ini
            </button>
            <button
              onClick={() =>
                setFilters({
                  ...filters,
                  page: 1,
                  dateFrom: weekAgo,
                  dateTo: today,
                })
              }
              className="rounded-lg border px-3 py-1.5 text-xs font-bold"
            >
              7 hari
            </button>
            <button
              onClick={() =>
                setFilters({
                  ...filters,
                  page: 1,
                  dateFrom: monthStart,
                  dateTo: today,
                })
              }
              className="rounded-lg border px-3 py-1.5 text-xs font-bold"
            >
              Bulan ini
            </button>
          </div>
          <label className="text-[11px] font-bold text-slate-600">
            DARI
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  page: 1,
                  dateFrom: event.target.value,
                })
              }
              className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
            />
          </label>
          <label className="text-[11px] font-bold text-slate-600">
            SAMPAI
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) =>
                setFilters({ ...filters, page: 1, dateTo: event.target.value })
              }
              className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
            />
          </label>
          <label className="text-[11px] font-bold text-slate-600">
            AKUN
            <select
              value={filters.accountId}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  page: 1,
                  accountId: event.target.value,
                })
              }
              className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
            >
              <option value="">Semua akun</option>
              {accounts.map((account) => (
                <option
                  key={account.financialAccountId}
                  value={account.financialAccountId}
                >
                  {account.accountName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-bold text-slate-600">
            ARAH
            <select
              value={filters.direction}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  page: 1,
                  direction: event.target.value,
                })
              }
              className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
            >
              <option value="">Semua</option>
              <option value="IN">CR — Masuk</option>
              <option value="OUT">DB — Keluar</option>
            </select>
          </label>
          <label className="text-[11px] font-bold text-slate-600">
            SUMBER
            <select
              value={filters.sourceModule}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  page: 1,
                  sourceModule: event.target.value,
                })
              }
              className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
            >
              <option value="">Semua modul</option>
              <option>SALES</option>
              <option>PURCHASE</option>
              <option>FINANCE</option>
              <option>LEGACY</option>
            </select>
          </label>
          <label className="text-[11px] font-bold text-slate-600">
            CARI
            <div className="relative mt-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nomor / catatan"
                className="w-full rounded-lg border py-2 pl-8 pr-2 text-sm"
              />
            </div>
          </label>
        </div>
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-black text-slate-800">
                Ringkasan Berkala
              </h2>
              <p className="text-[11px] text-slate-500">
                Arus kas dikelompokkan tanpa membaca seluruh histori.
              </p>
            </div>
            <select
              value={reportGroup}
              onChange={(event) =>
                setReportGroup(event.target.value as "DAY" | "WEEK" | "MONTH")
              }
              className="rounded-lg border px-2 py-1.5 text-xs font-bold"
            >
              <option value="DAY">Per hari</option>
              <option value="WEEK">Per minggu</option>
              <option value="MONTH">Per bulan</option>
            </select>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {report.map((row) => (
              <div
                key={row.period}
                className="rounded-lg bg-slate-50 p-3 text-xs"
              >
                <b>{new Date(row.period).toLocaleDateString("id-ID")}</b>
                <div className="mt-2 flex justify-between text-emerald-700">
                  <span>Masuk</span>
                  <strong>{money(row.totalIn)}</strong>
                </div>
                <div className="flex justify-between text-rose-700">
                  <span>Keluar</span>
                  <strong>{money(row.totalOut)}</strong>
                </div>
                <p className="mt-1 text-slate-500">
                  {row.transactionCount} transaksi
                </p>
              </div>
            ))}
          </div>
        </div>
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </div>
        )}
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <h2 className="text-sm font-black text-slate-800">Buku Kas</h2>
            <span className="text-xs text-slate-500">
              {pagination.total} transaksi
            </span>
          </div>
          {loading ? (
            <div className="flex h-52 items-center justify-center gap-2 text-sm text-slate-500">
              <LoaderCircle className="h-5 w-5 animate-spin" />
              Memuat...
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              Belum ada transaksi pada periode ini.
            </div>
          ) : (
            <div className="divide-y">
              {items.map((item) => (
                <div
                  key={item.financialAccountTransactionId}
                  className="grid gap-2 p-3 text-xs sm:grid-cols-[150px_1fr_160px_160px] sm:items-center"
                >
                  <div>
                    <b className="text-slate-900">{item.transactionNumber}</b>
                    <p className="text-slate-500">
                      {new Date(item.transactionDate).toLocaleString("id-ID")}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">
                      {item.description || item.transactionType}
                    </p>
                    <p className="text-slate-500">
                      {item.financialAccount.accountName} ·{" "}
                      {item.referenceNumber || item.referenceType} ·{" "}
                      {item.createdByUser.fullName}
                    </p>
                    {item.referenceId && (
                      <button
                        onClick={() => setSourceDetail(item)}
                        className="mt-1 font-bold text-blue-700 hover:underline"
                      >
                        Lihat dokumen sumber
                      </button>
                    )}
                  </div>
                  <div>
                    <span
                      className={`rounded-full px-2 py-1 font-bold ${item.direction === "IN" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
                    >
                      {item.direction === "IN" ? "CR — Masuk" : "DB — Keluar"}
                    </span>
                    <p className="mt-1 font-black">{money(item.amount)}</p>
                  </div>
                  <div className="text-slate-500">
                    <p>Sebelum {money(item.balanceBefore)}</p>
                    <p className="font-bold text-slate-800">
                      Sesudah {money(item.balanceAfter)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-xs">
            <select
              value={filters.limit}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  page: 1,
                  limit: Number(event.target.value),
                })
              }
              className="rounded border px-2 py-1"
            >
              {[20, 30, 50, 100].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() =>
                  setFilters({ ...filters, page: filters.page - 1 })
                }
                className="rounded border px-3 py-1 disabled:opacity-40"
              >
                Sebelumnya
              </button>
              <span>
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() =>
                  setFilters({ ...filters, page: filters.page + 1 })
                }
                className="rounded border px-3 py-1 disabled:opacity-40"
              >
                Berikutnya
              </button>
            </div>
          </div>
        </div>
      </div>
      {activeTab === "ACCOUNTS" && (
        <FinancialAccountsManager
          canManage={canManageAccounts}
          onOpenLedger={(accountId) => {
            setFilters((old) => ({ ...old, page: 1, accountId }));
            setActiveTab("CASH");
          }}
          onChanged={() => {
            void Promise.all([financeApi.accounts(), financeApi.health()])
              .then(([accountData, healthData]) => {
                setAccounts(Array.isArray(accountData) ? accountData : []);
                setHealth(healthData);
              })
              .catch((reason) => setError(parseApiError(reason)));
          }}
        />
      )}
      {(activeTab === "JOURNAL" || activeTab === "PROFIT_LOSS") && (
        <FinanceAccountingReports
          mode={activeTab}
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          onDateChange={(dateFrom, dateTo) =>
            setFilters((old) => ({ ...old, page: 1, dateFrom, dateTo }))
          }
        />
      )}
      {modal && (
        <FinanceEntryModal
          mode={modal}
          accounts={accounts}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            void load();
            void Promise.all([financeApi.accounts(), financeApi.health()])
              .then(([accountData, healthData]) => {
                setAccounts(Array.isArray(accountData) ? accountData : []);
                setHealth(healthData);
              })
              .catch((reason) => setError(parseApiError(reason)));
          }}
        />
      )}
      <FinanceSourceDetailDialog
        transaction={sourceDetail}
        onClose={() => setSourceDetail(null)}
      />
    </div>
  );
}

function FinanceEntryModal({
  mode,
  accounts,
  onClose,
  onSaved,
}: {
  mode: Mode;
  accounts: FinanceAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const direction = mode === "OUT" ? "OUT" : "IN";
  const [categories, setCategories] = useState<
    Record<"IN" | "OUT", string[][]>
  >({ IN: [], OUT: [] });
  const [form, setForm] = useState({
    financialAccountId: defaultAccountId(accounts, "CASH"),
    sourceAccountId: defaultAccountId(accounts, "CASH"),
    destinationAccountId: defaultAccountId(accounts, "BANK"),
    amount: "",
    transactionDate: today,
    source: "",
    description: "",
    referenceNumber: "",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedAccountId =
    form.financialAccountId || defaultAccountId(accounts, "CASH");
  const selectedSourceAccountId =
    form.sourceAccountId || defaultAccountId(accounts, "CASH");
  const selectedDestinationAccountId =
    form.destinationAccountId ||
    accounts.find(
      (account) => account.financialAccountId !== selectedSourceAccountId,
    )?.financialAccountId ||
    "";
  useEffect(() => {
    void financeApi.categories().then((value) => {
      setCategories(value);
      setForm((old) => ({ ...old, source: value[direction][0]?.[0] ?? "" }));
    });
  }, [direction]);
  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      if (mode === "TRANSFER")
        await financeApi.transfer({
          sourceAccountId: selectedSourceAccountId,
          destinationAccountId: selectedDestinationAccountId,
          amount: Number(form.amount),
          transactionDate: form.transactionDate,
          referenceNumber: form.referenceNumber || undefined,
          note: form.note || undefined,
        });
      else
        await financeApi.createTransaction({
          financialAccountId: selectedAccountId,
          direction,
          amount: Number(form.amount),
          transactionDate: form.transactionDate,
          source: form.source,
          description: form.description,
          referenceNumber: form.referenceNumber || undefined,
          note: form.note || undefined,
        });
      onSaved();
    } catch (reason) {
      setError(parseApiError(reason));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:max-w-xl sm:rounded-2xl sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black">
              {mode === "TRANSFER"
                ? "Transfer Antar Akun"
                : direction === "IN"
                  ? "Catat Kas Masuk"
                  : "Catat Kas Keluar"}
            </h2>
            <p className="text-xs text-slate-500">
              Pencatatan langsung dan tidak dapat diedit. Koreksi dilakukan
              melalui pembalikan.
            </p>
          </div>
          <button onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && (
          <div className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
            {error}
          </div>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {mode === "TRANSFER" ? (
            <>
              <Field label="AKUN ASAL">
                <select
                  value={selectedSourceAccountId}
                  onChange={(e) =>
                    setForm({ ...form, sourceAccountId: e.target.value })
                  }
                  className="input"
                >
                  {accounts.map((a) => (
                    <option
                      key={a.financialAccountId}
                      value={a.financialAccountId}
                    >
                      {a.accountName} · {money(a.currentBalance)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="AKUN TUJUAN">
                <select
                  value={selectedDestinationAccountId}
                  onChange={(e) =>
                    setForm({ ...form, destinationAccountId: e.target.value })
                  }
                  className="input"
                >
                  {accounts.map((a) => (
                    <option
                      key={a.financialAccountId}
                      value={a.financialAccountId}
                    >
                      {a.accountName}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : (
            <>
              <Field label="AKUN KAS / BANK">
                <select
                  value={selectedAccountId}
                  onChange={(e) =>
                    setForm({ ...form, financialAccountId: e.target.value })
                  }
                  className="input"
                >
                  {accounts.map((a) => (
                    <option
                      key={a.financialAccountId}
                      value={a.financialAccountId}
                    >
                      {a.accountName} · {money(a.currentBalance)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="KATEGORI">
                <select
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className="input"
                >
                  {categories[direction].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
          <Field label="NOMINAL">
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="input"
              placeholder="Rp 0"
            />
          </Field>
          <Field label="TANGGAL">
            <input
              type="date"
              max={today}
              value={form.transactionDate}
              onChange={(e) =>
                setForm({ ...form, transactionDate: e.target.value })
              }
              className="input"
            />
          </Field>
          {mode !== "TRANSFER" && (
            <Field label="KEPERLUAN / KETERANGAN" wide>
              <input
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                className="input"
                placeholder="Contoh: Gaji staf bulan September"
              />
            </Field>
          )}
          <Field label="NO. REFERENSI (OPSIONAL)">
            <input
              value={form.referenceNumber}
              onChange={(e) =>
                setForm({ ...form, referenceNumber: e.target.value })
              }
              className="input"
            />
          </Field>
          <Field label="CATATAN (OPSIONAL)">
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="input"
            />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t pt-4">
          <button
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-bold"
          >
            Batal
          </button>
          <button
            disabled={
              saving ||
              !form.amount ||
              (mode === "TRANSFER"
                ? !selectedSourceAccountId ||
                  !selectedDestinationAccountId ||
                  selectedSourceAccountId === selectedDestinationAccountId
                : !selectedAccountId || !form.source || !form.description)
            }
            onClick={() => void submit()}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {saving ? "Menyimpan..." : "Simpan Transaksi"}
          </button>
        </div>
      </div>
    </div>
  );
}
function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`text-[11px] font-bold text-slate-600 ${wide ? "sm:col-span-2" : ""}`}
    >
      {label}
      <div className="mt-1 [&_.input]:w-full [&_.input]:rounded-lg [&_.input]:border [&_.input]:px-3 [&_.input]:py-2.5 [&_.input]:text-sm [&_.input]:font-medium">
        {children}
      </div>
    </label>
  );
}
