import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  CircleDollarSign,
  Info,
  PackageCheck,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseApiError } from "@/utils/error";
import {
  dashboardApi,
  type DashboardFinance,
  type DashboardFilters,
  type DashboardInventory,
  type DashboardOverview,
  type DashboardPartners,
  type DashboardSales,
} from "./dashboard.api";

type Tab = "OVERVIEW" | "SALES" | "INVENTORY" | "FINANCE" | "PARTNERS";
type Preset = "TODAY" | "7D" | "30D" | "MONTH" | "LAST_MONTH" | "CUSTOM";

const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);
const number = (value: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(value || 0);
const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const period = (preset: Preset): DashboardFilters => {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from = new Date(to);
  if (preset === "7D") from.setDate(to.getDate() - 6);
  if (preset === "30D") from.setDate(to.getDate() - 29);
  if (preset === "MONTH") from = new Date(to.getFullYear(), to.getMonth(), 1);
  if (preset === "LAST_MONTH") {
    from = new Date(to.getFullYear(), to.getMonth() - 1, 1);
    return {
      dateFrom: iso(from),
      dateTo: iso(new Date(to.getFullYear(), to.getMonth(), 0)),
      topLimit: 10,
    };
  }
  return { dateFrom: iso(from), dateTo: iso(to), topLimit: 10 };
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("OVERVIEW");
  const [preset, setPreset] = useState<Preset>("30D");
  const [filters, setFilters] = useState<DashboardFilters>(() => period("30D"));
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [sales, setSales] = useState<DashboardSales | null>(null);
  const [inventory, setInventory] = useState<DashboardInventory | null>(null);
  const [finance, setFinance] = useState<DashboardFinance | null>(null);
  const [partners, setPartners] = useState<DashboardPartners | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (tab === "OVERVIEW") setOverview(await dashboardApi.overview(filters));
      if (tab === "SALES") setSales(await dashboardApi.sales(filters));
      if (tab === "INVENTORY") setInventory(await dashboardApi.inventory(filters));
      if (tab === "FINANCE") setFinance(await dashboardApi.finance(filters));
      if (tab === "PARTNERS") setPartners(await dashboardApi.partners(filters));
    } catch (caught) {
      setError(parseApiError(caught));
    } finally {
      setLoading(false);
    }
  }, [filters, tab]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, refreshKey]);

  const selectPreset = (value: Preset) => {
    setPreset(value);
    if (value !== "CUSTOM") setFilters(period(value));
  };

  const tabs = useMemo(
    () => [
      { id: "OVERVIEW" as const, label: "Ringkasan", visible: true },
      { id: "SALES" as const, label: "Penjualan", visible: overview?.access.sales ?? true },
      { id: "INVENTORY" as const, label: "Persediaan", visible: overview?.access.inventory ?? true },
      { id: "FINANCE" as const, label: "Keuangan", visible: overview?.access.finance ?? true },
      { id: "PARTNERS" as const, label: "Pelanggan & Supplier", visible: Boolean(overview?.access.sales || overview?.access.purchase) },
    ],
    [overview],
  );

  return (
    <div className="w-full space-y-4 px-2 pb-8 pt-2 sm:px-3 sm:pt-3">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">
              Pusat Performa Toko
            </p>
            <h1 className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">Dashboard</h1>
            <p className="mt-1 max-w-2xl text-xs text-slate-500 sm:text-sm">
              Pantau hal yang perlu ditindaklanjuti, penjualan, persediaan, dan keuangan dari satu tempat.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="text-[10px] font-black uppercase text-slate-500">
              Periode
              <select
                value={preset}
                onChange={(event) => selectPreset(event.target.value as Preset)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 sm:w-40"
              >
                <option value="TODAY">Hari ini</option>
                <option value="7D">7 hari</option>
                <option value="30D">30 hari</option>
                <option value="MONTH">Bulan ini</option>
                <option value="LAST_MONTH">Bulan lalu</option>
                <option value="CUSTOM">Pilih tanggal</option>
              </select>
            </label>
            {preset === "CUSTOM" && (
              <>
                <DateInput
                  label="Dari"
                  value={filters.dateFrom ?? ""}
                  onChange={(dateFrom) => setFilters((value) => ({ ...value, dateFrom }))}
                />
                <DateInput
                  label="Sampai"
                  value={filters.dateTo ?? ""}
                  onChange={(dateTo) => setFilters((value) => ({ ...value, dateTo }))}
                />
              </>
            )}
            <button
              type="button"
              disabled={loading}
              onClick={() => setRefreshKey((value) => value + 1)}
              className="flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-xs font-black text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Segarkan
            </button>
          </div>
        </div>
        <nav className="mt-4 flex gap-1 overflow-x-auto border-t border-slate-100 pt-3">
          {tabs.filter((item) => item.visible).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`shrink-0 rounded-lg px-4 py-2 text-xs font-black transition ${tab === item.id ? "bg-blue-600 text-white shadow" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><p>{error}</p><button onClick={() => void load()} className="mt-2 text-xs font-black underline">Coba lagi</button></div>
        </div>
      )}
      {loading && !currentData(tab, overview, sales, inventory, finance, partners) ? <DashboardSkeleton /> : null}
      {tab === "OVERVIEW" && overview && <Overview data={overview} navigate={navigate} />}
      {tab === "SALES" && sales && <SalesView data={sales} navigate={navigate} />}
      {tab === "INVENTORY" && inventory && <InventoryView data={inventory} navigate={navigate} />}
      {tab === "FINANCE" && finance && <FinanceView data={finance} navigate={navigate} />}
      {tab === "PARTNERS" && partners && <PartnersView data={partners} navigate={navigate} />}
    </div>
  );
}

function currentData(tab: Tab, overview: DashboardOverview | null, sales: DashboardSales | null, inventory: DashboardInventory | null, finance: DashboardFinance | null, partners: DashboardPartners | null) {
  return tab === "OVERVIEW" ? overview : tab === "SALES" ? sales : tab === "INVENTORY" ? inventory : tab === "FINANCE" ? finance : partners;
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-[10px] font-black uppercase text-slate-500">{label}<input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-slate-300 px-3 text-xs font-bold sm:w-36" /></label>;
}

function Overview({ data, navigate }: { data: DashboardOverview; navigate: ReturnType<typeof useNavigate> }) {
  const recommendations = [
    data.inventory?.lowStock ? `${data.inventory.lowStock} produk sudah mencapai batas minimum.` : null,
    data.finance?.overdueReceivable ? `Piutang lewat jatuh tempo ${money(data.finance.overdueReceivable)} perlu ditagih.` : null,
    data.finance?.overduePayable ? `Hutang lewat jatuh tempo ${money(data.finance.overduePayable)} perlu ditinjau.` : null,
    data.sales && data.sales.grossMargin < 5 && data.sales.netSales > 0 ? `Margin kotor periode ini ${data.sales.grossMargin.toFixed(1)}%. Periksa harga jual dan modal FIFO.` : null,
  ].filter((item): item is string => Boolean(item));
  return <div className="space-y-4">
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {data.sales && <>
        <Kpi title="Penjualan Bersih" value={money(data.sales.netSales)} icon={<TrendingUp />} change={data.sales.comparison?.netSales} />
        <Kpi title="Laba Kotor" value={money(data.sales.grossProfit)} icon={<CircleDollarSign />} change={data.sales.comparison?.grossProfit} />
        <PendingDocumentsCard
          salesInvoices={data.pendingDocuments?.salesInvoices ?? 0}
          purchaseInvoices={data.pendingDocuments?.purchaseInvoices ?? 0}
          canViewSales={data.access.sales}
          canViewPurchase={data.access.purchase}
          navigate={navigate}
        />
        <Kpi title="Rata-rata Belanja" value={money(data.sales.averageOrder)} icon={<Banknote />} hint={`Margin ${data.sales.grossMargin.toFixed(1)}%`} />
      </>}
      {data.finance && <Kpi title="Saldo Kas & Bank" value={money(data.finance.totalBalance)} icon={<WalletCards />} hint={`${data.finance.accounts.length} akun aktif`} />}
      {data.inventory && <Kpi title="Nilai Persediaan FIFO" value={money(data.inventory.inventoryValue)} icon={<Boxes />} hint={`${data.inventory.lowStock} stok minimum`} />}
      {data.finance && <Kpi title="Piutang Customer" value={money(data.finance.receivable)} icon={<ArrowUpRight />} hint={`${money(data.finance.overdueReceivable)} terlambat`} />}
      {data.finance && <Kpi title="Hutang Supplier" value={money(data.finance.payable)} icon={<ArrowDownRight />} hint={`${money(data.finance.overduePayable)} terlambat`} />}
    </section>
    <section className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
      <Panel title="Perlu Perhatian" subtitle="Diletakkan di atas agar pekerjaan penting tidak terlewat.">
        <div className="grid gap-2 sm:grid-cols-2">
          {data.alerts.lowStock.map((item) => <AlertCard key={`stock-${item.productId}`} tone="red" title={item.productName} text={`Stok ${number(item.availableQty)} · Minimum ${number(item.minimumQty)}`} onClick={() => navigate("/inventory")} />)}
          {data.alerts.overdueReceivables.map((item) => <AlertCard key={`ar-${item.id}`} tone="amber" title={item.number} text={`${item.partyName ?? "Customer"} · ${money(item.amount ?? 0)}`} onClick={() => navigate("/sales/customers")} />)}
          {data.alerts.overduePayables.map((item) => <AlertCard key={`ap-${item.id}`} tone="amber" title={item.number} text={`${item.partyName ?? "Supplier"} · ${money(item.amount ?? 0)}`} onClick={() => navigate("/purchasing")} />)}
          {data.alerts.latePurchaseOrders.map((item) => <AlertCard key={`po-${item.id}`} tone="blue" title={item.number} text={`${item.partyName ?? "Supplier"} · Barang belum selesai diterima`} onClick={() => navigate("/purchasing")} />)}
          {!data.alerts.lowStock.length && !data.alerts.overdueReceivables.length && !data.alerts.overduePayables.length && !data.alerts.latePurchaseOrders.length && <Empty text="Tidak ada peringatan penting saat ini." />}
        </div>
      </Panel>
      <Panel title="Saran untuk Toko" subtitle="Berdasarkan angka yang terlihat, bukan keputusan otomatis.">
        <div className="space-y-2">{recommendations.map((text) => <div key={text} className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-950">{text}</div>)}{!recommendations.length && <Empty text="Belum ada saran yang memerlukan tindakan." />}</div>
      </Panel>
    </section>
    {data.finance && <Panel title="Saldo per Akun" subtitle="Saldo terbaru dari akun Kas dan Bank aktif."><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.finance.accounts.map((account) => <button key={account.financialAccountId} onClick={() => navigate("/finance")} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:border-blue-300"><div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase text-slate-500">{account.accountType === "CASH" ? "Kas" : "Bank"}</span>{account.isDefault && <span className="rounded-full bg-blue-100 px-2 py-1 text-[9px] font-black text-blue-700">DEFAULT</span>}</div><p className="mt-2 truncate text-xs font-bold text-slate-700">{account.accountName}</p><p className="mt-1 text-base font-black text-slate-950">{money(account.currentBalance)}</p></button>)}</div></Panel>}
  </div>;
}

function SalesView({ data, navigate }: { data: DashboardSales; navigate: ReturnType<typeof useNavigate> }) {
  return <div className="space-y-4"><section className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Kpi title="Penjualan Bersih" value={money(data.kpi.netSales)} icon={<TrendingUp />} /><Kpi title="Laba Kotor" value={money(data.kpi.grossProfit)} icon={<CircleDollarSign />} /><Kpi title="Modal FIFO Terjual" value={money(data.kpi.costOfGoodsSold)} icon={<Boxes />} /><Kpi title="Margin Kotor" value={`${data.kpi.grossMargin.toFixed(2)}%`} icon={<PackageCheck />} /></section><Panel title="Tren Penjualan dan Laba" subtitle="Nilai hanya berasal dari dokumen selesai dan jurnal FIFO yang sudah tercatat." help={{ title: "Cara membaca grafik penjualan", points: ["Garis biru menunjukkan nilai penjualan bersih pada setiap tanggal.", "Garis hijau menunjukkan laba kotor: penjualan bersih dikurangi modal barang dari FIFO.", "Grafik naik berarti nilainya lebih tinggi dibanding tanggal sebelumnya. Grafik ini bukan jumlah uang tunai yang diterima."] }}><MiniLineChart rows={data.trend.map((row) => ({ label: row.date, primary: row.netSales, secondary: row.grossProfit }))} /></Panel><section className="grid gap-4 xl:grid-cols-2"><Panel title="Produk Terlaris" subtitle="Diurutkan berdasarkan penjualan bersih."><div className="space-y-2">{data.topProducts.map((item, index) => <button key={item.productId} onClick={() => navigate("/sales")} className="grid w-full grid-cols-[2rem_1fr_auto] items-center gap-2 rounded-xl border border-slate-100 p-3 text-left hover:bg-slate-50"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-[10px] font-black text-white">{index + 1}</span><span className="min-w-0"><strong className="block truncate text-xs text-slate-900">{item.productName}</strong><small className="text-[10px] text-slate-500">Terjual {number(item.soldQuantity)} · Retur {number(item.returnedQuantity)}</small></span><span className="text-right"><strong className="block text-xs">{money(item.netSales)}</strong><small className="text-[10px] font-bold text-emerald-600">Laba {money(item.grossProfit)}</small></span></button>)}{!data.topProducts.length && <Empty text="Belum ada penjualan selesai pada periode ini." />}</div></Panel><Panel title="Asal Pesanan" subtitle="Kontribusi transaksi berdasarkan sumber pesanan."><div className="space-y-3">{data.channels.map((item) => <ProgressRow key={item.channel} label={item.channel} value={item.netSales} max={Math.max(...data.channels.map((row) => row.netSales), 1)} detail={`${item.transactionCount} transaksi · ${money(item.netSales)}`} />)}{!data.channels.length && <Empty text="Belum ada data asal pesanan." />}</div></Panel></section></div>;
}

function InventoryView({ data, navigate }: { data: DashboardInventory; navigate: ReturnType<typeof useNavigate> }) {
  return <div className="space-y-4"><section className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Kpi title="Produk Aktif" value={number(data.totalProducts)} icon={<Boxes />} /><Kpi title="Stok Minimum" value={number(data.lowStock)} icon={<AlertTriangle />} /><Kpi title="Stok Habis" value={number(data.outOfStock)} icon={<PackageCheck />} /><Kpi title="Nilai FIFO" value={money(data.inventoryValue)} icon={<CircleDollarSign />} /></section><section className="grid gap-4 xl:grid-cols-2"><Panel title="Produk Perlu Diperhatikan" subtitle="Stok tersedia sudah sama atau di bawah batas minimum."><div className="space-y-2">{data.lowStockProducts.map((item) => <AlertCard key={item.productId} tone="red" title={item.productName} text={`Tersedia ${number(item.availableQty)} · Minimum ${number(item.minimumQty)}`} onClick={() => navigate("/inventory")} />)}{!data.lowStockProducts.length && <Empty text="Tidak ada produk pada batas minimum." />}</div></Panel><Panel title="Alasan Stok Berubah" subtitle="Menunjukkan dari proses apa stok bertambah atau berkurang. Jumlah qty tidak digabung karena setiap produk dapat memakai satuan berbeda."><div className="space-y-2">{data.movements.map((item) => <div key={`${item.originType}-${item.direction}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><div className="min-w-0"><p className="truncate text-xs font-black text-slate-800">{inventoryOriginLabel(item.originType)}</p><p className="text-[10px] text-slate-500">{number(item.movementCount)} perubahan stok tercatat</p></div><span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-black ${item.direction === "IN" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{item.direction === "IN" ? "BARANG MASUK" : "BARANG KELUAR"}</span></div>)}{!data.movements.length && <Empty text="Belum ada perubahan stok pada periode ini." />}</div></Panel></section></div>;
}

function FinanceView({ data, navigate }: { data: DashboardFinance; navigate: ReturnType<typeof useNavigate> }) {
  return <div className="space-y-4"><section className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Kpi title="Pendapatan" value={money(data.profitLoss.revenue)} icon={<TrendingUp />} /><Kpi title="Laba Kotor" value={money(data.profitLoss.grossProfit)} icon={<CircleDollarSign />} /><Kpi title="Beban Operasional" value={money(data.profitLoss.expenses)} icon={<ArrowDownRight />} /><Kpi title="Laba Bersih" value={money(data.profitLoss.netProfit)} icon={<Banknote />} /></section><Panel title="Arus Kas" subtitle="Kas masuk dan keluar dari seluruh akun aktif." help={{ title: "Cara membaca grafik arus kas", points: ["Garis biru menunjukkan uang yang masuk ke akun Kas atau Bank pada setiap tanggal.", "Garis merah menunjukkan uang yang keluar dari akun Kas atau Bank pada setiap tanggal.", "Arus kas berbeda dari laba. Transfer antar-akun dapat mencatat uang keluar pada satu akun dan uang masuk pada akun lainnya."] }}><MiniLineChart rows={data.cashFlow.map((row) => ({ label: row.date, primary: row.cashIn, secondary: row.cashOut }))} primaryLabel="Kas masuk" secondaryLabel="Kas keluar" secondaryTone="red" /></Panel><section className="grid gap-4 xl:grid-cols-2"><Panel title="Saldo Kas & Bank" subtitle="Klik untuk membuka buku kas."><div className="space-y-2">{data.accounts.map((account) => <button key={account.financialAccountId} onClick={() => navigate("/finance")} className="flex w-full items-center justify-between rounded-xl border border-slate-100 p-3 text-left hover:bg-slate-50"><span><strong className="block text-xs">{account.accountName}</strong><small className="text-[10px] text-slate-500">{account.accountType}</small></span><strong className="text-sm">{money(account.currentBalance)}</strong></button>)}</div></Panel><Panel title="Piutang & Hutang" subtitle="Outstanding yang masih harus diselesaikan."><div className="grid grid-cols-2 gap-3"><FinancialBox label="Piutang" value={data.receivable.outstanding} overdue={data.receivable.overdue} onClick={() => navigate("/sales/customers")} /><FinancialBox label="Hutang" value={data.payable.outstanding} overdue={data.payable.overdue} onClick={() => navigate("/purchasing")} /></div></Panel></section></div>;
}

function PartnersView({ data, navigate }: { data: DashboardPartners; navigate: ReturnType<typeof useNavigate> }) {
  return <div className="grid gap-4 xl:grid-cols-2">{data.access.sales && <Panel title="Pelanggan" subtitle={`${data.customers.activeCount} pelanggan aktif · piutang terbesar ditampilkan lebih dulu.`}><div className="space-y-2">{data.customers.outstanding.map((item) => <button key={item.customerId} onClick={() => navigate("/sales/customers")} className="flex w-full items-center justify-between rounded-xl border border-slate-100 p-3 text-left hover:border-blue-300"><span className="min-w-0"><strong className="block truncate text-xs">{item.customerName}</strong><small className="text-[10px] text-slate-500">Klik untuk melihat tagihan dan pembayaran</small></span><strong className="ml-3 text-xs text-red-600">{money(item.outstandingAmount)}</strong></button>)}{!data.customers.outstanding.length && <Empty text="Tidak ada piutang customer aktif." />}</div></Panel>}{data.access.purchase && <Panel title="Supplier" subtitle={`${data.suppliers.activeCount} supplier aktif · hutang terbesar ditampilkan lebih dulu.`}><div className="space-y-2">{data.suppliers.outstanding.map((item) => <button key={item.supplierId} onClick={() => navigate("/purchasing")} className="flex w-full items-center justify-between rounded-xl border border-slate-100 p-3 text-left hover:border-blue-300"><span className="min-w-0"><strong className="block truncate text-xs">{item.supplierName}</strong><small className="text-[10px] text-slate-500">Klik untuk membuka ringkasan supplier</small></span><strong className="ml-3 text-xs text-red-600">{money(item.outstandingAmount)}</strong></button>)}{!data.suppliers.outstanding.length && <Empty text="Tidak ada hutang supplier aktif." />}</div></Panel>}</div>;
}

function Kpi({ title, value, icon, hint, change }: { title: string; value: string; icon: React.ReactNode; hint?: string; change?: number | null }) {
  return <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"><div className="flex items-start justify-between gap-2"><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">{title}</span><span className="rounded-lg bg-blue-50 p-2 text-blue-600 [&>svg]:h-4 [&>svg]:w-4">{icon}</span></div><p className="mt-3 break-words text-base font-black text-slate-950 sm:text-xl">{value}</p>{change !== undefined && <p className={`mt-1 text-[10px] font-bold ${change === null || change >= 0 ? "text-emerald-600" : "text-red-600"}`}>{change === null ? "Data pembanding belum tersedia" : `${change >= 0 ? "+" : ""}${change}% dari periode sebelumnya`}</p>}{hint && <p className="mt-1 text-[10px] font-semibold text-slate-500">{hint}</p>}</article>;
}

function Panel({ title, subtitle, help, children }: { title: string; subtitle: string; help?: { title: string; points: string[] }; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-sm font-black text-slate-950 sm:text-base">{title}</h2><p className="mt-1 text-[10px] leading-4 text-slate-500 sm:text-xs">{subtitle}</p></div>{help && <InfoDialog title={help.title} points={help.points} />}</div>{children}</section>;
}

function AlertCard({ tone, title, text, onClick }: { tone: "red" | "amber" | "blue"; title: string; text: string; onClick: () => void }) {
  const colors = tone === "red" ? "border-red-200 bg-red-50 text-red-800" : tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-blue-200 bg-blue-50 text-blue-900";
  return <button type="button" onClick={onClick} className={`flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-left ${colors}`}><span className="min-w-0"><strong className="block truncate text-xs">{title}</strong><small className="mt-1 block text-[10px] font-semibold opacity-80">{text}</small></span><ArrowRight className="h-4 w-4 shrink-0" /></button>;
}

function MiniLineChart({ rows, primaryLabel = "Penjualan", secondaryLabel = "Laba", secondaryTone = "green" }: { rows: Array<{ label: string; primary: number; secondary: number }>; primaryLabel?: string; secondaryLabel?: string; secondaryTone?: "green" | "red" }) {
  const max = Math.max(...rows.flatMap((row) => [row.primary, row.secondary]), 1);
  const points = (key: "primary" | "secondary") => rows.map((row, index) => `${rows.length === 1 ? 50 : (index / (rows.length - 1)) * 100},${92 - (row[key] / max) * 82}`).join(" ");
  if (!rows.length) return <Empty text="Belum ada data pada periode ini." />;
  const secondaryColor = secondaryTone === "red" ? "#ef4444" : "#10b981";
  return <div><div className="mb-3 flex gap-4 text-[10px] font-bold"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-blue-600" />{primaryLabel}</span><span className="flex items-center gap-1"><i className={`h-2 w-2 rounded-full ${secondaryTone === "red" ? "bg-red-500" : "bg-emerald-500"}`} />{secondaryLabel}</span></div><div className="h-56 w-full overflow-hidden rounded-xl bg-slate-50 p-3"><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" role="img" aria-label={`${primaryLabel} dan ${secondaryLabel}`}><line x1="0" y1="92" x2="100" y2="92" stroke="#cbd5e1" strokeWidth=".5" /><polyline points={points("primary")} fill="none" stroke="#2563eb" strokeWidth="2" vectorEffect="non-scaling-stroke" /><polyline points={points("secondary")} fill="none" stroke={secondaryColor} strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg></div><div className="mt-2 flex justify-between text-[9px] font-semibold text-slate-400"><span>{new Date(rows[0].label).toLocaleDateString("id-ID")}</span><span>{new Date(rows[rows.length - 1].label).toLocaleDateString("id-ID")}</span></div></div>;
}

function PendingDocumentsCard({ salesInvoices, purchaseInvoices, canViewSales, canViewPurchase, navigate }: { salesInvoices: number; purchaseInvoices: number; canViewSales: boolean; canViewPurchase: boolean; navigate: ReturnType<typeof useNavigate> }) {
  return <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"><div className="flex items-start justify-between gap-2"><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Dokumen Belum Selesai</span><span className="rounded-lg bg-amber-50 p-2 text-amber-600"><ShoppingCart className="h-4 w-4" /></span></div><div className="mt-3 grid grid-cols-2 divide-x divide-slate-200"><button type="button" disabled={!canViewPurchase} onClick={() => navigate("/purchasing")} className="min-w-0 pr-2 text-left disabled:cursor-default disabled:opacity-40"><span className="block text-[9px] font-black uppercase text-slate-500">PI · Pembelian</span><strong className="mt-1 block text-lg font-black text-slate-950">{canViewPurchase ? number(purchaseInvoices) : "—"}</strong><small className="text-[9px] font-semibold text-slate-500">Masih draft</small></button><button type="button" disabled={!canViewSales} onClick={() => navigate("/sales")} className="min-w-0 pl-3 text-left disabled:cursor-default disabled:opacity-40"><span className="block text-[9px] font-black uppercase text-slate-500">SI · Penjualan</span><strong className="mt-1 block text-lg font-black text-slate-950">{canViewSales ? number(salesInvoices) : "—"}</strong><small className="text-[9px] font-semibold text-slate-500">Draft / Ready</small></button></div></article>;
}

function InfoDialog({ title, points }: { title: string; points: string[] }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" onClick={() => setOpen(true)} aria-label={`Penjelasan ${title}`} className="shrink-0 rounded-lg border border-blue-100 bg-blue-50 p-2 text-blue-600 transition hover:bg-blue-100"><Info className="h-4 w-4" /></button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="w-[calc(100vw-2rem)] bg-white sm:max-w-md"><DialogHeader><DialogTitle className="pr-8 text-base font-black text-slate-950">{title}</DialogTitle><DialogDescription className="text-xs leading-5 text-slate-500">Penjelasan singkat untuk membantu membaca angka pada dashboard.</DialogDescription></DialogHeader><div className="space-y-2">{points.map((point, index) => <div key={point} className="flex gap-3 rounded-xl bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-700"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-black text-white">{index + 1}</span><p>{point}</p></div>)}</div></DialogContent></Dialog></>;
}

