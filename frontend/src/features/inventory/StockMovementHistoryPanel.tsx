import { useEffect, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseApiError } from '@/utils/error';
import { inventoryApi, type PaginationMeta, type StockFilterOptions, type StockHistoryItem } from './inventory.api';
import InventorySectionNav, { type InventorySection } from './InventorySectionNav';
import InventoryPageSizeSelect from './InventoryPageSizeSelect';

export default function StockMovementHistoryPanel({ onNavigate }: { onNavigate: (section: InventorySection) => void }) {
  const [items, setItems] = useState<StockHistoryItem[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ currentPage: 1, pageSize: 20, totalData: 0, totalPage: 0 });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [options, setOptions] = useState<StockFilterOptions>({ categories: [], brands: [], suppliers: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    inventoryApi.stockFilters()
      .then(setOptions)
      .catch((caught) => setError(parseApiError(caught)));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setQuery(search.trim()); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    // Loading mirrors the lifecycle of this server-backed page request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    inventoryApi.stockHistory(page, limit, {
      search: query || undefined,
      categoryId: categoryId || undefined,
      brandId: brandId || undefined,
      supplierId: supplierId || undefined,
    })
      .then((response) => { if (active) { setItems(response.data); setMeta(response.meta); setError(''); } })
      .catch((caught) => { if (active) setError(parseApiError(caught)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, limit, query, categoryId, brandId, supplierId]);

  const selectFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  return <div className="min-h-full bg-slate-50 p-3 sm:p-6">
    <div className="mb-4"><h1 className="text-xl font-black text-slate-900 sm:text-2xl">Inventory & Warehouse</h1><p className="text-xs font-medium text-slate-500 sm:text-sm">Pantau posisi stok setiap produk dengan satuan yang mudah dibaca.</p></div>
    <InventorySectionNav current="MOVEMENTS" onChange={onNavigate}/>
    <div className="mt-3 rounded-xl border bg-white p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-full rounded-lg border bg-white pl-9 pr-10 text-sm outline-none focus:border-blue-400" placeholder="Cari nama produk dalam filter yang dipilih..."/>{loading && <span className="absolute right-3 top-3 h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"/>}</div><InventoryPageSizeSelect value={limit} onChange={(value) => { setLimit(value); setPage(1); }}/></div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <select value={categoryId} onChange={(event) => selectFilter(setCategoryId, event.target.value)} className="h-9 rounded-md border bg-white px-2 text-xs font-semibold"><option value="">Semua kategori</option>{options.categories.map((item) => <option key={item.categoryId} value={item.categoryId}>{item.categoryName}</option>)}</select>
        <select value={brandId} onChange={(event) => selectFilter(setBrandId, event.target.value)} className="h-9 rounded-md border bg-white px-2 text-xs font-semibold"><option value="">Semua merek</option>{options.brands.map((item) => <option key={item.brandId} value={item.brandId}>{item.brandName}</option>)}</select>
        <select value={supplierId} onChange={(event) => selectFilter(setSupplierId, event.target.value)} className="h-9 rounded-md border bg-white px-2 text-xs font-semibold"><option value="">Semua supplier</option>{options.suppliers.map((item) => <option key={item.supplierId} value={item.supplierId}>{item.supplierName}</option>)}</select>
      </div>
      <p className="mt-2 text-[10px] font-medium text-slate-400">Pencarian hanya menampilkan produk yang sesuai dengan seluruh filter aktif.</p>
    </div>
    {error && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</div>}
    <div className={`mt-3 grid gap-2 transition-opacity ${loading ? 'opacity-55' : 'opacity-100'}`}>
      {items.map((item) => <article key={item.productUnitId} className={`rounded-lg border bg-white px-3 py-2.5 shadow-sm ${item.isLowStock ? 'border-red-300 bg-red-50/60' : 'border-slate-200'}`}>
        <div className="mb-2 flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="truncate text-xs font-extrabold text-slate-900 sm:text-sm">{item.productName}</h2>{item.isLowStock && <p className="mt-0.5 flex items-center text-[10px] font-bold text-red-700"><AlertTriangle className="mr-1 h-3 w-3"/>Stok mencapai batas minimum ({item.minimumDisplay})</p>}</div>{item.availableQty < 0 && <span className="shrink-0 rounded-full bg-rose-100 px-2 py-1 text-[9px] font-black text-rose-700">KURANG {item.shortageDisplay}</span>}</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4"><StockValue label="Fisik" value={item.actualDisplay}/><StockValue label="Di Gudang" value={item.warehouseDisplay}/><StockValue label="Dikemas" value={item.packedDisplay}/><StockValue label="Siap Dijual" value={item.availableQty < 0 ? '0' : item.availableDisplay} danger={item.availableQty < 0}/></div>
      </article>)}
      {!loading && items.length === 0 && <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-400">Produk tidak ditemukan.</div>}
    </div>
    {meta.totalData > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-xs"><span className="text-slate-500">Menampilkan {items.length} dari {meta.totalData} produk · Halaman {meta.currentPage} dari {Math.max(meta.totalPage, 1)}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Prev</Button><Button size="sm" variant="outline" disabled={page >= meta.totalPage || loading} onClick={() => setPage(page + 1)}>Next</Button></div></div>}
  </div>;
}

function StockValue({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className="min-w-0 rounded-md bg-slate-50 px-2 py-1.5"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className={`break-words text-[11px] font-extrabold leading-4 sm:text-xs ${danger ? 'text-rose-600' : 'text-slate-700'}`}>{value}</p></div>;
}
