import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CircleAlert,
  Landmark,
  Pencil,
  Plus,
  Power,
  Star,
  WalletCards,
  X,
} from "lucide-react";
import { parseApiError } from "@/utils/error";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { financeApi, type FinanceAccount } from "./finance.api";

const today = new Date().toLocaleDateString("en-CA");
const money = (value: number | string | null | undefined) =>
  `Rp ${Number(value ?? 0).toLocaleString("id-ID")}`;

export default function FinancialAccountsManager({
  canManage,
  onChanged,
  onOpenLedger,
}: {
  canManage: boolean;
  onChanged: () => void;
  onOpenLedger: (accountId: string) => void;
}) {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [editing, setEditing] = useState<FinanceAccount | null | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setAccounts(await financeApi.accountSettings());
    } catch (reason) {
      setError(parseApiError(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleAccounts = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("id-ID");
    return accounts.filter(
      (account) =>
        (showInactive || account.isActive !== false) &&
        (!needle ||
          [account.accountName, account.bankName, account.accountNumber]
            .filter(Boolean)
            .some((value) =>
              String(value).toLocaleLowerCase("id-ID").includes(needle),
            )),
    );
  }, [accounts, search, showInactive]);

  const mutate = async (action: () => Promise<unknown>) => {
    setError("");
    try {
      await action();
      await load();
      onChanged();
    } catch (reason) {
      setError(parseApiError(reason));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-black text-slate-900">
            Pengaturan Akun Kas & Bank
          </h2>
          <p className="text-[11px] text-slate-500">
            Setiap kas dan rekening mempunyai saldo serta histori sendiri.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setEditing(null)}
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white"
          >
            <Plus className="mr-1 inline h-4 w-4" /> Tambah Akun
          </button>
        )}
      </div>

      <div className="grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari nama akun, bank, atau nomor rekening..."
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold text-slate-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
          />
          Tampilkan nonaktif
        </label>
      </div>

      {error && (
        <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <CircleAlert className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border bg-white p-10 text-center text-sm text-slate-500">
          Memuat akun kas dan bank...
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleAccounts.map((account) => {
            const active = account.isActive !== false;
            const isCash = account.accountType === "CASH";
            const Icon = isCash ? WalletCards : Landmark;
            const canDeactivate =
              active && !account.isDefault && Number(account.currentBalance) === 0;
            return (
              <article
                key={account.financialAccountId}
                className={`rounded-xl border p-4 shadow-sm ${
                  active
                    ? "border-slate-200 bg-white"
                    : "border-slate-200 bg-slate-100 text-slate-500"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                        isCash
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-black">
                        {account.accountName}
                      </h3>
                      <p className="text-[10px] font-bold uppercase tracking-wide">
                        {isCash ? "Kas" : account.bankName || "Bank"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {account.isDefault && (
                      <span className="rounded-full bg-blue-100 px-2 py-1 text-[9px] font-black text-blue-700">
                        DEFAULT
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-1 text-[9px] font-black ${
                        active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {active ? "AKTIF" : "NONAKTIF"}
                    </span>
                  </div>
                </div>
                <p className="mt-4 text-xl font-black text-slate-900">
                  {money(account.currentBalance)}
                </p>
                <div className="mt-2 space-y-1 text-[11px]">
                  <p>{account.accountNumber || (isCash ? "Uang tunai" : "Nomor rekening belum diisi")}</p>
                  <p>{account._count?.transactions ?? 0} transaksi tercatat</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                  <button
                    onClick={() => onOpenLedger(account.financialAccountId)}
                    className="rounded-lg border px-2.5 py-1.5 text-[10px] font-bold"
                  >
                    Lihat Buku Kas
                  </button>
                  {canManage && (
                    <>
                      <button
                        onClick={() => setEditing(account)}
                        className="rounded-lg border px-2.5 py-1.5 text-[10px] font-bold"
                      >
                        <Pencil className="mr-1 inline h-3 w-3" /> Edit
                      </button>
                      {active && !account.isDefault && (
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                `Jadikan ${account.accountName} sebagai akun ${isCash ? "tunai" : "transfer"} default?`,
                              )
                            )
                              void mutate(() =>
                                financeApi.setDefaultAccount(
                                  account.financialAccountId,
                                ),
                              );
                          }}
                          className="rounded-lg border border-blue-200 px-2.5 py-1.5 text-[10px] font-bold text-blue-700"
                        >
                          <Star className="mr-1 inline h-3 w-3" /> Jadikan Default
                        </button>
                      )}
                      <button
                        disabled={active && !canDeactivate}
                        title={
                          active && !canDeactivate
                            ? account.isDefault
                              ? "Pindahkan akun default terlebih dahulu"
                              : "Saldo harus Rp0 sebelum akun dinonaktifkan"
                            : undefined
                        }
                        onClick={() => {
                          if (
                            window.confirm(
                              `${active ? "Nonaktifkan" : "Aktifkan"} ${account.accountName}?`,
                            )
                          )
                            void mutate(() =>
                              financeApi.changeAccountStatus(
                                account.financialAccountId,
                                !active,
                              ),
                            );
                        }}
                        className="rounded-lg border px-2.5 py-1.5 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Power className="mr-1 inline h-3 w-3" />
                        {active ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
          {!visibleAccounts.length && (
            <div className="rounded-xl border bg-white p-10 text-center text-sm text-slate-500 sm:col-span-2 xl:col-span-3">
              Tidak ada akun yang sesuai pencarian.
            </div>
          )}
        </div>
      )}

      {editing !== undefined && (
        <AccountFormDialog
          account={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function AccountFormDialog({
  account,
  onClose,
  onSaved,
}: {
  account: FinanceAccount | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(account);
  const [form, setForm] = useState({
    accountName: account?.accountName ?? "",
    accountType: account?.accountType ?? ("CASH" as "CASH" | "BANK"),
    bankName: account?.bankName ?? "",
    accountNumber: account?.accountNumber ?? "",
    openingBalance: "0",
    openingBalanceDate: today,
    isDefault: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!form.accountName.trim()) return setError("Nama akun wajib diisi.");
    if (form.accountType === "BANK" && !form.bankName.trim())
      return setError("Nama bank wajib diisi.");
    setSaving(true);
    try {
      if (account) {
        await financeApi.updateAccount(account.financialAccountId, {
          accountName: form.accountName.trim(),
          bankName: form.bankName.trim() || undefined,
          accountNumber: form.accountNumber.trim() || undefined,
        });
      } else {
        await financeApi.createAccount({
          accountName: form.accountName.trim(),
          accountType: form.accountType,
          bankName: form.bankName.trim() || undefined,
          accountNumber: form.accountNumber.trim() || undefined,
          openingBalance: Number(form.openingBalance || 0),
          openingBalanceDate: form.openingBalanceDate,
          isDefault: form.isDefault,
        });
      }
      onSaved();
    } catch (reason) {
      setError(parseApiError(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:max-w-2xl sm:rounded-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">
              {isEdit ? "Edit Akun Kas & Bank" : "Tambah Akun Kas & Bank"}
            </h2>
            <p className="text-xs text-slate-500">
              Saldo tidak dapat diedit langsung setelah akun dibuat.
            </p>
          </div>
          <button onClick={onClose} aria-label="Tutup">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-700 sm:col-span-2">
            NAMA AKUN
            <input
              value={form.accountName}
              onChange={(event) =>
                setForm({ ...form, accountName: event.target.value })
              }
              placeholder="Contoh: Kas Toko, Bank BCA"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-bold text-slate-700">
            JENIS AKUN
            <select
              disabled={isEdit}
              value={form.accountType}
              onChange={(event) =>
                setForm({
                  ...form,
                  accountType: event.target.value as "CASH" | "BANK",
                  bankName: "",
                  accountNumber: "",
                })
              }
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-slate-100"
            >
              <option value="CASH">Kas / Tunai</option>
              <option value="BANK">Rekening Bank</option>
            </select>
          </label>
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <Building2 className="mr-1 inline h-4 w-4" />
            {form.accountType === "CASH"
              ? "Untuk uang tunai fisik."
              : "Untuk rekening bank terpisah."}
          </div>
          {form.accountType === "BANK" && (
            <>
              <label className="text-xs font-bold text-slate-700">
                NAMA BANK
                <input
                  value={form.bankName}
                  onChange={(event) =>
                    setForm({ ...form, bankName: event.target.value })
                  }
                  placeholder="Contoh: BCA"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                NOMOR REKENING (OPSIONAL)
                <input
                  value={form.accountNumber}
                  onChange={(event) =>
                    setForm({ ...form, accountNumber: event.target.value })
                  }
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                />
              </label>
            </>
          )}
          {!isEdit && (
            <>
              <label className="text-xs font-bold text-slate-700">
                SALDO AWAL
                <FormattedNumberInput
                  value={form.openingBalance ? Number(form.openingBalance) : 0}
                  onChange={(val) =>
                    setForm({ ...form, openingBalance: String(val) })
                  }
                  placeholder="0"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-semibold"
                />
              </label>
              <label className="text-xs font-bold text-slate-700">
                TANGGAL SALDO AWAL
                <input
                  type="date"
                  value={form.openingBalanceDate}
                  max={today}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      openingBalanceDate: event.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 rounded-lg border p-3 text-xs font-bold sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(event) =>
                    setForm({ ...form, isDefault: event.target.checked })
                  }
                />
                Jadikan akun {form.accountType === "CASH" ? "tunai" : "transfer"} default
              </label>
            </>
          )}
        </div>

        <div className="mt-4 min-h-10">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              {error}
            </div>
          )}
        </div>
        <div className="mt-2 flex justify-end gap-2 border-t pt-4">
          <button
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-xs font-bold"
          >
            Batal
          </button>
          <button
            disabled={saving}
            onClick={() => void submit()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