function inventoryOriginLabel(originType: string) {
  const labels: Record<string, string> = {
    PURCHASE_INVOICE: "Penerimaan pembelian",
    PURCHASE_RETURN: "Retur pembelian",
    SALES_INVOICE: "Penjualan selesai",
    SALES_RETURN: "Retur penjualan",
    INVENTORY_ADJUSTMENT: "Penyesuaian stok",
    INVENTORY_TRANSFORMATION: "Repacking / transformasi",
    INVENTORY_LOAN: "Peminjaman barang",
    INVENTORY_LOAN_RETURN: "Pengembalian pinjaman",
    INVENTORY_LOAN_RECOVERY: "Pemulihan pinjaman",
    OPENING_BALANCE: "Saldo awal persediaan",
  };
  return labels[originType] ?? originType.replaceAll("_", " ");
}

function ProgressRow({ label, value, max, detail }: { label: string; value: number; max: number; detail: string }) {
  return <div><div className="mb-1 flex justify-between text-[10px] font-bold"><span>{label}</span><span className="text-slate-500">{detail}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(2, (value / max) * 100)}%` }} /></div></div>;
}

function FinancialBox({ label, value, overdue, onClick }: { label: string; value: number; overdue: number; onClick: () => void }) {
  return <button onClick={onClick} className="rounded-xl border border-slate-200 p-3 text-left hover:border-blue-300"><span className="text-[10px] font-black uppercase text-slate-500">{label}</span><strong className="mt-2 block text-sm text-slate-950 sm:text-base">{money(value)}</strong><small className="mt-1 block text-[10px] font-bold text-red-600">Lewat tempo {money(overdue)}</small></button>;
}

function Empty({ text }: { text: string }) { return <div className="col-span-full rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs font-semibold text-slate-400">{text}</div>; }
function DashboardSkeleton() { return <div className="space-y-4"><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-200" />)}</div><div className="h-72 animate-pulse rounded-2xl bg-slate-200" /></div>; }
