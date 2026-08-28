import { useState, useEffect } from "react";
import { customerApi, type Customer, type CustomerQueryParams, type CustomerMeta } from "../customer.api";
import { parseApiError } from "@/utils/error";
import { useAuthStore } from "@/store/authStore";

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

export default function CustomerListPage() {
  const { user } = useAuthStore();
  const hasEditAccess = user?.roleId === '1' || user?.roleId === '2';

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [meta, setMeta] = useState<CustomerMeta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<CustomerQueryParams>({
    page: 1, limit: 20, search: "", status: "ALL", hasOutstandingAr: "ALL", sortBy: "customerName", sortDir: "asc"
  });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState({ customerName: "", phone: "", address: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const [duplicateAlert, setDuplicateAlert] = useState<{ isOpen: boolean; message: string; payload: { customerName: string; phone?: string; address?: string; forceSave: boolean } } | null>(null);
  const [statusAlert, setStatusAlert] = useState<{ isOpen: boolean; type: 'INACTIVATE' | 'REACTIVATE'; customer: Customer | null }>({ isOpen: false, type: 'INACTIVATE', customer: null });

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
        const response = await customerApi.getAll(filters);
        if (isMounted) {
          setCustomers(response.data);
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
    setSelectedCustomer(null);
    setFormData({ customerName: "", phone: "", address: "" });
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({ customerName: customer.customerName, phone: customer.phone || "", address: customer.address || "" });
    setFormError(null);
    setIsFormOpen(true);
  };

  const executeSave = async (forceSave: boolean = false) => {
    if (!formData.customerName.trim()) {
      setFormError("Nama Customer wajib diisi.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const payload = {
      customerName: formData.customerName,
      phone: formData.phone || undefined,
      address: formData.address || undefined,
      forceSave
    };

    try {
      if (selectedCustomer) {
        await customerApi.update(selectedCustomer.customerId, { ...payload, updatedAt: selectedCustomer.updatedAt || '0' });
      } else {
        await customerApi.create(payload);
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
    if (!statusAlert.customer) return;
    setIsSubmitting(true);
    try {
      if (statusAlert.type === 'INACTIVATE') {
        await customerApi.inactivate(statusAlert.customer.customerId);
      } else {
        await customerApi.reactivate(statusAlert.customer.customerId);
      }
      setStatusAlert({ isOpen: false, type: 'INACTIVATE', customer: null });
      setFilters(prev => ({ ...prev }));
    } catch (error: unknown) {
      setErrorMsg(parseApiError(error));
      setStatusAlert({ isOpen: false, type: 'INACTIVATE', customer: null });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-full flex flex-col">
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800">Master Customer</h2>
          <p className="text-sm text-slate-500 font-medium">Kelola data identitas pelanggan toko Anda.</p>
        </div>
        {hasEditAccess && (
          <Button onClick={openCreateForm} className="bg-[#326dc8] hover:bg-[#2858a6] text-white shadow-sm">
            <Plus className="w-4 h-4 mr-2" /> Tambah Customer
          </Button>
        )}
      </div>

      <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 flex-wrap flex-1">
          <div className="relative min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <Input 
              placeholder="Cari nama atau no. telepon..." 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 pr-9 bg-white border-slate-200 focus-visible:ring-slate-900"
            />
            {isLoading && <Loader2 className="w-4 h-4 absolute right-3 top-3 text-slate-400 animate-spin" />}
          </div>
          
          <Select value={filters.status} onValueChange={(val) => setFilters(prev => ({ ...prev, status: val as CustomerQueryParams['status'], page: 1 }))}>
            <SelectTrigger className="w-[160px] bg-white border-slate-200 shadow-sm"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent className="bg-white border border-slate-200 shadow-xl z-50">
              <SelectItem value="ALL">Semua Status</SelectItem>
              <SelectItem value="ACTIVE">Aktif</SelectItem>
              <SelectItem value="INACTIVE">Tidak Aktif</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.hasOutstandingAr} onValueChange={(val) => setFilters(prev => ({ ...prev, hasOutstandingAr: val as CustomerQueryParams['hasOutstandingAr'], page: 1 }))}>
            <SelectTrigger className="w-[180px] bg-white border-slate-200 shadow-sm"><SelectValue placeholder="Status Piutang" /></SelectTrigger>
            <SelectContent className="bg-white border border-slate-200 shadow-xl z-50">
              <SelectItem value="ALL">Semua Piutang</SelectItem>
              <SelectItem value="YES">Ada Piutang (AR)</SelectItem>
              <SelectItem value="NO">Tidak Ada Piutang</SelectItem>
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
                <TableHead className="font-bold text-slate-700">Nama Customer</TableHead>
                <TableHead className="font-bold text-slate-700">No. Telepon</TableHead>
                <TableHead className="font-bold text-slate-700">Alamat</TableHead>
                <TableHead className="font-bold text-slate-700 text-right">Outstanding AR</TableHead>
                <TableHead className="font-bold text-slate-700 text-center">Status</TableHead>
                {hasEditAccess && <TableHead className="font-bold text-slate-700 text-center">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody className={`transition-opacity duration-200 ${isLoading ? "opacity-40" : "opacity-100"}`}>
              {customers.length === 0 && !isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-slate-500 font-medium">Tidak ada Customer yang ditemukan.</TableCell>
                </TableRow>
              ) : (
                customers.map((c) => (
                  <TableRow key={c.customerId} className="hover:bg-slate-50 transition-colors">
                    <TableCell className="font-bold text-slate-800">{c.customerName}</TableCell>
                    <TableCell className="text-slate-600">{c.phone || "-"}</TableCell>
                    <TableCell className="text-slate-600 truncate max-w-[200px]">{c.address || "-"}</TableCell>
                    <TableCell className="text-right font-medium text-rose-600">
                      {c.outstandingAr > 0 ? `Rp ${c.outstandingAr.toLocaleString('id-ID')}` : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={c.isActive ? "default" : "secondary"} className={c.isActive ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0" : "border-0"}>
                        {c.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    {hasEditAccess && (
                      <TableCell className="text-center space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditForm(c)} className="h-8 px-2 text-slate-500 hover:text-[#326dc8] hover:bg-blue-50"><Edit2 className="w-4 h-4" /></Button>
                        {c.isActive ? (
                          <Button variant="ghost" size="sm" onClick={() => setStatusAlert({ isOpen: true, type: 'INACTIVATE', customer: c })} className="h-8 px-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50"><Ban className="w-4 h-4" /></Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => setStatusAlert({ isOpen: true, type: 'REACTIVATE', customer: c })} className="h-8 px-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"><CheckCircle2 className="w-4 h-4" /></Button>
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
          <DialogHeader><DialogTitle className="font-extrabold text-slate-900">{selectedCustomer ? "Edit Customer" : "Tambah Customer Baru"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            {formError && (<div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-sm font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {formError}</div>)}
            <div className="space-y-2"><Label className="font-bold text-slate-700">Nama Customer <span className="text-rose-500">*</span></Label><Input placeholder="Toko Abadi Jaya" value={formData.customerName} onChange={(e) => setFormData({ ...formData, customerName: e.target.value })} disabled={isSubmitting} className="bg-slate-50" /></div>
            <div className="space-y-2"><Label className="font-bold text-slate-700">No. Telepon (Opsional)</Label><Input placeholder="08123456789" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} disabled={isSubmitting} className="bg-slate-50" /></div>
            <div className="space-y-2"><Label className="font-bold text-slate-700">Alamat (Opsional)</Label><Textarea placeholder="Alamat lengkap..." value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="resize-none bg-slate-50" disabled={isSubmitting} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSubmitting}>Batal</Button>
            <Button onClick={() => void executeSave(false)} className="bg-[#326dc8] hover:bg-[#2858a6] text-white" disabled={isSubmitting}>{isSubmitting ? "Menyimpan..." : "Simpan Customer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={duplicateAlert?.isOpen} onOpenChange={(open) => { if (!open) setDuplicateAlert(null); }}>
        <AlertDialogContent className="bg-white border border-amber-200 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600 font-extrabold"><AlertOctagon className="w-6 h-6" /> Peringatan Kemiripan Data</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-700 font-medium leading-relaxed pt-2">{duplicateAlert?.message}<br/><br/>Apakah Anda yakin bahwa ini adalah Customer yang berbeda dan ingin tetap menyimpannya?</AlertDialogDescription>
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
            <AlertDialogTitle className="font-extrabold text-slate-900">{statusAlert.type === 'INACTIVATE' ? 'Nonaktifkan Customer?' : 'Aktifkan Kembali Customer?'}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 font-medium">{statusAlert.type === 'INACTIVATE' ? `Customer "${statusAlert.customer?.customerName}" tidak akan bisa dipilih lagi pada transaksi baru.` : `Customer "${statusAlert.customer?.customerName}" akan bisa kembali digunakan untuk transaksi baru.`}</AlertDialogDescription>
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