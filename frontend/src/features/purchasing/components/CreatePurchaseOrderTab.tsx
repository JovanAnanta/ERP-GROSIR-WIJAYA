import { useState, useEffect, useCallback } from "react";
import { purchasingApi, type SupplierDropdownOption, type SupplierCatalogItem, type SupplierProductOption, type ProductLookupOption } from "../purchasing.api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogOverlay } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Trash2, Save, FileCheck, AlertTriangle, FileText, Download, CheckSquare, Plus } from "lucide-react";
import { parseApiError } from "@/utils/error";

interface POItemForm {
  rowId: string; // Kunci unik agar UI React tidak bingung saat baris dihapus
  productId: string;
  productUnitId: string;
  productName: string;
  unitName: string;
  quantity: number;
  availableQty: number; // Stok Gudang
  note: string;
}

// Helper untuk menciptakan baris kosong yang unik
const createEmptyRow = (): POItemForm => ({
  rowId: crypto.randomUUID(),
  productId: "", productUnitId: "", productName: "", unitName: "", quantity: 1, availableQty: 0, note: ""
});

interface Props {
  editingOrderId?: string | null;
  onSuccess: () => void;
  onCancelEdit?: () => void;
}

export default function CreatePurchaseOrderTab({ editingOrderId, onSuccess, onCancelEdit }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [suppliers, setSuppliers] = useState<SupplierDropdownOption[]>([]);
  const [allProducts, setAllProducts] = useState<ProductLookupOption[]>([]);
  
  const [supplierId, setSupplierId] = useState<string>(""); 
  const [expectedDate, setExpectedDate] = useState<string>("");
  const [note, setNote] = useState<string>("");
  
  // INISIALISASI 7 BARIS KOSONG (SAP GRID STYLE)
  const [items, setItems] = useState<POItemForm[]>(Array.from({ length: 7 }, () => createEmptyRow()));

  // Dialog State
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [catalogType, setCatalogType] = useState<'MASTER'|'HISTORY'>('MASTER');
  const [catalogItems, setCatalogItems] = useState<(SupplierCatalogItem | SupplierProductOption)[]>([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);

  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, 100);
  }, []);

  const loadInitialData = useCallback(() => {
    purchasingApi.getSuppliers().then(setSuppliers).catch((err: unknown) => showError(parseApiError(err as Error)));
    purchasingApi.getProducts().then(setAllProducts).catch(console.error);
  }, [showError]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (!editingOrderId || allProducts.length === 0) return;
    let isMounted = true;

    const loadOrderForEdit = async () => {
      setIsLoadingEdit(true);
      setErrorMsg(null);
      try {
        const order = await purchasingApi.getOrderDetail(editingOrderId);
        if (!['DRAFT', 'READY'].includes(order.status)) {
          throw new Error('Purchase Order yang sudah selesai atau dibatalkan tidak dapat diedit.');
        }
        const loadedItems: POItemForm[] = order.details.map((detail) => {
          const product = allProducts.find((item) => item.productId === detail.productId);
          const unit = product?.units.find((item) => item.productUnitId === detail.productUnitId);
          return {
            rowId: crypto.randomUUID(),
            productId: detail.productId,
            productUnitId: detail.productUnitId,
            productName: detail.productName,
            unitName: detail.unitName,
            quantity: detail.quantity,
            availableQty: unit?.availableQty ?? 0,
            note: detail.note ?? '',
          };
        });
        while (loadedItems.length < 7) loadedItems.push(createEmptyRow());
        if (isMounted) {
          setSupplierId(order.supplierId);
          setExpectedDate(order.expectedDate?.slice(0, 10) ?? '');
          setNote(order.note ?? '');
          setItems(loadedItems);
        }
      } catch (error: unknown) {
        if (isMounted) showError(parseApiError(error));
      } finally {
        if (isMounted) setIsLoadingEdit(false);
      }
    };

    void loadOrderForEdit();
    return () => { isMounted = false; };
  }, [allProducts, editingOrderId, showError]);

  const handleSupplierChange = (val: string | null) => {
    const safeVal = val || "";
    if (!safeVal || safeVal === supplierId) return; // Mencegah reset jika supplier yang sama diklik
    setSupplierId(safeVal);
    // Reset form item kembali menjadi 7 baris kosong yang bersih
    setItems(Array.from({ length: 7 }, () => createEmptyRow())); 
  };

  const getStock = (puId: string) => {
    for (const p of allProducts) {
      const u = p.units.find(un => un.productUnitId === puId);
      if (u) return u.availableQty;
    }
    return 0;
  };

  const openCatalog = async (type: 'MASTER' | 'HISTORY') => {
    if (!supplierId) return showError("Pilih Supplier terlebih dahulu.");
    try {
      setErrorMsg(null); 
      setCatalogItems([]); // SOLUSI CRASH: Kosongkan sebelum fetch data baru
      setIsCatalogOpen(true);

      const data = type === 'MASTER' 
        ? await purchasingApi.getSupplierCatalog(supplierId)
        : await purchasingApi.getSupplierHistory(supplierId);
      
      setCatalogType(type);
      setCatalogItems(data);
      setSelectedUnitIds([]);
    } catch {
      showError("Gagal memuat data dari server.");
      setIsCatalogOpen(false);
    }
  };

  const handleSelectAll = () => {
    let allIds: string[] = [];
    if (catalogType === 'MASTER') {
      (catalogItems as SupplierCatalogItem[]).forEach(p => p.units.forEach(u => allIds.push(u.productUnitId)));
    } else {
      allIds = (catalogItems as SupplierProductOption[]).map(p => p.productUnitId);
    }
    setSelectedUnitIds(allIds);
  };

  const saveCatalogSelection = () => {
    const newItems: POItemForm[] = [];
    selectedUnitIds.forEach(unitId => {
      let pId = ""; let pName = ""; let uName = "";
      
      if (catalogType === 'MASTER') {
        const cat = catalogItems as SupplierCatalogItem[];
        cat.forEach(p => p.units.forEach(u => {
          if (u.productUnitId === unitId) { pId = p.productId; pName = p.productName; uName = u.unitName; }
        }));
      } else {
        const hist = catalogItems as SupplierProductOption[];
        const h = hist.find(p => p.productUnitId === unitId);
        if (h) { pId = h.productId; pName = h.productName; uName = h.unitName; }
      }

      if (unitId && pName && !items.some(existing => existing.productUnitId === unitId)) {
        newItems.push({ rowId: crypto.randomUUID(), productId: pId, productUnitId: unitId, productName: pName, unitName: uName, quantity: 1, availableQty: getStock(unitId), note: "" });
      }
    });

    const currentItems = [...items];
    let emptyIndex = 0;

    // Timpa baris yang masih kosong, sisa baris baru ditambahkan ke bawah
    newItems.forEach(newItem => {
      while (emptyIndex < currentItems.length && currentItems[emptyIndex].productId !== "") {
        emptyIndex++;
      }
      if (emptyIndex < currentItems.length) {
        currentItems[emptyIndex] = newItem;
      } else {
        currentItems.push(newItem);
      }
    });

    setItems(currentItems);
    setIsCatalogOpen(false);
  };

  const addItemManual = () => {
    setItems([...items, createEmptyRow()]);
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    // Pertahankan minimal 7 baris di layar
    while (newItems.length < 7) {
      newItems.push(createEmptyRow());
    }
    setItems(newItems);
  };
  
  const updateItem = (index: number, field: keyof POItemForm, value: string | number) => {
    const newItems = [...items];
    (newItems[index] as Record<keyof POItemForm, string | number>)[field] = value;
    setItems(newItems);
  };

  const handleProductChange = (index: number, pId: string | null) => {
    const safeId = pId || "";
    if (!safeId) return;
    const prod = allProducts.find(p => p.productId === safeId);
    if (!prod) return;
    const newItems = [...items];
    newItems[index] = { ...newItems[index], productId: prod.productId, productName: prod.productName, productUnitId: "", unitName: "", availableQty: 0 };
    setItems(newItems);
  };

  const handleUnitChange = (index: number, puId: string | null) => {
    const safeId = puId || "";
    if (!safeId) return;
    const item = items[index];
    const prod = allProducts.find(p => p.productId === item.productId);
    if (!prod) return;
    const unit = prod.units.find(u => u.productUnitId === safeId);
    if (!unit) return;

    const newItems = [...items];
    newItems[index] = { ...newItems[index], productUnitId: unit.productUnitId, unitName: unit.unitName, availableQty: unit.availableQty };
    setItems(newItems);
  };

  const validItemsCount = items.filter(i => i.productId !== "").length;

  const resetForm = () => {
    setSupplierId("");
    setExpectedDate("");
    setNote("");
    setItems(Array.from({ length: 7 }, () => createEmptyRow()));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    loadInitialData(); // Auto-refresh lookup data
  };

  const handleSubmit = async (status: 'DRAFT' | 'READY') => {
    if (isSubmitting) return;

    const validItemsToSubmit = items.filter(i => i.productId !== "");

    // VALIDASI KETAT DAN MENGGUNAKAN Auto-Scroll showError()
    if (!supplierId) return showError("Pilih Supplier terlebih dahulu.");
    if (validItemsToSubmit.length === 0) return showError("Minimal 1 produk harus dipilih.");
    if (validItemsToSubmit.some(i => !i.productUnitId)) return showError("Mohon lengkapi Satuan (Unit) barang pada baris yang telah dipilih.");

    setIsSubmitting(true); setErrorMsg(null);
    try {
      const payload = {
        supplierId, expectedDate: expectedDate || undefined, note, status,
        items: validItemsToSubmit.map(i => ({ productUnitId: i.productUnitId, quantity: i.quantity, note: i.note }))
      };
      if (editingOrderId) {
        await purchasingApi.updateOrder(editingOrderId, payload);
      } else {
        await purchasingApi.createOrder(payload);
      }
      resetForm(); // KEMBALIKAN KE SEMULA JIKA SUKSES
      onSuccess(); 
    } catch (err: unknown) {
      showError(parseApiError(err as Error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-full overflow-y-auto custom-scrollbar">
      <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3 shrink-0">
        <FileCheck className="w-5 h-5 text-amber-500"/>
        <h2 className="text-base font-black text-slate-800 uppercase tracking-wide">{editingOrderId ? 'Edit Purchase Order (PO)' : 'Buat Purchase Order (PO) Baru'}</h2>
      </div>

      {isLoadingEdit && <div className="mb-4 p-3 bg-blue-50 text-blue-700 text-sm font-bold border border-blue-200 rounded flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Memuat seluruh data Purchase Order...</div>}

      {errorMsg && (
        <div className="mb-4 p-3 bg-rose-50 text-rose-700 text-sm font-bold border border-rose-200 rounded flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-5 h-5"/> {errorMsg}
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 bg-slate-50 p-4 rounded-lg border border-slate-200 shrink-0">
        <div className="col-span-1 md:col-span-2">
          <Label className="font-bold text-slate-600 text-[10px] uppercase">Supplier (Dari Database) *</Label>
          <Select value={supplierId || null} onValueChange={handleSupplierChange}>
            <SelectTrigger className="bg-white font-bold h-8 text-xs border-slate-300">
              <SelectValue placeholder="-- Pilih Supplier --">
                {suppliers.find(s => s.supplierId === supplierId)?.supplierName}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-white z-50 border border-slate-200 shadow-lg">
              {suppliers.map(s => <SelectItem key={s.supplierId} value={s.supplierId} className="text-xs">{s.supplierName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="font-bold text-slate-600 text-[10px] uppercase">Ekspektasi Tgl Datang</Label>
          <Input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className="font-bold bg-white h-8 text-xs border-slate-300"/>
        </div>
        <div>
          <Label className="font-bold text-slate-600 text-[10px] uppercase">Catatan Order</Label>
          <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Catatan internal..." className="font-medium bg-white h-8 text-xs border-slate-300"/>
        </div>
      </div>

      {/* TABS / HELPER BUTTONS */}
      <div className="mb-2 flex justify-between items-end shrink-0">
        <Label className="font-extrabold text-slate-800 text-sm uppercase">Daftar Barang Pesanan</Label>
        <div className="flex gap-2">
          {editingOrderId && onCancelEdit && <Button variant="outline" onClick={onCancelEdit} disabled={isSubmitting} className="font-bold h-9 text-xs px-5">Batal Edit</Button>}
          <Button onClick={() => openCatalog('HISTORY')} disabled={!supplierId} variant="outline" size="sm" className="h-7 text-[10px] font-bold text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100">
            <Download className="w-3 h-3 mr-1"/> Tarik Histori Beli
          </Button>
          <Button onClick={() => openCatalog('MASTER')} disabled={!supplierId} variant="outline" size="sm" className="h-7 text-[10px] font-bold text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-100">
            <FileText className="w-3 h-3 mr-1"/> Katalog Produk Supplier
          </Button>
          <Button onClick={addItemManual} variant="outline" size="sm" className="h-7 text-[10px] font-bold text-[#326dc8] border-blue-200 bg-blue-50 hover:bg-blue-100">
            <Plus className="w-3 h-3 mr-1"/> Tambah Baris Kosong
          </Button>
        </div>
      </div>

      {/* TABLE GRID ALA SAP */}
      <div className="flex-1 overflow-auto bg-white border border-slate-300 rounded-md mb-4 custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead className="bg-slate-100 sticky top-0 z-10 shadow-sm border-b border-slate-300">
            <tr>
              <th className="p-2 text-[10px] font-bold text-slate-600 uppercase border-r border-slate-300 w-10 text-center">No</th>
              <th className="p-2 text-[10px] font-bold text-slate-600 uppercase border-r border-slate-300 min-w-[250px]">Pilih Produk (Master)</th>
              <th className="p-2 text-[10px] font-bold text-slate-600 uppercase border-r border-slate-300 w-36">Satuan Unit</th>
              <th className="p-2 text-[10px] font-bold text-slate-600 uppercase border-r border-slate-300 w-24 text-center">Stok Gudang</th>
              <th className="p-2 text-[10px] font-bold text-[#00509e] uppercase border-r border-slate-300 w-24 text-center">Qty Pesan</th>
              <th className="p-2 text-[10px] font-bold text-slate-600 uppercase border-r border-slate-300 w-48">Keterangan</th>
              <th className="p-2 w-10 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.rowId} className={`border-b border-slate-200 transition-colors ${item.productId ? 'bg-amber-50/20' : 'bg-white hover:bg-slate-50'}`}>
                <td className="p-1 border-r border-slate-200 text-center text-[10px] font-bold text-slate-400">{index + 1}</td>
                
                {/* KOLOM PRODUK */}
                <td className="p-1 border-r border-slate-200">
                  <Select value={item.productId || null} onValueChange={(val) => handleProductChange(index, val)}>
                    <SelectTrigger className="h-7 text-[11px] font-bold border-none shadow-none focus:ring-1 focus:ring-[#00509e] rounded-sm bg-transparent">
                      <SelectValue placeholder="Pilih Produk...">
                        {allProducts.find(p => p.productId === item.productId)?.productName}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-white z-50 max-h-[250px] border-slate-200 shadow-lg">
                      {allProducts.map(p => <SelectItem key={p.productId} value={p.productId} className="text-xs cursor-pointer">{p.productName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>

                {/* KOLOM SATUAN UNIT */}
                <td className="p-1 border-r border-slate-200">
                  <Select value={item.productUnitId || null} onValueChange={(val) => handleUnitChange(index, val)} disabled={!item.productId}>
                    <SelectTrigger className="h-7 text-[11px] font-bold border-none shadow-none focus:ring-1 focus:ring-[#00509e] rounded-sm bg-transparent">
                      <SelectValue placeholder="Satuan...">
                        {allProducts.find(p => p.productId === item.productId)?.units.find(u => u.productUnitId === item.productUnitId)?.unitName}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-white z-50 border-slate-200 shadow-lg">
                      {allProducts.find(p => p.productId === item.productId)?.units.map(u => (
                        <SelectItem key={u.productUnitId} value={u.productUnitId} className="text-xs cursor-pointer">{u.unitName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>

                {/* KOLOM STOK (READONLY) */}
                <td className="p-1 border-r border-slate-200 bg-slate-50 text-center">
                  <span className={`text-[11px] font-bold ${item.productId ? 'text-slate-700' : 'text-slate-300'}`}>
                    {item.productId ? item.availableQty : '-'}
                  </span>
                </td>

                {/* KOLOM QTY PESAN */}
                <td className="p-1 border-r border-slate-200 bg-blue-50/30">
                  <Input type="number" min="1" disabled={!item.productId} value={item.productId ? item.quantity : ''} onChange={e => updateItem(index, 'quantity', Number(e.target.value))} className="h-7 text-xs font-bold text-center border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#00509e] rounded-sm bg-transparent text-[#00509e] disabled:opacity-50"/>
                </td>

                {/* KOLOM NOTE */}
                <td className="p-1 border-r border-slate-200">
                  <Input disabled={!item.productId} value={item.note || ''} onChange={e => updateItem(index, 'note', e.target.value)} placeholder={item.productId ? "Opsional..." : ""} className="h-7 text-xs border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#00509e] rounded-sm bg-transparent disabled:opacity-50"/>
                </td>

                <td className="p-1 text-center">
                  {item.productId && (
                    <Button variant="ghost" onClick={() => removeItem(index)} className="h-6 w-6 p-0 text-rose-500 hover:bg-rose-100 rounded-sm">
                      <Trash2 className="w-3.5 h-3.5"/>
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FOOTER ACTIONS */}
      <div className="mt-auto pt-3 border-t border-slate-200 flex justify-between items-center bg-white shrink-0">
        <p className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-md">Total Jenis Barang Dipesan: <span className="text-[#326dc8] font-black">{validItemsCount}</span></p>
        <div className="flex gap-2">
          {/* Tombol selalu aktif agar menampilkan validasi error, tidak diam-diam freeze */}
          <Button variant="outline" onClick={() => handleSubmit('DRAFT')} disabled={isSubmitting} className="font-bold h-9 text-xs px-5 border-slate-300 text-slate-700 hover:bg-slate-100">
            Simpan Draft
          </Button>
          <Button onClick={() => handleSubmit('READY')} disabled={isSubmitting} className="bg-amber-600 hover:bg-amber-700 font-bold h-9 text-xs px-6 shadow">
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin"/> : <Save className="w-3.5 h-3.5 mr-2"/>} Simpan PO (Ready)
          </Button>
        </div>
      </div>

      {/* MODAL CATALOG */}
      <Dialog open={isCatalogOpen} onOpenChange={setIsCatalogOpen}>
        <DialogOverlay className="bg-black/40 z-40" />
        <DialogContent className="max-w-xl max-h-[80vh] overflow-hidden flex flex-col p-4 bg-white z-50 shadow-2xl border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase text-slate-800">
              {catalogType === 'MASTER' ? 'Katalog Produk Supplier' : 'Histori Pembelian Supplier'}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto p-1 space-y-3 mt-2 flex-1 custom-scrollbar">
            {catalogItems.length === 0 && <p className="text-center text-xs text-slate-400 py-4">Data tidak ditemukan.</p>}
            
            {catalogType === 'MASTER' 
              ? (catalogItems as SupplierCatalogItem[]).map(p => (
                  <div key={p.productId} className="p-2 border border-slate-100 bg-slate-50 rounded-md">
                    <p className="font-bold text-xs text-slate-800 mb-2">{p.productName}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {p.units.map(u => (
                        <label key={u.productUnitId} className="flex items-center gap-2 p-2 border border-slate-200 rounded bg-white cursor-pointer hover:border-[#326dc8] transition-colors">
                          <Checkbox checked={selectedUnitIds.includes(u.productUnitId)} onCheckedChange={(c) => setSelectedUnitIds(c ? [...selectedUnitIds, u.productUnitId] : selectedUnitIds.filter(id => id !== u.productUnitId))} />
                          <span className="text-[10px] font-bold">{u.unitName}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))
              : (catalogItems as SupplierProductOption[]).map(p => (
                  <label key={p.productUnitId} className="flex items-center justify-between p-2.5 border border-slate-200 rounded bg-white cursor-pointer hover:border-[#326dc8] transition-colors">
                    <div className="flex items-center gap-2.5">
                      <Checkbox checked={selectedUnitIds.includes(p.productUnitId)} onCheckedChange={(c) => setSelectedUnitIds(c ? [...selectedUnitIds, p.productUnitId] : selectedUnitIds.filter(id => id !== p.productUnitId))} />
                      <span className="text-xs font-bold text-slate-800">{p.productName}</span>
                    </div>
                    <span className="text-[10px] font-extrabold text-[#326dc8] uppercase bg-blue-50 px-2 py-0.5 rounded">{p.unitName}</span>
                  </label>
                ))
            }
          </div>
          <DialogFooter className="mt-2 flex justify-between items-center w-full">
            <Button variant="outline" onClick={handleSelectAll} className="h-8 text-xs font-bold text-[#326dc8] border-[#326dc8] hover:bg-blue-50">
              <CheckSquare className="w-3.5 h-3.5 mr-1"/> Pilih Semua
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsCatalogOpen(false)} className="h-8 text-xs border-slate-300">Batal</Button>
              <Button onClick={saveCatalogSelection} className="h-8 text-xs bg-[#326dc8] hover:bg-blue-700 text-white font-bold px-5">
                Masukkan Terpilih ({selectedUnitIds.length})
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
