import { useState, useEffect } from "react";
import { supplierApi, type Supplier, type SupplierQueryParams, type SupplierMeta } from "../supplier.api";
import { parseApiError } from "@/utils/error";
import { hasPermission, useAuthStore } from "@/store/authStore";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, Plus, Edit2, Ban, CheckCircle2, AlertTriangle, AlertOctagon, Loader2
} from "lucide-react";
import { AxiosError } from "axios";

export default function SupplierListPage() {
  const { user } = useAuthStore();
  const canCreate = hasPermission(user, 'PURCHASE_CREATE');
  const canUpdate = hasPermission(user, 'PURCHASE_UPDATE');

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [meta, setMeta] = useState<SupplierMeta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<SupplierQueryParams>({
    page: 1, limit: 20, search: "", status: "ALL", hasOutstandingAp: "ALL", sortBy: "supplierName", sortDir: "asc"
  });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({ supplierName: "", phone: "", email: "", address: "", picName: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const [duplicateAlert, setDuplicateAlert] = useState<{ isOpen: boolean; message: string; payload: { supplierName: string; phone?: string; email?: string; address?: string; picName?: string; forceSave: boolean } } | null>(null);
  const [statusAlert, setStatusAlert] = useState<{ isOpen: boolean; type: 'INACTIVATE' | 'REACTIVATE'; supplier: Supplier | null }>({ isOpen: false, type: 'INACTIVATE', supplier: null });

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchInput, page: 1 }));
    }, 400);
    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const response = await supplierApi.getAll(filters);
        if (isMounted) {
          setSuppliers(response.data);
          setMeta(response.meta);
        }
      } catch (error: unknown) {
        if (isMounted) setErrorMsg(parseApiError(error));
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    void loadData();
    return () => { isMounted = false; };
  }, [filters]);

  const openCreateForm = () => {
    setSelectedSupplier(null);
    setFormData({ supplierName: "", phone: "", email: "", address: "", picName: "" });
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setFormData({ 
      supplierName: supplier.supplierName, 
      phone: supplier.phone || "", 
      email: supplier.email || "", 
      address: supplier.address || "", 
      picName: supplier.picName || "" 
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const executeSave = async (forceSave: boolean = false) => {
    if (!formData.supplierName.trim()) {
      setFormError("Nama Supplier wajib diisi.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const payload = {
      supplierName: formData.supplierName,
      phone: formData.phone || undefined,
      email: formData.email || undefined,
      address: formData.address || undefined,
      picName: formData.picName || undefined,
      forceSave
    };

    try {
      if (selectedSupplier) {
        await supplierApi.update(selectedSupplier.supplierId, { ...payload, updatedAt: selectedSupplier.updatedAt || '0' });
      } else {
        await supplierApi.create(payload);
      }
      setIsFormOpen(false);
      setDuplicateAlert(null);
      setFilters(prev => ({ ...prev }));
    } catch (error: unknown) {
      if (error instanceof AxiosError && error.response?.status === 409 && typeof error.response.data?.message === 'string' && error.response.data.message.includes("DUPLICATE_WARNING")) {
        setDuplicateAlert({ isOpen: true, message: error.response.data.message, payload });
      } else {
        setFormError(parseApiError(error));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeStatusToggle = async () => {
    if (!statusAlert.supplier) return;
    setIsSubmitting(true);
    try {
      if (statusAlert.type === 'INACTIVATE') {
        await supplierApi.inactivate(statusAlert.supplier.supplierId);
      } else {
        await supplierApi.reactivate(statusAlert.supplier.supplierId);
      }
      setStatusAlert({ isOpen: false, type: 'INACTIVATE', supplier: null });
      setFilters(prev => ({ ...prev }));
    } catch (error: unknown) {
      setErrorMsg(parseApiError(error));
      setStatusAlert({ isOpen: false, type: 'INACTIVATE', supplier: null });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-full flex flex-col">
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800">Direktori Mitra (Supplier)</h2>
          <p className="text-sm text-slate-500 font-medium">Kelola data mitra penyedia barang dan logistik toko Anda.</p>
        </div>
        {canCreate && (
          <Button onClick={openCreateForm} className="bg-[#326dc8] hover:bg-[#2858a6] text-white shadow-sm">
            <Plus className="w-4 h-4 mr-2" /> Tambah Supplier
          </Button>
        )}
      </div>

      <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 flex-wrap flex-1">
          <div className="relative min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <Input 
              placeholder="Cari nama supplier atau telepon..." 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 pr-9 bg-white border-slate-200 focus-visible:ring-slate-900"
            />
            {isLoading && <Loader2 className="w-4 h-4 absolute right-3 top-3 text-slate-400 animate-spin" />}
          </div>
          
          <Select value={filters.status} onValueChange={(val) => setFilters(prev => ({ ...prev, status: val as SupplierQueryParams['status'], page: 1 }))}>
            <SelectTrigger className="w-[160px] bg-white border-slate-200 shadow-sm"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent className="bg-white border border-slate-200 shadow-xl z-50">
              <SelectItem value="ALL">Semua Status</SelectItem>
              <SelectItem value="ACTIVE">Aktif</SelectItem>
              <SelectItem value="INACTIVE">Tidak Aktif</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.hasOutstandingAp} onValueChange={(val) => setFilters(prev => ({ ...prev, hasOutstandingAp: val as SupplierQueryParams['hasOutstandingAp'], page: 1 }))}>
            <SelectTrigger className="w-[180px] bg-white border-slate-200 shadow-sm"><SelectValue placeholder="Status Hutang" /></SelectTrigger>
            <SelectContent className="bg-white border border-slate-200 shadow-xl z-50">
              <SelectItem value="ALL">Semua Hutang</SelectItem>
              <SelectItem value="YES">Ada Hutang (AP)</SelectItem>
              <SelectItem value="NO">Tidak Ada Hutang</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* PERBAIKAN: Selector Limit Pagination */}
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

      {errorMsg && (
        <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" /> {errorMsg}
        </div>
      )}

      <div className="flex-1 overflow-auto p-6 pt-4">
        <div className="border border-slate-200 rounded-lg overflow-hidden relative">
          <Table>
            <TableHeader className="bg-slate-100">
              <TableRow>
                <TableHead className="font-bold text-slate-700">Nama Supplier</TableHead>
                <TableHead className="font-bold text-slate-700">No. Telepon / PIC</TableHead>
                <TableHead className="font-bold text-slate-700">Alamat</TableHead>
                <TableHead className="font-bold text-slate-700 text-right">Outstanding AP</TableHead>
                <TableHead className="font-bold text-slate-700 text-center">Status</TableHead>
                {canUpdate && <TableHead className="font-bold text-slate-700 text-center">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody className={`transition-opacity duration-200 ${isLoading ? "opacity-40" : "opacity-100"}`}>
              {suppliers.length === 0 && !isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-slate-500 font-medium">Tidak ada Supplier yang ditemukan.</TableCell>
                </TableRow>
              ) : (
                suppliers.map((s) => (
                  <TableRow key={s.supplierId} className="hover:bg-slate-50 transition-colors">
                    <TableCell className="font-bold text-slate-800">
                      {s.supplierName}
                      {s.email && <span className="block text-xs font-normal text-slate-400">{s.email}</span>}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {s.phone || "-"}
                      {s.picName && <span className="block text-xs text-slate-400">PIC: {s.picName}</span>}
                    </TableCell>
                    <TableCell className="text-slate-600 truncate max-w-[200px]">{s.address || "-"}</TableCell>
                    <TableCell className="text-right font-medium text-amber-600">
                      {s.outstandingAp > 0 ? `Rp ${s.outstandingAp.toLocaleString('id-ID')}` : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={s.isActive ? "default" : "secondary"} className={s.isActive ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0" : "border-0"}>
                        {s.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    {canUpdate && (
                      <TableCell className="text-center space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditForm(s)} className="h-8 px-2 text-slate-500 hover:text-[#326dc8] hover:bg-blue-50"><Edit2 className="w-4 h-4" /></Button>
                        {s.isActive ? (
                          <Button variant="ghost" size="sm" onClick={() => setStatusAlert({ isOpen: true, type: 'INACTIVATE', supplier: s })} className="h-8 px-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50"><Ban className="w-4 h-4" /></Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => setStatusAlert({ isOpen: true, type: 'REACTIVATE', supplier: s })} className="h-8 px-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"><CheckCircle2 className="w-4 h-4" /></Button>
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
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-2xl">
          <DialogHeader><DialogTitle className="font-extrabold text-slate-900">{selectedSupplier ? "Edit Supplier" : "Tambah Supplier Baru"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto px-1">
            {formError && (<div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-sm font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {formError}</div>)}
            <div className="space-y-2"><Label className="font-bold text-slate-700">Nama Supplier <span className="text-rose-500">*</span></Label><Input placeholder="PT Distributor Jaya" value={formData.supplierName} onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })} disabled={isSubmitting} className="bg-slate-50" /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label className="font-bold text-slate-700">No. Telepon</Label><Input placeholder="021-5551234" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} disabled={isSubmitting} className="bg-slate-50" /></div>
              <div className="space-y-2"><Label className="font-bold text-slate-700">Nama PIC</Label><Input placeholder="Bapak Budi" value={formData.picName} onChange={(e) => setFormData({ ...formData, picName: e.target.value })} disabled={isSubmitting} className="bg-slate-50" /></div>
            </div>
            <div className="space-y-2"><Label className="font-bold text-slate-700">Email</Label><Input type="email" placeholder="distributor@jaya.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} disabled={isSubmitting} className="bg-slate-50" /></div>
            <div className="space-y-2"><Label className="font-bold text-slate-700">Alamat</Label><Textarea placeholder="Alamat gudang/kantor..." value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="resize-none bg-slate-50" disabled={isSubmitting} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSubmitting}>Batal</Button>
            <Button onClick={() => void executeSave(false)} className="bg-[#326dc8] hover:bg-[#2858a6] text-white" disabled={isSubmitting}>{isSubmitting ? "Menyimpan..." : "Simpan Supplier"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={duplicateAlert?.isOpen} onOpenChange={(open) => { if (!open) setDuplicateAlert(null); }}>
        <AlertDialogContent className="bg-white border border-amber-200 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600 font-extrabold"><AlertOctagon className="w-6 h-6" /> Peringatan Kemiripan Data</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-700 font-medium leading-relaxed pt-2">{duplicateAlert?.message}<br/><br/>Apakah Anda yakin bahwa ini adalah Supplier yang berbeda dan ingin tetap menyimpannya?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel className="font-bold text-slate-600">Batal Simpan</AlertDialogCancel>
            <AlertDialogAction onClick={() => void executeSave(true)} className="bg-amber-500 hover:bg-amber-600 text-white font-bold border-0">Ya, Tetap Simpan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={statusAlert.isOpen} onOpenChange={(open) => { if (!open) setStatusAlert({ ...statusAlert, isOpen: false }); }}>
        <AlertDialogContent className="bg-white border border-slate-200 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-extrabold text-slate-900">{statusAlert.type === 'INACTIVATE' ? 'Nonaktifkan Supplier?' : 'Aktifkan Kembali Supplier?'}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 font-medium">{statusAlert.type === 'INACTIVATE' ? `Supplier "${statusAlert.supplier?.supplierName}" tidak akan bisa dipilih lagi pada transaksi pembelian baru.` : `Supplier "${statusAlert.supplier?.supplierName}" akan bisa kembali digunakan untuk transaksi pembelian.`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => void executeStatusToggle()} className={statusAlert.type === 'INACTIVATE' ? "bg-amber-600 hover:bg-amber-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}>Ya, {statusAlert.type === 'INACTIVATE' ? 'Nonaktifkan' : 'Aktifkan'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
