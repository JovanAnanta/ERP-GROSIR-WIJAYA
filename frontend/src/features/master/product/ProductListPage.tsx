import { useState, useEffect } from "react";
import { productApi, type Product, type ProductQueryParams, type ProductMeta, type CreateProductPayload } from "../product.api";
import { parseApiError } from "@/utils/error";
import { useAuthStore } from "@/store/authStore";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Edit2, Ban, CheckCircle2, AlertTriangle, Loader2, Star, Package, EyeOff } from "lucide-react";

interface FormUnit {
  key: string;
  productUnitId?: string;
  unitName: string;
  conversionFactor: string;
  displayOrder: string;
  isParent: boolean;
  isActive: boolean;
}

export default function ProductListPage() {
  const { user } = useAuthStore();
  const hasEditAccess = user?.roleId === '1' || user?.roleId === '2';

  const [products, setProducts] = useState<Product[]>([]);
  const [meta, setMeta] = useState<ProductMeta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<ProductQueryParams>({ page: 1, limit: 20, search: "", status: "ALL", sortBy: "productName", sortDir: "asc" });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [formData, setFormData] = useState({ productName: "", categoryName: "", brandName: "", minimumInventoryQty: "0" });
  const [formUnits, setFormUnits] = useState<FormUnit[]>([]);

  const [statusAlert, setStatusAlert] = useState<{ isOpen: boolean; type: 'INACTIVATE' | 'REACTIVATE'; product: Product | null }>({ isOpen: false, type: 'INACTIVATE', product: null });
  const [lookupOptions, setLookupOptions] = useState<{ categories: string[]; brands: string[] }>({ categories: [], brands: [] });

  useEffect(() => { productApi.getLookupOptions().then(setLookupOptions).catch(console.error); }, []);
  useEffect(() => { const timeoutId = setTimeout(() => setFilters(prev => ({ ...prev, search: searchInput, page: 1 })), 400); return () => clearTimeout(timeoutId); }, [searchInput]);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setIsLoading(true); setErrorMsg(null);
      try {
        const response = await productApi.getAll(filters);
        if (isMounted) { setProducts(response.data); setMeta(response.meta); }
      } catch (error: unknown) { if (isMounted) setErrorMsg(parseApiError(error)); } 
      finally { if (isMounted) setIsLoading(false); }
    };
    void loadData();
    return () => { isMounted = false; };
  }, [filters]);

  const openCreateForm = () => {
    setSelectedProduct(null);
    setFormData({ productName: "", categoryName: "", brandName: "", minimumInventoryQty: "0" });
    setFormUnits([{ key: Date.now().toString(), unitName: "", conversionFactor: "1", displayOrder: "100", isParent: true, isActive: true }]);
    setFormError(null); setIsFormOpen(true);
  };

  const openEditForm = (p: Product) => {
    setSelectedProduct(p);
    setFormData({ productName: p.productName, categoryName: p.categoryName, brandName: p.brandName || "", minimumInventoryQty: p.minimumInventoryQty.toString() });
    const sortedUnits = [...p.units].sort((a, b) => a.displayOrder - b.displayOrder);
    setFormUnits(sortedUnits.map(u => ({
      key: u.productUnitId || Math.random().toString(),
      productUnitId: u.productUnitId,
      unitName: u.unitName,
      conversionFactor: u.conversionFactor.toString(),
      displayOrder: u.displayOrder.toString(),
      isParent: u.isParent,
      isActive: u.isActive
    })));
    setFormError(null); setIsFormOpen(true);
  };

  const addUnitRow = () => {
    const nextOrder = formUnits.length > 0 ? Math.max(...formUnits.map(u => Number(u.displayOrder) || 0)) + 100 : 100;
    setFormUnits([...formUnits, { key: Date.now().toString(), unitName: "", conversionFactor: "", displayOrder: nextOrder.toString(), isParent: false, isActive: true }]);
  };
  
  const toggleUnitStatus = (key: string) => {
    const unitTarget = formUnits.find(u => u.key === key);
    if (!unitTarget) return;
    if (unitTarget.isParent) return; // Parent Unit 100% aman

    if (!unitTarget.productUnitId) {
      // Jika ini unit baru yang belum disimpan ke DB, langsung hapus dari array saja
      setFormUnits(formUnits.filter(u => u.key !== key));
    } else {
      // Jika sudah ada di DB, Toggle isActive (Soft Delete)
      setFormUnits(formUnits.map(u => u.key === key ? { ...u, isActive: !u.isActive } : u));
    }
  };

  const setParentUnit = (key: string) => {
    if (selectedProduct) return; 
    setFormUnits(formUnits.map(u => ({ ...u, isParent: u.key === key, conversionFactor: u.key === key ? "1" : u.conversionFactor })));
  };

  const updateUnitField = (key: string, field: keyof FormUnit, value: string | boolean) => {
    setFormUnits(formUnits.map(u => u.key === key ? { ...u, [field]: value } : u));
  };

  const executeSave = async () => {
    if (!formData.productName.trim() || !formData.categoryName.trim()) { setFormError("Nama Produk dan Kategori wajib diisi."); return; }
    if (formUnits.length === 0) { setFormError("Produk wajib memiliki minimal 1 satuan dasar."); return; }
    
    for (const u of formUnits) {
      if (!u.unitName.trim()) { setFormError("Nama satuan tidak boleh kosong."); return; }
      if (Number(u.conversionFactor) <= 0) { setFormError("Faktor konversi harus lebih dari 0."); return; }
      if (Number(u.displayOrder) <= 0) { setFormError("Urutan Tampil harus berupa angka positif."); return; }
    }

    setIsSubmitting(true); setFormError(null);

    const payloadBase = {
      productName: formData.productName,
      newCategoryName: formData.categoryName,
      newBrandName: formData.brandName || undefined,
      minimumInventoryQty: Number(formData.minimumInventoryQty),
      units: formUnits.map((u) => ({
        productUnitId: u.productUnitId,
        newUnitName: u.unitName.trim(),
        conversionFactor: Number(u.conversionFactor),
        displayOrder: Number(u.displayOrder),
        isParent: u.isParent,
        isActive: u.isActive
      }))
    };

    try {
      if (selectedProduct) await productApi.update(selectedProduct.productId, payloadBase as unknown as Parameters<typeof productApi.update>[1]);
      else await productApi.create(payloadBase as CreateProductPayload);
      
      setIsFormOpen(false); setFilters(prev => ({ ...prev }));
      productApi.getLookupOptions().then(setLookupOptions).catch(console.error);
    } catch (error: unknown) {
      setFormError(parseApiError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeStatusToggle = async () => {
    if (!statusAlert.product) return;
    setIsSubmitting(true);
    try {
      if (statusAlert.type === 'INACTIVATE') await productApi.inactivate(statusAlert.product.productId);
      else await productApi.reactivate(statusAlert.product.productId);
      
      setStatusAlert({ isOpen: false, type: 'INACTIVATE', product: null }); setFilters(prev => ({ ...prev }));
    } catch (error: unknown) {
      setErrorMsg(parseApiError(error)); setStatusAlert({ isOpen: false, type: 'INACTIVATE', product: null });
    } finally { setIsSubmitting(false); }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-full flex flex-col">
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800">Master Produk</h2>
          <p className="text-sm text-slate-500 font-medium">Direktori sentral barang dan relasi multi-satuan hierarkis.</p>
        </div>
        {hasEditAccess && (
          <Button onClick={openCreateForm} className="bg-[#326dc8] hover:bg-[#2858a6] text-white shadow-sm">
            <Plus className="w-4 h-4 mr-2" /> Tambah Produk
          </Button>
        )}
      </div>

      <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 flex-wrap flex-1">
          <div className="relative min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <Input placeholder="Cari nama produk..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="pl-9 pr-9 bg-white border-slate-200 focus-visible:ring-slate-900" />
            {isLoading && <Loader2 className="w-4 h-4 absolute right-3 top-3 text-slate-400 animate-spin" />}
          </div>
          <Select value={filters.status} onValueChange={(val) => setFilters(prev => ({ ...prev, status: val as ProductQueryParams['status'], page: 1 }))}>
            <SelectTrigger className="w-[160px] bg-white border-slate-200 shadow-sm"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent className="bg-white border border-slate-200 shadow-xl z-50">
              <SelectItem value="ALL">Semua Status</SelectItem>
              <SelectItem value="ACTIVE">Aktif</SelectItem>
              <SelectItem value="INACTIVE">Tidak Aktif</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500 font-medium">Tampilkan:</span>
          <Select value={filters.limit?.toString()} onValueChange={(val) => setFilters(prev => ({ ...prev, limit: Number(val), page: 1 }))}>
            <SelectTrigger className="w-[80px] bg-white border-slate-200 shadow-sm"><SelectValue placeholder="20" /></SelectTrigger>
            <SelectContent className="bg-white border border-slate-200 shadow-xl z-50">
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="30">30</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {errorMsg && (<div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm font-medium flex items-center gap-2"><AlertTriangle className="w-5 h-5 shrink-0" /> {errorMsg}</div>)}

      <div className="flex-1 overflow-auto p-6 pt-4">
        <div className="border border-slate-200 rounded-lg overflow-hidden relative">
          <Table>
            <TableHeader className="bg-slate-100">
              <TableRow>
                <TableHead className="font-bold text-slate-700 w-1/3">Nama Produk</TableHead>
                <TableHead className="font-bold text-slate-700">Kategori & Brand</TableHead>
                <TableHead className="font-bold text-slate-700">Stok (Otomatis)</TableHead>
                <TableHead className="font-bold text-slate-700 text-center">Status</TableHead>
                {hasEditAccess && <TableHead className="font-bold text-slate-700 text-center">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody className={`transition-opacity duration-200 ${isLoading ? "opacity-40" : "opacity-100"}`}>
              {products.length === 0 && !isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-12 text-slate-500 font-medium">Tidak ada Produk yang ditemukan.</TableCell></TableRow>
              ) : (
                products.map((p) => (
                  <TableRow key={p.productId} className="hover:bg-slate-50 transition-colors">
                    <TableCell>
                      <div className="font-bold text-slate-800 text-base">{p.productName}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.units.filter(u => u.isActive).map(u => (
                          <span key={u.productUnitId} className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${u.isParent ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>{u.unitName} (={u.conversionFactor})</span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-slate-100 text-slate-600 font-medium">{p.categoryName}</Badge>
                      {p.brandName && <span className="text-slate-500 text-sm ml-2 font-medium bg-slate-50 px-2 py-0.5 border rounded-md">{p.brandName}</span>}
                    </TableCell>
                    <TableCell className="font-extrabold text-[#326dc8] text-sm tracking-tight">
                      {(p as Product & { actualStockDisplay?: string }).actualStockDisplay || '0 PCS'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={p.isActive ? "default" : "secondary"} className={p.isActive ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0" : "border-0"}>{p.isActive ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    {hasEditAccess && (
                      <TableCell className="text-center space-x-1 whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => openEditForm(p)} className="h-8 px-2 text-slate-500 hover:text-[#326dc8] hover:bg-blue-50"><Edit2 className="w-4 h-4" /></Button>
                        {p.isActive ? (
                          <Button variant="ghost" size="sm" onClick={() => setStatusAlert({ isOpen: true, type: 'INACTIVATE', product: p })} className="h-8 px-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50"><Ban className="w-4 h-4" /></Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => setStatusAlert({ isOpen: true, type: 'REACTIVATE', product: p })} className="h-8 px-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"><CheckCircle2 className="w-4 h-4" /></Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {meta && meta.totalPage > 1 && (
          <div className="flex justify-between items-center mt-4">
            <p className="text-sm text-slate-500 font-medium">Halaman {meta.currentPage} dari {meta.totalPage}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={meta.currentPage === 1} onClick={() => setFilters(prev => ({ ...prev, page: meta.currentPage - 1 }))}>Prev</Button>
              <Button variant="outline" size="sm" disabled={meta.currentPage === meta.totalPage} onClick={() => setFilters(prev => ({ ...prev, page: meta.currentPage + 1 }))}>Next</Button>
            </div>
          </div>
        )}
      </div>

      <datalist id="category-options">{lookupOptions.categories.map((c, i) => <option key={i} value={c} />)}</datalist>
      <datalist id="brand-options">{lookupOptions.brands.map((b, i) => <option key={i} value={b} />)}</datalist>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-4xl bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          <DialogHeader className="px-6 py-4 border-b border-slate-100 shrink-0 bg-slate-50">
            <DialogTitle className="font-extrabold text-slate-900 flex items-center gap-2">
              <Package className="w-5 h-5 text-[#326dc8]" />
              {selectedProduct ? "Edit & Kelola Satuan Produk" : "Tambah Produk & Konfigurasi Satuan"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            {formError && (<div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-sm font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {formError}</div>)}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2 md:col-span-2">
                <Label className="font-bold text-slate-700">Nama Produk <span className="text-rose-500">*</span></Label>
                <Input placeholder="Cth: Kopi Kapal Api Mix 30s" value={formData.productName} onChange={(e) => setFormData({ ...formData, productName: e.target.value })} disabled={isSubmitting} className="bg-white border-slate-300" />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">Kategori <span className="text-rose-500">*</span></Label>
                <Input list="category-options" placeholder="Pilih atau ketik Kategori baru..." value={formData.categoryName} onChange={(e) => setFormData({ ...formData, categoryName: e.target.value })} disabled={isSubmitting} className="bg-white border-slate-300" />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">Merek (Brand)</Label>
                <Input list="brand-options" placeholder="Pilih atau ketik Merek baru..." value={formData.brandName} onChange={(e) => setFormData({ ...formData, brandName: e.target.value })} disabled={isSubmitting} className="bg-white border-slate-300" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="font-bold text-slate-700">Peringatan Stok Minimum (Inventory)</Label>
                <Input type="number" min="0" value={formData.minimumInventoryQty} onChange={(e) => setFormData({ ...formData, minimumInventoryQty: e.target.value })} disabled={isSubmitting} className="bg-white border-slate-300 max-w-[200px]" />
              </div>
            </div>

            <div className="pt-5 border-t border-slate-200">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <Label className="font-extrabold text-slate-800 text-lg">Konfigurasi Satuan (Unit)</Label>
                  <p className="text-xs text-slate-500 mt-1">Gunakan ikon <b>Mata</b> untuk menonaktifkan satuan yang tidak lagi digunakan.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addUnitRow} className="text-[#326dc8] border-[#326dc8] hover:bg-blue-50 font-bold">
                  <Plus className="w-4 h-4 mr-1" /> Tambah Satuan
                </Button>
              </div>

              <div className="space-y-3">
                {formUnits.map((u) => (
                  <div key={u.key} className={`relative flex flex-col sm:flex-row gap-3 p-4 rounded-xl border-2 shadow-sm transition-all ${!u.isActive ? 'bg-slate-100 border-slate-200 opacity-60' : u.isParent ? 'border-[#326dc8] bg-blue-50/50' : 'border-slate-200 bg-white'}`}>
                    <div className="flex-1 space-y-2">
                      <Label className={`text-xs font-extrabold ${u.isActive ? 'text-slate-600' : 'text-slate-400'}`}>Nama Satuan</Label>
                      <Input placeholder="Cth: PCS, PACK, DUS" value={u.unitName} onChange={(e) => updateUnitField(u.key, 'unitName', e.target.value.toUpperCase())} disabled={isSubmitting || !u.isActive} className={`uppercase h-10 border-slate-300 font-bold ${!u.isActive && 'line-through text-slate-400'}`} />
                    </div>
                    <div className="w-full sm:w-28 space-y-2">
                      <Label className={`text-xs font-extrabold ${u.isActive ? 'text-slate-600' : 'text-slate-400'}`}>Konversi</Label>
                      <Input type="number" min="1" value={u.conversionFactor} onChange={(e) => updateUnitField(u.key, 'conversionFactor', e.target.value)} disabled={u.isParent || isSubmitting || !u.isActive} className={`h-10 font-bold ${u.isParent || !u.isActive ? 'bg-slate-100 text-slate-500' : 'bg-white border-slate-300'}`} />
                    </div>
                    <div className="w-full sm:w-24 space-y-2">
                      <Label className={`text-xs font-extrabold ${u.isActive ? 'text-slate-600' : 'text-slate-400'}`}>Urutan Tampil</Label>
                      <Input type="number" min="1" value={u.displayOrder} onChange={(e) => updateUnitField(u.key, 'displayOrder', e.target.value)} disabled={isSubmitting || !u.isActive} className="bg-white h-10 border-slate-300 font-bold" />
                    </div>

                    <div className="flex items-end gap-2 pt-2 sm:pt-0">
                      <Button type="button" variant={u.isParent ? "default" : "outline"} onClick={() => setParentUnit(u.key)} disabled={!!selectedProduct || !u.isActive} className={`h-10 px-4 ${u.isParent ? 'bg-[#326dc8] cursor-default shadow-md' : 'text-slate-500 border-slate-300 hover:bg-slate-50'}`}>
                        <Star className={`w-4 h-4 ${u.isParent ? 'fill-current' : ''}`} />
                        {u.isParent ? <span className="ml-2 text-sm font-bold">Parent</span> : <span className="ml-2 text-sm">Jadikan Parent</span>}
                      </Button>
                      
                      {/* PERBAIKAN: Tombol Toggle Inactivate/Reactivate */}
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => toggleUnitStatus(u.key)} 
                        disabled={formUnits.length === 1 || u.isParent} 
                        className={`h-10 px-3 border-slate-300 ${!u.isActive ? 'text-emerald-600 hover:bg-emerald-50 border-emerald-200 bg-emerald-50/50' : 'text-rose-500 hover:bg-rose-50 hover:border-rose-200'}`}
                        title={u.isActive ? "Nonaktifkan Satuan" : "Aktifkan Kembali"}
                      >
                        {u.isActive ? <EyeOff className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-slate-200 bg-slate-50 shrink-0">
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSubmitting} className="border-slate-300 text-slate-700 font-bold">Batal</Button>
            <Button onClick={() => void executeSave()} className="bg-[#326dc8] hover:bg-[#2858a6] text-white font-bold px-6 shadow-md" disabled={isSubmitting}>{isSubmitting ? "Menyimpan..." : "Simpan Data Produk"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={statusAlert.isOpen} onOpenChange={(open) => { if (!open) setStatusAlert({ ...statusAlert, isOpen: false }); }}>
        <AlertDialogContent className="bg-white border border-slate-200 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-extrabold text-slate-900">{statusAlert.type === 'INACTIVATE' ? 'Nonaktifkan Produk?' : 'Aktifkan Kembali Produk?'}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 font-medium">{statusAlert.type === 'INACTIVATE' ? `Produk "${statusAlert.product?.productName}" tidak akan bisa dipilih lagi pada transaksi operasional baru.` : `Produk "${statusAlert.product?.productName}" akan bisa kembali digunakan.`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-bold border-slate-300">Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => void executeStatusToggle()} className={statusAlert.type === 'INACTIVATE' ? "bg-amber-600 hover:bg-amber-700 text-white font-bold" : "bg-emerald-600 hover:bg-emerald-700 text-white font-bold"}>Ya, {statusAlert.type === 'INACTIVATE' ? 'Nonaktifkan' : 'Aktifkan'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}