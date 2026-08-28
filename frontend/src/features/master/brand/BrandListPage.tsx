import { useState, useEffect } from "react";
import { brandApi, type Brand, type BrandQueryParams, type BrandMeta } from "../brand.api";
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
import { Search, Plus, Edit2, Ban, CheckCircle2, AlertTriangle, AlertOctagon, Copyright } from "lucide-react";
import { AxiosError } from "axios";

export default function BrandListPage() {
  const { user } = useAuthStore();
  const hasEditAccess = user?.roleId === '1' || user?.roleId === '2';

  const [brands, setBrands] = useState<Brand[]>([]);
  const [meta, setMeta] = useState<BrandMeta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<BrandQueryParams>({ page: 1, limit: 20, search: "", status: "ALL", sortBy: "brandName", sortDir: "asc" });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [formData, setFormData] = useState({ brandName: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const [duplicateAlert, setDuplicateAlert] = useState<{ isOpen: boolean; message: string; payload: { brandName: string; forceSave: boolean } } | null>(null);
  const [statusAlert, setStatusAlert] = useState<{ isOpen: boolean; type: 'INACTIVATE' | 'REACTIVATE'; brand: Brand | null }>({ isOpen: false, type: 'INACTIVATE', brand: null });

  useEffect(() => {
    const timeoutId = setTimeout(() => setFilters(prev => ({ ...prev, search: searchInput, page: 1 })), 500);
    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setIsLoading(true); setErrorMsg(null);
      try {
        const response = await brandApi.getAll(filters);
        if (isMounted) { setBrands(response.data); setMeta(response.meta); }
      } catch (error: unknown) {
        if (isMounted) setErrorMsg(parseApiError(error));
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    void loadData();
    return () => { isMounted = false; };
  }, [filters]);

  const openCreateForm = () => { setSelectedBrand(null); setFormData({ brandName: "" }); setFormError(null); setIsFormOpen(true); };
  const openEditForm = (b: Brand) => { setSelectedBrand(b); setFormData({ brandName: b.brandName }); setFormError(null); setIsFormOpen(true); };

  const executeSave = async (forceSave: boolean = false) => {
    if (!formData.brandName.trim()) { setFormError("Nama Merek wajib diisi."); return; }
    setIsSubmitting(true); setFormError(null);
    const payload = { brandName: formData.brandName, forceSave };

    try {
      if (selectedBrand) await brandApi.update(selectedBrand.brandId, payload);
      else await brandApi.create(payload);
      setIsFormOpen(false); setDuplicateAlert(null); setFilters(prev => ({ ...prev }));
    } catch (error: unknown) {
      if (error instanceof AxiosError && error.response?.status === 409 && typeof error.response.data?.message === 'string' && error.response.data.message.includes("DUPLICATE_WARNING")) {
        setDuplicateAlert({ isOpen: true, message: error.response.data.message, payload });
      } else {
        setFormError(parseApiError(error));
      }
    } finally { setIsSubmitting(false); }
  };

  const executeStatusToggle = async () => {
    if (!statusAlert.brand) return;
    setIsSubmitting(true);
    try {
      if (statusAlert.type === 'INACTIVATE') await brandApi.inactivate(statusAlert.brand.brandId);
      else await brandApi.reactivate(statusAlert.brand.brandId);
      setStatusAlert({ isOpen: false, type: 'INACTIVATE', brand: null }); setFilters(prev => ({ ...prev }));
    } catch (error: unknown) {
      setErrorMsg(parseApiError(error)); setStatusAlert({ isOpen: false, type: 'INACTIVATE', brand: null });
    } finally { setIsSubmitting(false); }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-full flex flex-col">
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800">Master Merek (Brand)</h2>
          <p className="text-sm text-slate-500 font-medium">Kelola nama merek dari barang-barang yang Anda jual.</p>
        </div>
        {hasEditAccess && (
          <Button onClick={openCreateForm} className="bg-[#326dc8] hover:bg-[#2858a6] text-white shadow-sm">
            <Plus className="w-4 h-4 mr-2" /> Tambah Merek
          </Button>
        )}
      </div>

      <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 flex-wrap flex-1">
          <div className="relative min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <Input placeholder="Cari nama merek..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="pl-9 bg-white" />
          </div>
          <Select value={filters.status} onValueChange={(val) => setFilters(prev => ({ ...prev, status: val as BrandQueryParams['status'], page: 1 }))}>
            <SelectTrigger className="w-[160px] bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Status</SelectItem>
              <SelectItem value="ACTIVE">Aktif</SelectItem>
              <SelectItem value="INACTIVE">Tidak Aktif</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500 font-medium">Tampilkan:</span>
          <Select value={filters.limit?.toString()} onValueChange={(val) => setFilters(prev => ({ ...prev, limit: Number(val), page: 1 }))}>
            <SelectTrigger className="w-[80px] bg-white"><SelectValue placeholder="20" /></SelectTrigger>
            <SelectContent>
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
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-100">
              <TableRow>
                <TableHead className="font-bold text-slate-700 w-1/2">Nama Merek</TableHead>
                <TableHead className="font-bold text-slate-700 text-center">Total Produk</TableHead>
                <TableHead className="font-bold text-slate-700 text-center">Status</TableHead>
                {hasEditAccess && <TableHead className="font-bold text-slate-700 text-center">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-10 text-slate-500">Memuat data...</TableCell></TableRow>
              ) : brands.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-10 text-slate-500">Tidak ada Merek yang ditemukan.</TableCell></TableRow>
              ) : (
                brands.map((b) => (
                  <TableRow key={b.brandId} className="hover:bg-slate-50">
                    <TableCell className="font-bold text-slate-800 text-lg flex items-center gap-2">
                      <Copyright className="w-4 h-4 text-slate-400" /> {b.brandName}
                    </TableCell>
                    <TableCell className="text-center font-medium text-slate-600">
                      {b.totalProduct > 0 ? <span className="bg-blue-100 text-blue-700 py-1 px-3 rounded-full text-xs">{b.totalProduct} Produk</span> : <span className="text-slate-400 text-xs">Kosong</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={b.isActive ? "default" : "secondary"} className={b.isActive ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : ""}>{b.isActive ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    {hasEditAccess && (
                      <TableCell className="text-center space-x-2">
                        <Button variant="ghost" size="sm" onClick={() => openEditForm(b)} className="h-8 px-2 text-slate-500 hover:text-[#326dc8]"><Edit2 className="w-4 h-4" /></Button>
                        {b.isActive ? (
                          <Button variant="ghost" size="sm" onClick={() => setStatusAlert({ isOpen: true, type: 'INACTIVATE', brand: b })} className="h-8 px-2 text-slate-500 hover:text-amber-600"><Ban className="w-4 h-4" /></Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => setStatusAlert({ isOpen: true, type: 'REACTIVATE', brand: b })} className="h-8 px-2 text-slate-500 hover:text-emerald-600"><CheckCircle2 className="w-4 h-4" /></Button>
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

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader><DialogTitle className="font-extrabold text-slate-900">{selectedBrand ? "Edit Merek" : "Tambah Merek Baru"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            {formError && (<div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-sm font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {formError}</div>)}
            <div className="space-y-2">
              <Label className="font-bold text-slate-700">Nama Merek <span className="text-rose-500">*</span></Label>
              <Input placeholder="Cth: KAPAL API" value={formData.brandName} onChange={(e) => setFormData({ ...formData, brandName: e.target.value })} disabled={isSubmitting} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSubmitting}>Batal</Button>
            <Button onClick={() => void executeSave(false)} className="bg-[#326dc8] hover:bg-[#2858a6] text-white" disabled={isSubmitting}>{isSubmitting ? "Menyimpan..." : "Simpan Merek"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={duplicateAlert?.isOpen} onOpenChange={(open) => { if (!open) setDuplicateAlert(null); }}>
        <AlertDialogContent className="bg-white border-amber-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600 font-extrabold"><AlertOctagon className="w-6 h-6" /> Peringatan Kemiripan Data</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-700 font-medium leading-relaxed pt-2">
              {duplicateAlert?.message}<br/><br/>Apakah Anda yakin bahwa Merek ini berbeda dan ingin tetap menyimpannya?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel className="font-bold text-slate-600">Batal Simpan</AlertDialogCancel>
            <AlertDialogAction onClick={() => void executeSave(true)} className="bg-amber-500 hover:bg-amber-600 text-white font-bold border-0">Ya, Tetap Simpan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={statusAlert.isOpen} onOpenChange={(open) => { if (!open) setStatusAlert({ ...statusAlert, isOpen: false }); }}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-extrabold text-slate-900">{statusAlert.type === 'INACTIVATE' ? 'Nonaktifkan Merek?' : 'Aktifkan Kembali Merek?'}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 font-medium">
              {statusAlert.type === 'INACTIVATE' ? `Merek "${statusAlert.brand?.brandName}" tidak akan bisa dipilih lagi saat Anda membuat Produk baru.` : `Merek "${statusAlert.brand?.brandName}" akan bisa kembali digunakan untuk Produk baru.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => void executeStatusToggle()} className={statusAlert.type === 'INACTIVATE' ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"}>Ya, {statusAlert.type === 'INACTIVATE' ? 'Nonaktifkan' : 'Aktifkan'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}