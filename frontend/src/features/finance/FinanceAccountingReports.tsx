import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Download, LoaderCircle, Search } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { parseApiError } from "@/utils/error";
import { financeApi, type ChartAccount, type JournalEntry, type ProfitLossReport } from "./finance.api";
import { exportJournalPdf, exportProfitLossPdf } from "./finance-report-print";

const money = (value: number | string | null | undefined) => `Rp ${Number(value ?? 0).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const localIsoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export default function FinanceAccountingReports({ mode, dateFrom, dateTo, onDateChange }: { mode: "JOURNAL" | "PROFIT_LOSS"; dateFrom: string; dateTo: string; onDateChange: (dateFrom: string, dateTo: string) => void }) {
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [profitLoss, setProfitLoss] = useState<ProfitLossReport | null>(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [journalTotals, setJournalTotals] = useState({ debit: 0, credit: 0 });
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [chartAccountId, setChartAccountId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { const timer = window.setTimeout(() => { setSearch(searchInput); setPagination((old) => ({ ...old, page: 1 })); }, 300); return () => window.clearTimeout(timer); }, [searchInput]);
  useEffect(() => { if (mode === "JOURNAL") void financeApi.chartAccounts().then(setChartAccounts).catch((reason) => setError(parseApiError(reason))); }, [mode]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      if (mode === "JOURNAL") {
        const value = await financeApi.journals({ page: pagination.page, limit: pagination.limit, dateFrom, dateTo, chartAccountId: chartAccountId || undefined, search });
        setJournals(value.items); setPagination(value.pagination); setJournalTotals({ debit: Number(value.totals.debit), credit: Number(value.totals.credit) });
      } else setProfitLoss(await financeApi.profitLoss({ dateFrom, dateTo }));
    } catch (reason) { setError(parseApiError(reason)); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo, pagination.page, pagination.limit, search, chartAccountId, mode]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  return <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
    <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="text-sm font-black text-slate-900">{mode === "JOURNAL" ? "Jurnal Umum" : "Laporan Laba Rugi"}</h2><p className="text-[11px] text-slate-500">{mode === "JOURNAL" ? "Daftar akun dan nilai debit/kredit berdasarkan jurnal terposting." : "Pendapatan, HPP, laba kotor, beban, dan laba bersih berdasarkan jurnal terposting."}</p></div>
    </div>
    <div className="grid gap-2 border-b p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto]">
      <label className="text-[10px] font-bold text-slate-600">DARI<input type="date" value={dateFrom} onChange={(event) => onDateChange(event.target.value, dateTo)} className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"/></label>
      <label className="text-[10px] font-bold text-slate-600">SAMPAI<input type="date" value={dateTo} onChange={(event) => onDateChange(dateFrom, event.target.value)} className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"/></label>
      <button onClick={() => onDateChange(localIsoDate(new Date()), localIsoDate(new Date()))} className="self-end rounded-lg border px-3 py-2 text-xs font-bold">Hari ini</button>
      <button onClick={() => { const date = new Date(); date.setDate(date.getDate()-6); onDateChange(localIsoDate(date), localIsoDate(new Date())); }} className="self-end rounded-lg border px-3 py-2 text-xs font-bold">7 hari</button>
      <button onClick={() => { const date = new Date(); date.setDate(1); onDateChange(localIsoDate(date), localIsoDate(new Date())); }} className="self-end rounded-lg border px-3 py-2 text-xs font-bold">Bulan ini</button>
    </div>
    {error && <div className="m-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
    {mode === "JOURNAL" ? <>
      <div className="grid gap-2 border-b p-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,320px)_auto]"><div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400"/><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Cari jurnal, akun, atau dokumen" className="w-full rounded-lg border py-2 pl-8 pr-2 text-sm"/></div><SearchableSelect value={chartAccountId} onChange={(val) => { setChartAccountId(val); setPagination((old) => ({ ...old, page: 1 })); }} placeholder="Semua akun jurnal" options={[{ value: "", label: "Semua akun jurnal" }, ...chartAccounts.map((account) => ({ value: account.chartAccountId, label: `${account.accountCode} · ${account.accountName}` }))]} className="text-sm"/><button disabled={!journals.length} onClick={() => void exportJournalPdf(journals, dateFrom, dateTo).catch((reason) => setError(parseApiError(reason)))} className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-40"><Download className="mr-1 inline h-4 w-4"/>Export PDF halaman ini</button></div>
      {loading ? <Loading/> : <div className="overflow-x-auto"><table className="min-w-[900px] w-full text-xs"><thead className="bg-slate-100 text-left text-[10px] uppercase text-slate-600"><tr><th className="p-2">Tanggal / Jurnal</th><th className="p-2">Akun</th><th className="p-2">Keterangan</th><th className="p-2">Sumber</th><th className="p-2 text-right">Debit</th><th className="p-2 text-right">Kredit</th></tr></thead><tbody>{journals.flatMap((entry) => entry.lines.map((line, index) => <tr key={line.journalEntryLineId} className="border-t"><td className="p-2 align-top">{index === 0 && <><b>{entry.journalNumber}</b><p className="text-slate-500">{new Date(entry.transactionDate).toLocaleDateString("id-ID")}</p></>}</td><td className="p-2 align-top"><b>{line.chartAccount.accountCode}</b> · {line.chartAccount.accountName}</td><td className="p-2 align-top">{line.description || (index === 0 ? entry.description : "-")}</td><td className="p-2 align-top">{index === 0 ? entry.sourceNumber || entry.sourceType : ""}</td><td className="p-2 text-right align-top font-semibold">{Number(line.debitAmount) ? money(line.debitAmount) : "-"}</td><td className="p-2 text-right align-top font-semibold">{Number(line.creditAmount) ? money(line.creditAmount) : "-"}</td></tr>))}</tbody></table>{!journals.length && <div className="p-10 text-center text-sm text-slate-500">Belum ada jurnal pada periode ini.</div>}</div>}
      <div className="grid gap-2 border-t bg-slate-50 p-3 sm:grid-cols-3">
        <JournalTotal label="Total Debit" value={journalTotals.debit}/>
        <JournalTotal label="Total Kredit" value={journalTotals.credit}/>
        {chartAccountId ? <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700"><span>Selisih akun (Debit − Kredit)</span><b>{money(journalTotals.debit-journalTotals.credit)}</b></div> : <div className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-bold ${Math.abs(journalTotals.debit-journalTotals.credit) < 0.01 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}><span>{Math.abs(journalTotals.debit-journalTotals.credit) < 0.01 ? "Jurnal seimbang" : "Selisih jurnal"}</span>{Math.abs(journalTotals.debit-journalTotals.credit) < 0.01 ? <CheckCircle2 className="h-4 w-4"/> : <b>{money(Math.abs(journalTotals.debit-journalTotals.credit))}</b>}</div>}
      </div>
      <Pagination value={pagination} onChange={setPagination}/>
    </> : <>
      <div className="flex justify-end border-b p-3"><button disabled={!profitLoss} onClick={() => profitLoss && void exportProfitLossPdf(profitLoss, dateFrom, dateTo).catch((reason) => setError(parseApiError(reason)))} className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-40"><Download className="mr-1 inline h-4 w-4"/>Export PDF</button></div>
      {loading || !profitLoss ? <Loading/> : <div className="p-3">{!profitLoss.coverage.isComplete && <div className="mb-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><CircleAlert className="h-4 w-4 shrink-0"/><span><b>Laporan sementara.</b> {profitLoss.coverage.message} Angka tidak boleh digunakan sebagai laporan final sebelum rekonsiliasi selesai.</span></div>}<div className="overflow-x-auto"><table className="min-w-[520px] w-full text-xs"><thead className="bg-slate-100 text-left text-[10px] uppercase text-slate-600"><tr><th className="p-2">Akun</th><th className="p-2 text-right">Nilai</th></tr></thead><tbody>{(["REVENUE", "COGS", "EXPENSE"] as const).flatMap((type) => [<tr key={`${type}-title`} className="border-t bg-blue-50"><td colSpan={2} className="p-2 font-black">{{REVENUE:"Pendapatan",COGS:"Harga Pokok Penjualan",EXPENSE:"Beban Operasional"}[type]}</td></tr>, ...profitLoss.rows.filter((row) => row.accountType === type).map((row) => <tr key={row.chartAccountId} className="border-t"><td className="p-2">{row.accountCode} · {row.accountName}</td><td className="p-2 text-right font-semibold">{money(row.amount)}</td></tr>)])}<Total label="Total Pendapatan" value={profitLoss.totals.revenue}/><Total label="Total HPP" value={profitLoss.totals.costOfGoodsSold}/><Total label="Laba Kotor" value={profitLoss.totals.grossProfit}/><Total label="Total Beban Operasional" value={profitLoss.totals.operatingExpenses}/><Total label="Laba Bersih" value={profitLoss.totals.netProfit}/></tbody></table></div></div>}
    </>}
  </section>;
}

function Loading() { return <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin"/>Memuat...</div>; }
function Total({ label, value }: { label: string; value: number }) { return <tr className="border-t bg-slate-100 font-black"><td className="p-2 uppercase">{label}</td><td className={`p-2 text-right ${value < 0 ? "text-rose-700" : "text-slate-900"}`}>{money(value)}</td></tr>; }
function JournalTotal({ label, value }: { label: string; value: number }) { return <div className="flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-xs"><span className="font-bold text-slate-500">{label}</span><b className="text-slate-900">{money(value)}</b></div>; }
function Pagination({ value, onChange }: { value: { page: number; limit: number; total: number; totalPages: number }; onChange: React.Dispatch<React.SetStateAction<{ page: number; limit: number; total: number; totalPages: number }>> }) { return <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-xs"><select value={value.limit} onChange={(event) => onChange((old) => ({ ...old, page: 1, limit: Number(event.target.value) }))} className="rounded border px-2 py-1">{[20,30,50,100].map((size) => <option key={size}>{size}</option>)}</select><span className="text-slate-500">{value.total} jurnal</span><div className="flex items-center gap-2"><button disabled={value.page <= 1} onClick={() => onChange((old) => ({ ...old, page: old.page - 1 }))} className="rounded border px-3 py-1 disabled:opacity-40">Sebelumnya</button><span>{value.page} / {value.totalPages}</span><button disabled={value.page >= value.totalPages} onClick={() => onChange((old) => ({ ...old, page: old.page + 1 }))} className="rounded border px-3 py-1 disabled:opacity-40">Berikutnya</button></div></div>; }
