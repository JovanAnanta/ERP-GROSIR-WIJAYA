import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogOverlay, DialogTitle } from '@/components/ui/dialog';
import { parseApiError } from '@/utils/error';
import { inventoryApi, type PaginationMeta, type TransformationCard, type TransformationDetail, type TransformationProduct } from './inventory.api';
import InventorySectionNav, { type InventorySection } from './InventorySectionNav';
import InventoryPageSizeSelect from './InventoryPageSizeSelect';

type Row = { key: string; sourceProductUnitId: string; sourceQuantity: number; resultProductUnitId: string; resultQuantity: number; appliedUnitCost?: number; note: string };
const emptyRow = (): Row => ({ key: crypto.randomUUID(), sourceProductUnitId: '', sourceQuantity: 0, resultProductUnitId: '', resultQuantity: 0, note: '' });
const formatLocalDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const today = () => formatLocalDate(new Date());
const sevenDaysAgo = () => {
  const value = new Date();
  value.setDate(value.getDate() - 7);
  return formatLocalDate(value);
};

export default function InventoryTransformationPanel({ onNavigate }: { onNavigate: (section: InventorySection) => void }) {
  const [products, setProducts] = useState<TransformationProduct[]>([]);
  const [cards, setCards] = useState<TransformationCard[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ currentPage: 1, pageSize: 20, totalData: 0, totalPage: 0 });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<TransformationDetail | null>(null);
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(sevenDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [filters, setFilters] = useState(() => ({ search: '', dateFrom: sevenDaysAgo(), dateTo: today() }));
  const productMap = useMemo(() => new Map(products.map((item) => [item.productUnitId, item])), [products]);
  const sources = products.filter((item) => item.canBeSource);
  const results = products.filter((item) => item.canBeResult);

  const load = async () => {
    try {
      const [lookup, list] = await Promise.all([inventoryApi.transformationProducts(), inventoryApi.listTransformations(page, limit, filters)]);
      setProducts(lookup); setCards(list.data); setMeta(list.meta); setError('');
    } catch (caught) { setError(parseApiError(caught)); }
  };
  useEffect(() => {
    // Page changes are the external trigger for refreshing this server-backed list.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setFilters((current) => current.search === search.trim() ? current : ({ ...current, search: search.trim() }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const patchRow = (key: string, patch: Partial<Row>) => setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  const suggestedCost = (row: Row) => {
    const sourceCost = productMap.get(row.sourceProductUnitId)?.suggestedUnitCost;
    if (!sourceCost || row.sourceQuantity <= 0 || row.resultQuantity <= 0) return undefined;
    return Number(((sourceCost * row.sourceQuantity) / row.resultQuantity).toFixed(2));
  };
  const openCreate = () => { setRows([emptyRow(), emptyRow(), emptyRow()]); setDate(today()); setNote(''); setError(''); setFormOpen(true); };
  const save = async () => {
    const filled = rows.filter((row) => row.sourceProductUnitId || row.resultProductUnitId || row.sourceQuantity || row.resultQuantity);
    if (!filled.length || filled.some((row) => !row.sourceProductUnitId || !row.resultProductUnitId || row.sourceQuantity <= 0 || row.resultQuantity <= 0)) { setError('Lengkapi produk dan jumlah pada setiap baris yang digunakan.'); return; }
    setSaving(true); setError('');
    try {
      const created = await inventoryApi.createTransformation({ transformationDate: date, note: note || undefined, items: filled.map((row) => ({ sourceProductUnitId: row.sourceProductUnitId, sourceQuantity: row.sourceQuantity, resultProductUnitId: row.resultProductUnitId, resultQuantity: row.resultQuantity, appliedUnitCost: row.appliedUnitCost ?? suggestedCost(row), note: row.note || undefined })) });
      setFormOpen(false); setDetail(created); await load();
    } catch (caught) { setError(parseApiError(caught)); } finally { setSaving(false); }
  };

  return <div className="min-h-full bg-slate-50 p-4 sm:p-6">
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-xl font-black sm:text-2xl">Inventory & Warehouse</h1><p className="text-xs text-slate-500 sm:text-sm">Pecah bahan curah menjadi produk repack dalam satu transaksi stok.</p></div><Button onClick={openCreate} className="bg-[#326dc8] text-white"><Plus className="mr-2 h-4 w-4"/>Buat Transformation</Button></div>
    <InventorySectionNav current="TRANSFORMATION" onChange={onNavigate}/>
    <div className="mt-3 grid gap-2 rounded-lg border bg-white p-3 sm:grid-cols-[1fr_170px_170px_auto] sm:items-end"><label className="text-[10px] font-bold uppercase text-slate-500">Cari nomor transformation<input value={search} onChange={(e) => setSearch(e.target.value)} className="mt-1 h-9 w-full rounded-md border px-3 text-xs font-medium normal-case" placeholder="Ketik nomor transformation..."/></label><label className="text-[10px] font-bold uppercase text-slate-500">Dari tanggal<input type="date" value={dateFrom} onChange={(e) => { const value = e.target.value; setDateFrom(value); setPage(1); setFilters((current) => ({ ...current, dateFrom: value })); }} className="mt-1 h-9 w-full rounded-md border px-2 text-xs font-medium"/></label><label className="text-[10px] font-bold uppercase text-slate-500">Sampai tanggal<input type="date" value={dateTo} onChange={(e) => { const value = e.target.value; setDateTo(value); setPage(1); setFilters((current) => ({ ...current, dateTo: value })); }} className="mt-1 h-9 w-full rounded-md border px-2 text-xs font-medium"/></label><InventoryPageSizeSelect value={limit} onChange={(value) => { setLimit(value); setPage(1); }}/></div>
    {error && !formOpen && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</div>}
    <div className="mt-3 grid gap-3 lg:grid-cols-2">{cards.map((card) => <button key={card.transformationId} onClick={async () => { try { setDetail(await inventoryApi.transformationDetail(card.transformationId)); } catch (caught) { setError(parseApiError(caught)); } }} className="rounded-lg border bg-white p-4 text-left shadow-sm hover:shadow-md"><div className="flex justify-between"><b className="text-sm">{card.transformationNumber}</b><span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black text-emerald-700">COMPLETED</span></div><p className="mt-1 text-[11px] text-slate-500">{new Date(card.transformationDate).toLocaleDateString('id-ID')} · {card._count.details} hasil repack</p><p className="mt-2 line-clamp-1 text-xs text-slate-600">{card.note || 'Tanpa catatan'}</p></button>)}</div>
    {meta.totalData > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-xs"><span className="text-slate-500">Menampilkan {cards.length} dari {meta.totalData} transformation · Halaman {meta.currentPage} dari {Math.max(meta.totalPage, 1)}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button><Button size="sm" variant="outline" disabled={page >= meta.totalPage} onClick={() => setPage(page + 1)}>Next</Button></div></div>}

    <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogOverlay className="fixed inset-0 z-50 bg-black/50"/><DialogContent className="z-[60] flex max-h-none max-w-none flex-col overflow-hidden bg-white p-5" style={{ width: '1250px', maxWidth: '96vw', height: '92vh' }}><DialogHeader><DialogTitle>Buat Inventory Transformation</DialogTitle></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">Tanggal<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 h-10 w-full rounded-md border px-3"/></label><label className="text-xs font-bold">Catatan dokumen<input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 h-10 w-full rounded-md border px-3" placeholder="Opsional"/></label></div>{error && <div className="mt-3 min-h-10 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs font-semibold text-rose-700">{error}</div>}<div className="erp-scroll-table mt-3 min-h-0 flex-1 overflow-auto rounded-xl border"><table className="w-full min-w-[1180px] text-xs"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-3 text-left">Bahan</th><th>Unit</th><th>Qty bahan</th><th></th><th>Produk hasil</th><th>Unit</th><th>Qty hasil</th><th>Modal/unit hasil</th><th>Catatan</th><th></th></tr></thead><tbody>{rows.map((row) => { const suggestion = suggestedCost(row); return <tr key={row.key} className="border-t"><td className="p-2"><select value={row.sourceProductUnitId} onChange={(e) => patchRow(row.key, { sourceProductUnitId: e.target.value })} className="h-9 w-full rounded border bg-white px-2"><option value="">Pilih bahan curah...</option>{sources.map((item) => <option key={item.productUnitId} value={item.productUnitId}>{item.productName} · tersedia {item.availableQty} {item.unitName}</option>)}</select></td><td className="bg-slate-100 px-3 text-center font-bold text-slate-500">{productMap.get(row.sourceProductUnitId)?.unitName ?? '-'}</td><td><input type="number" min="0.001" step="0.001" value={row.sourceQuantity || ''} onChange={(e) => patchRow(row.key, { sourceQuantity: Number(e.target.value) })} className="h-9 w-24 rounded border text-center"/></td><td><ArrowRight className="mx-auto h-4 w-4 text-slate-400"/></td><td className="p-2"><select value={row.resultProductUnitId} onChange={(e) => patchRow(row.key, { resultProductUnitId: e.target.value })} className="h-9 w-full rounded border bg-white px-2"><option value="">Pilih produk repack...</option>{results.map((item) => <option key={item.productUnitId} value={item.productUnitId}>{item.productName} · {item.unitName}</option>)}</select></td><td className="bg-slate-100 px-3 text-center font-bold text-slate-500">{productMap.get(row.resultProductUnitId)?.unitName ?? '-'}</td><td><input type="number" min="0.001" step="0.001" value={row.resultQuantity || ''} onChange={(e) => patchRow(row.key, { resultQuantity: Number(e.target.value), appliedUnitCost: undefined })} className="h-9 w-24 rounded border text-center"/></td><td className="p-2"><input type="number" min="0" value={row.appliedUnitCost ?? suggestion ?? ''} onChange={(e) => patchRow(row.key, { appliedUnitCost: e.target.value ? Number(e.target.value) : undefined })} className="h-9 w-32 rounded border px-2"/><p className="mt-1 text-[10px] text-slate-400">Saran {suggestion?.toLocaleString('id-ID') ?? '-'}</p></td><td><input value={row.note} onChange={(e) => patchRow(row.key, { note: e.target.value })} className="h-9 w-full rounded border px-2" placeholder="Opsional"/></td><td><button onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))} className="p-2 text-rose-500"><Trash2 className="h-4 w-4"/></button></td></tr>; })}</tbody></table></div><div className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:justify-between"><Button variant="outline" onClick={() => setRows((current) => [...current, emptyRow()])}><Plus className="mr-2 h-4 w-4"/>Tambah Baris</Button><div className="flex gap-2"><Button variant="outline" onClick={() => setFormOpen(false)}>Batal</Button><Button disabled={saving} onClick={() => void save()} className="bg-emerald-600 text-white">{saving && <RefreshCw className="mr-2 h-4 w-4 animate-spin"/>}Proses Sekarang</Button></div></div></DialogContent></Dialog>

    <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}><DialogOverlay className="fixed inset-0 z-50 bg-black/50"/><DialogContent className="z-[60] flex max-h-none max-w-none flex-col overflow-hidden bg-white p-6" style={{ width: '1050px', maxWidth: '95vw', height: '90vh' }}><DialogHeader><DialogTitle>{detail?.transformationNumber}</DialogTitle></DialogHeader>{detail && <><div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm md:grid-cols-4"><div>Status<br/><b>COMPLETED</b></div><div>Tanggal<br/><b>{new Date(detail.transformationDate).toLocaleDateString('id-ID')}</b></div><div>Pembuat<br/><b>{detail.createdByUser?.fullName ?? '-'}</b></div><div>Hasil repack<br/><b>{detail.details.length}</b></div></div><div className="erp-scroll-table mt-3 min-h-0 flex-1 overflow-auto rounded-xl border"><table className="w-full min-w-[820px] text-sm"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-3">Bahan</th><th>Jumlah bahan</th><th>Produk hasil</th><th>Jumlah hasil</th><th>Total modal bahan</th><th>Modal hasil/unit</th></tr></thead><tbody>{detail.details.map((item) => <tr key={item.transformationDetailId} className="border-t text-center"><td className="p-3 text-left font-bold">{item.sourceProductName}</td><td>{item.sourceQuantity} {item.sourceUnitName}</td><td className="font-bold">{item.resultProductName}</td><td>{item.resultQuantity} {item.resultUnitName}</td><td>{item.sourceCostTotal.toLocaleString('id-ID')}</td><td>{item.appliedUnitCost.toLocaleString('id-ID')} / {item.resultUnitName}</td></tr>)}</tbody></table></div></>}</DialogContent></Dialog>
  </div>;
}
