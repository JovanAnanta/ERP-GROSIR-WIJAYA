import { Landmark, WalletCards } from "lucide-react";
import type { FinanceAccount } from "./finance.api";

const money = (value: number | string | null | undefined) =>
  `Rp ${Number(value ?? 0).toLocaleString("id-ID")}`;

export default function FinancialAccountBalanceCards({
  accounts,
}: {
  accounts: FinanceAccount[];
}) {
  return (
    <section className="rounded-xl border bg-white p-3 shadow-sm sm:p-4">
      <div>
        <h2 className="text-sm font-black text-slate-900">Saldo per Akun</h2>
        <p className="text-[11px] text-slate-500">
          Saldo tersedia pada masing-masing kas dan rekening bank.
        </p>
      </div>

      {accounts.length ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => {
            const isCash = account.accountType.toUpperCase() === "CASH";
            const Icon = isCash ? WalletCards : Landmark;
            const accountIdentity = [account.bankName, account.accountNumber]
              .filter(Boolean)
              .join(" · ");

            return (
              <article
                key={account.financialAccountId}
                className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                        isCash
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black text-slate-900">
                        {account.accountName}
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {isCash ? "Kas" : "Bank"}
                      </p>
                    </div>
                  </div>
                </div>
                <p className="mt-3 break-words text-lg font-black text-slate-900">
                  {money(account.currentBalance)}
                </p>
                <p className="mt-1 min-h-4 break-all text-[10px] text-slate-500">
                  {accountIdentity || (isCash ? "Uang tunai" : "Detail rekening belum diisi")}
                </p>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-lg bg-slate-50 p-4 text-center text-xs text-slate-500">
          Belum ada akun kas atau bank aktif.
        </div>
      )}
    </section>
  );
}
