import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Database, History, Loader2, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasPermission, useAuthStore } from "@/store/authStore";
import { openingBalanceApi, type InventoryOpeningCatalogProduct, type InventoryOpeningLine } from "./openingBalance.api";

type RowInput = { unitId: string; quantity: string; unitCost: string; guestPrice: string };
function today() { return new Date().toISOString().slice(0, 10); }
function numeric(value: string) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : 0; }
function money(value: number) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value || 0); }
function errorMessage(reason: unknown) { const value = reason as { response?: { data?: { message?: string | string[] } }; message?: string }; const message=value.response?.data?.message; return Array.isArray(message)?message.join(" "):message||value.message||"Proses gagal."; }

export default function InventoryOpeningBalancePanel() {
  const user = useAuthStore((state) => state.user);
  const canCreate = hasPermission(user, "FIFO_OPENING_BALANCE_CREATE");
  const canPost = hasPermission(user, "FIFO_OPENING_BALANCE_POST");
  const [products, setProducts] = useState<InventoryOpeningCatalogProduct[]>([]);
  const [rows, setRows] = useState<Record<string, RowInput>>({});
  const [draftId, setDraftId] = useState<string | null>(null);
  const [documentNumber, setDocumentNumber] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number | "ALL">(50);
  const [total, setTotal] = useState(0);
  const [totalPage, setTotalPage] = useState(1);
  const [historyProducts, setHistoryProducts] = useState<InventoryOpeningCatalogProduct[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPage, setHistoryTotalPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState("Belum ada perubahan");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const mounted = useRef(true);

  useEffect(() => { const timer=window.setTimeout(()=>{setQuery(search.trim());setPage(1)},300); return()=>window.clearTimeout(timer); },[search]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const result = await openingBalanceApi.inventoryCatalog({ page, limit, search: query || undefined, scope: "ELIGIBLE" });
      if (!mounted.current) return;
      setProducts(result.data); setTotal(result.meta.totalData); setTotalPage(result.meta.totalPage);
    } catch (reason) { if (mounted.current) setError(errorMessage(reason)); }
    finally { if (mounted.current) setLoading(false); }
  }, [page, limit, query]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const result = await openingBalanceApi.inventoryCatalog({ page: historyPage, limit: 20, search: query || undefined, scope: "HISTORY" });
      if (!mounted.current) return;
      setHistoryProducts(result.data);
      setHistoryTotal(result.meta.totalData);
      setHistoryTotalPage(result.meta.totalPage);
    } catch (reason) {
      if (mounted.current) setError(errorMessage(reason));
    } finally {
      if (mounted.current) setHistoryLoading(false);
    }
  }, [historyPage, query]);

  useEffect(() => { mounted.current=true; void openingBalanceApi.inventoryDraft().then((draft)=>{
    if (!draft || !mounted.current) return;
    setDraftId(draft.inventoryOpeningBalanceId); setDocumentNumber(draft.openingBalanceNumber); setDate(draft.openingBalanceDate.slice(0,10)); setNote(draft.note??"");
    setRows(Object.fromEntries(draft.details.map((line)=>[line.productId,{unitId:line.selectedProductUnitId,quantity:String(line.inputQuantity||""),unitCost:String(line.inputUnitCost||""),guestPrice:line.guestSuggestedPrice===undefined||line.guestSuggestedPrice===null?"":String(line.guestSuggestedPrice)}])));
    setSaveState("Draft dipulihkan");
  }).catch((reason)=>setError(errorMessage(reason))); return()=>{mounted.current=false}; },[]); // restore once
  useEffect(() => { const timer=window.setTimeout(()=>void loadCatalog(),0); return()=>window.clearTimeout(timer); }, [loadCatalog]);
  useEffect(() => { const timer=window.setTimeout(()=>void loadHistory(),0); return()=>window.clearTimeout(timer); }, [loadHistory]);

  const update = (product: InventoryOpeningCatalogProduct, field: keyof RowInput, value: string) => {
    const defaultUnit = product.units[0]?.productUnitId ?? "";
    setRows((current)=>({ ...current, [product.productId]: { unitId: current[product.productId]?.unitId || defaultUnit, quantity: current[product.productId]?.quantity || "", unitCost: current[product.productId]?.unitCost || "", guestPrice: current[product.productId]?.guestPrice || "", [field]: value } }));
    setDirty(true); setSaveState("Menyimpan perubahan..."); setSuccess("");
  };

  const payloadLines = useMemo<InventoryOpeningLine[]>(()=>Object.entries(rows).flatMap(([productId,row],index)=>{
    const quantity=numeric(row.quantity), unitCost=numeric(row.unitCost);
    const hasGuest=row.guestPrice.trim()!=="";
    if (quantity<=0 && !hasGuest) return [];
    return [{ lineNumber:index+1, productId, selectedProductUnitId:row.unitId, inputQuantity:quantity, inputUnitCost:unitCost, ...(hasGuest?{guestSuggestedPrice:numeric(row.guestPrice)}:{}) }];
  }),[rows]);

  const saveDraft = useCallback(async () => {
    if (!canCreate || !dirty || !payloadLines.length) return null;
    setSaving(true); setError("");
    try { const draft=await openingBalanceApi.saveInventoryDraft({openingBalanceDate:date,note:note||undefined,lines:payloadLines}); setDraftId(draft.inventoryOpeningBalanceId); setDocumentNumber(draft.openingBalanceNumber); setDirty(false); setSaveState(`Tersimpan ${new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}`); return draft; }
    catch(reason){setSaveState("Gagal tersimpan");setError(errorMessage(reason));return null} finally{setSaving(false)}
  },[canCreate,date,dirty,note,payloadLines]);
  useEffect(()=>{if(!dirty||!payloadLines.length)return;const timer=window.setTimeout(()=>void saveDraft(),1200);return()=>window.clearTimeout(timer)},[dirty,payloadLines,saveDraft]);

  const complete = async () => {
    setError("");
    const stockLines=payloadLines.filter((line)=>line.inputQuantity>0);
    if (!stockLines.length && !payloadLines.some((line)=>line.guestSuggestedPrice!==undefined)) return setError("Isi minimal satu qty awal atau harga jual guest.");
    if (stockLines.some((line)=>line.inputUnitCost<0)) return setError("Modal tidak boleh negatif.");
    if (!window.confirm(`Tetapkan ${stockLines.length} produk sebagai saldo awal? Stok dan FIFO yang sudah diposting tidak dapat diedit langsung.`)) return;
    setSaving(true);
    try {
      let id=draftId;
      const draft=await openingBalanceApi.saveInventoryDraft({openingBalanceDate:date,note:note||undefined,lines:payloadLines}); id=draft.inventoryOpeningBalanceId;
      await openingBalanceApi.completeInventory(id);
      setRows({}); setDraftId(null); setDocumentNumber(null); setDirty(false); setSuccess("Saldo awal persediaan berhasil ditetapkan. Stok, FIFO, harga guest, dan jurnal sudah diperbarui."); setSaveState("Selesai"); await Promise.all([loadCatalog(), loadHistory()]);
    } catch(reason){setError(errorMessage(reason))} finally{setSaving(false)}
  };

  const enteredCount=payloadLines.length;
  const inventoryValue=payloadLines.reduce((sum,line)=>sum+line.inputQuantity*line.inputUnitCost,0);
  return <div className="space-y-3">
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><Database className="h-5 w-5 text-blue-700"/><h2 className="text-base font-black">Saldo Awal Persediaan</h2>{documentNumber&&<span className="rounded bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">{documentNumber}</span>}</div><p className="mt-1 text-[11px] text-slate-500">Input tersimpan otomatis sebagai draft. Qty kosong tidak membentuk FIFO; harga guest tetap dapat diperbarui.</p></div>
        <label className="text-[11px] font-bold text-slate-600">Tanggal<input type="date" value={date} onChange={(e)=>{setDate(e.target.value);setDirty(true)}} className="mt-1 block h-9 rounded-lg border px-2 text-xs"/></label>
        <label className="min-w-52 text-[11px] font-bold text-slate-600">Catatan<input value={note} onChange={(e)=>{setNote(e.target.value);setDirty(true)}} placeholder="Opsional" className="mt-1 block h-9 w-full rounded-lg border px-2 text-xs"/></label>
      </div>
    </div>
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Cari produk..." className="h-9 w-full rounded-lg border pl-9 pr-3 text-xs"/></div><select value={String(limit)} onChange={(e)=>{setLimit(e.target.value==="ALL"?"ALL":Number(e.target.value));setPage(1)}} className="h-9 rounded-lg border bg-white px-2 text-xs"><option value="20">20</option><option value="30">30</option><option value="50">50</option><option value="100">100</option><option value="ALL">Semua ({total})</option></select><span className="text-[10px] font-bold text-slate-500">{saving?<><Loader2 className="mr-1 inline h-3 w-3 animate-spin"/>Menyimpan</>:saveState}</span></div>
    </div>
    <div className="min-h-10">{error&&<div className="rounded-lg bg-red-50 p-2.5 text-xs font-bold text-red-700">{error}</div>}{success&&<div className="rounded-lg bg-emerald-50 p-2.5 text-xs font-bold text-emerald-700">{success}</div>}</div>
    <div className="overflow-x-auto rounded-xl border bg-white shadow-sm"><table className="w-full min-w-[980px] text-[11px]"><thead className="bg-slate-100 text-slate-600"><tr><th className="w-12 p-2 text-center">No.</th><th className="p-2 text-left">Produk</th><th className="w-28 p-2">Stok Saat Ini</th><th className="w-28 p-2">Unit Input</th><th className="w-24 p-2">Qty Awal</th><th className="w-32 p-2">Modal / Unit</th><th className="w-32 p-2">Harga Guest</th><th className="w-36 p-2 text-right">Hasil FIFO</th></tr></thead><tbody>
      {loading&&<tr><td colSpan={8} className="p-8 text-center text-slate-500">Memuat produk...</td></tr>}
      {!loading&&products.map((product,index)=>{const row=rows[product.productId];const selected=product.units.find((unit)=>unit.productUnitId===(row?.unitId||product.units[0]?.productUnitId));const quantity=numeric(row?.quantity||"");const cost=numeric(row?.unitCost||"");const parent=product.units.find((unit)=>unit.isParent);const parentQty=selected&&parent?quantity*selected.conversionFactor/parent.conversionFactor:0;return <tr key={product.productId} className="border-t hover:bg-blue-50/30"><td className="p-2 text-center font-bold text-slate-400">{limit==="ALL"?index+1:(page-1)*Number(limit)+index+1}</td><td className="p-2"><strong className="block text-xs text-slate-800">{product.productName}</strong><span className="text-[10px] text-slate-500">{product.categoryName}{product.brandName?` · ${product.brandName}`:""}</span></td><td className="p-2 text-center font-bold">{product.currentStock} {product.parentUnitName||"-"}</td><td className="p-2"><select value={row?.unitId||product.units[0]?.productUnitId||""} onChange={(e)=>update(product,"unitId",e.target.value)} className="h-8 w-full rounded border bg-white px-1.5 text-[11px]">{product.units.map((unit)=><option key={unit.productUnitId} value={unit.productUnitId}>{unit.unitName}</option>)}</select></td><td className="p-2"><input data-opening-qty={product.productId} inputMode="decimal" value={row?.quantity||""} onChange={(e)=>update(product,"quantity",e.target.value.replace(/[^0-9.]/g,""))} placeholder="0" className="h-8 w-full rounded border px-2 text-right text-[11px]"/></td><td className="p-2"><input inputMode="decimal" value={row?.unitCost||""} onChange={(e)=>update(product,"unitCost",e.target.value.replace(/[^0-9.]/g,""))} placeholder="0" className="h-8 w-full rounded border px-2 text-right text-[11px]"/><span className="block pt-0.5 text-right text-[9px] text-slate-400">Total {money(quantity*cost)}</span></td><td className="p-2"><input inputMode="decimal" value={row?.guestPrice??(selected?.guestSuggestedPrice==null?"":String(selected.guestSuggestedPrice))} onChange={(e)=>update(product,"guestPrice",e.target.value.replace(/[^0-9.]/g,""))} onKeyDown={(e)=>{if(e.key!=="Enter")return;e.preventDefault();const next=products[index+1];if(next)(document.querySelector(`[data-opening-qty="${next.productId}"]`) as HTMLInputElement|null)?.focus()}} placeholder="Tidak diubah" className="h-8 w-full rounded border px-2 text-right text-[11px]"/></td><td className="p-2 text-right"><strong>{parentQty.toLocaleString("id-ID",{maximumFractionDigits:3})} {product.parentUnitName||"-"}</strong><span className="block text-[9px] text-slate-400">{parentQty>0?`${money(quantity*cost/parentQty)} / ${product.parentUnitName}`:"Tidak dibuat"}</span></td></tr>})}
      {!loading&&!products.length&&<tr><td colSpan={8} className="p-8 text-center text-slate-500">Produk tidak ditemukan.</td></tr>}
    </tbody></table></div>
    {limit!=="ALL"&&<div className="flex items-center justify-between rounded-xl border bg-white p-2 text-xs"><span>Halaman {page} dari {totalPage} · {total} produk</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page<=1} onClick={()=>setPage((v)=>v-1)}>Sebelumnya</Button><Button size="sm" variant="outline" disabled={page>=totalPage} onClick={()=>setPage((v)=>v+1)}>Berikutnya</Button></div></div>}
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center gap-2"><History className="h-4 w-4 text-slate-500"/><div><h3 className="text-xs font-black text-slate-700">Produk yang Sudah Memiliki Riwayat</h3><p className="text-[10px] text-slate-500">Hanya referensi. Saldo produk ini dikelola melalui transaksi atau Stock Adjustment.</p></div></div>
      <div className="overflow-x-auto rounded-lg border bg-white"><table className="w-full min-w-[560px] text-[11px]"><thead className="bg-slate-100 text-slate-600"><tr><th className="w-12 p-2">No.</th><th className="p-2 text-left">Produk</th><th className="w-40 p-2">Stok Saat Ini</th><th className="w-32 p-2">Keterangan</th></tr></thead><tbody>
        {historyLoading&&<tr><td colSpan={4} className="p-5 text-center text-slate-500">Memuat riwayat...</td></tr>}
        {!historyLoading&&historyProducts.map((product,index)=><tr key={product.productId} className="border-t text-slate-600"><td className="p-2 text-center">{(historyPage-1)*20+index+1}</td><td className="p-2"><strong className="text-slate-700">{product.productName}</strong><span className="ml-2 text-[10px]">{product.categoryName}</span></td><td className="p-2 text-center font-bold">{product.currentStock} {product.parentUnitName||"-"}</td><td className="p-2 text-center"><span className="rounded bg-slate-100 px-2 py-1 text-[9px] font-bold">Sudah berjalan</span></td></tr>)}
        {!historyLoading&&!historyProducts.length&&<tr><td colSpan={4} className="p-5 text-center text-slate-500">Belum ada produk berhistori.</td></tr>}
      </tbody></table></div>
      {historyTotalPage>1&&<div className="mt-2 flex items-center justify-between text-[10px]"><span>Halaman {historyPage} dari {historyTotalPage} · {historyTotal} produk</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={historyPage<=1} onClick={()=>setHistoryPage((value)=>value-1)}>Sebelumnya</Button><Button size="sm" variant="outline" disabled={historyPage>=historyTotalPage} onClick={()=>setHistoryPage((value)=>value+1)}>Berikutnya</Button></div></div>}
    </section>
    <div className="sticky bottom-2 z-10 flex flex-col gap-2 rounded-xl border bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center"><div className="flex-1 text-xs"><strong>{enteredCount} produk terisi</strong><span className="ml-3 text-slate-500">Nilai persediaan {money(inventoryValue)}</span></div>{canCreate&&<Button variant="outline" disabled={saving||!payloadLines.length} onClick={()=>void saveDraft()}><Save/>Simpan Draft</Button>}{canPost&&<Button disabled={saving||!payloadLines.length} onClick={()=>void complete()} className="bg-emerald-600 text-white"><CheckCircle2/>Tetapkan Saldo Awal</Button>}</div>
  </div>;
}
