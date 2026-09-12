import { systemConfigApi } from "@/features/system/system-configuration.api";
import type { JournalEntry, ProfitLossReport } from "./finance.api";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const money = (value: number | string) => Number(value || 0).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function openReport(title: string, period: string, body: string, landscape = false) {
  const config = await systemConfigApi.get();
  const popup = window.open("", "_blank", "width=1100,height=800");
  if (!popup) throw new Error("Popup export diblokir browser.");
  popup.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>@page{size:A4 ${landscape ? "landscape" : "portrait"};margin:14mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;color:#172033}.head{text-align:center;margin-bottom:14px}.logo{max-width:95px;max-height:55px;object-fit:contain}.company{font-size:16px;font-weight:800}.muted{color:#667085}.title{margin-top:12px;font-size:17px;font-weight:800}table{width:100%;border-collapse:collapse}th,td{padding:6px 7px;border:1px solid #cbd5e1;vertical-align:top}th{background:#e9eef6;text-align:left}.num{text-align:right;white-space:nowrap}.total{font-weight:800;background:#f1f5f9}.warn{margin:10px 0;padding:8px;border:1px solid #f59e0b;background:#fffbeb}.ok{margin:10px 0;padding:8px;border:1px solid #10b981;background:#ecfdf5}.section{font-weight:800;background:#dbeafe}.footer{margin-top:14px;text-align:center;color:#667085;font-size:9px}@media print{button{display:none}}</style></head><body><div class="head">${config.logoBase64 ? `<img class="logo" src="${escapeHtml(config.logoBase64)}">` : ""}<div class="company">${escapeHtml(config.companyName)}</div><div>${escapeHtml(config.address)}</div><div>${escapeHtml(config.phone)}</div><div class="title">${escapeHtml(title)}</div><div class="muted">Periode ${escapeHtml(period)}</div></div>${body}<div class="footer">Dicetak ${escapeHtml(new Date().toLocaleString("id-ID"))}</div></body></html>`);
  popup.document.close();
  window.setTimeout(() => { popup.focus(); popup.print(); }, 300);
}

export async function exportJournalPdf(entries: JournalEntry[], dateFrom: string, dateTo: string) {
  const rows = entries.flatMap((entry) => entry.lines.map((line, index) => `<tr><td>${index === 0 ? escapeHtml(new Date(entry.transactionDate).toLocaleDateString("id-ID")) : ""}</td><td>${index === 0 ? escapeHtml(entry.journalNumber) : ""}</td><td>${escapeHtml(line.chartAccount.accountCode)} - ${escapeHtml(line.chartAccount.accountName)}</td><td>${escapeHtml(line.description || (index === 0 ? entry.description : ""))}</td><td>${index === 0 ? escapeHtml(entry.sourceNumber || entry.sourceType) : ""}</td><td class="num">${money(line.debitAmount)}</td><td class="num">${money(line.creditAmount)}</td></tr>`)).join("");
  const debit = entries.flatMap((entry) => entry.lines).reduce((sum, line) => sum + Number(line.debitAmount), 0);
  const credit = entries.flatMap((entry) => entry.lines).reduce((sum, line) => sum + Number(line.creditAmount), 0);
  await openReport("Jurnal Umum", `${dateFrom} s.d. ${dateTo}`, `<table><thead><tr><th>Tanggal</th><th>No. Jurnal</th><th>Akun</th><th>Keterangan</th><th>Sumber</th><th class="num">Debit</th><th class="num">Kredit</th></tr></thead><tbody>${rows}<tr class="total"><td colspan="5">TOTAL PADA HASIL YANG DIEKSPOR</td><td class="num">${money(debit)}</td><td class="num">${money(credit)}</td></tr></tbody></table>`, true);
}

export async function exportProfitLossPdf(report: ProfitLossReport, dateFrom: string, dateTo: string) {
  const typeLabel = { REVENUE: "Pendapatan", COGS: "Harga Pokok Penjualan", EXPENSE: "Beban Operasional" } as const;
  const rows = (["REVENUE", "COGS", "EXPENSE"] as const).flatMap((type) => [`<tr class="section"><td colspan="2">${typeLabel[type]}</td></tr>`, ...report.rows.filter((row) => row.accountType === type).map((row) => `<tr><td>${escapeHtml(row.accountCode)} - ${escapeHtml(row.accountName)}</td><td class="num">${money(row.amount)}</td></tr>`)]).join("");
  const status = `<div class="${report.coverage.isComplete ? "ok" : "warn"}"><b>${report.coverage.isComplete ? "Data jurnal lengkap" : "Laporan sementara"}</b><br>${escapeHtml(report.coverage.message)}</div>`;
  const totals = `<tr class="total"><td>Total Pendapatan</td><td class="num">${money(report.totals.revenue)}</td></tr><tr class="total"><td>Total HPP</td><td class="num">${money(report.totals.costOfGoodsSold)}</td></tr><tr class="total"><td>LABA KOTOR</td><td class="num">${money(report.totals.grossProfit)}</td></tr><tr class="total"><td>Total Beban Operasional</td><td class="num">${money(report.totals.operatingExpenses)}</td></tr><tr class="total"><td>LABA BERSIH</td><td class="num">${money(report.totals.netProfit)}</td></tr>`;
  await openReport("Laporan Laba Rugi", `${dateFrom} s.d. ${dateTo}`, `${status}<table><thead><tr><th>Akun</th><th class="num">Nilai</th></tr></thead><tbody>${rows}${totals}</tbody></table>`);
}
