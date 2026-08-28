import { useState, useEffect } from "react";
import { unitApi, type Unit, type UnitQueryParams } from "../unit.api";
import { parseApiError } from "@/utils/error";
import { useAuthStore } from "@/store/authStore";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export default function UnitListPage() {
  const { user } = useAuthStore();
  const hasEditAccess = user?.roleId === '1' || user?.roleId === '2';

  const [units, setUnits] = useState<Unit[]>([]);
  const [totalData, setTotalData] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<UnitQueryParams>({
    search: "", status: "ALL", sortBy: "unitName", sortDir: "asc"
  });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [formData, setFormData] = useState({ unitName: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const [duplicateAlert, setDuplicateAlert] = useState<{ isOpen: boolean; message: string; payload: { unitName: string; forceSave: boolean } } | null>(null);
  const [statusAlert, setStatusAlert] = useState<{ isOpen: boolean; type: 'INACTIVATE' | 'REACTIVATE'; unit: Unit | null }>({ isOpen: false, type: 'INACTIVATE', unit: null });

  // Efisiensi Komputasi: Debounce pencarian agar tidak memberondong Backend
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchInput }));
    }, 400);
    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  // Pengambilan Data yang aman dari Linter (Isolasi Mounting)
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const response = await unitApi.getAll(filters);
        if (isMounted) {
          setUnits(response.data);
          setTotalData(response.totalData);
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
    setSelectedUnit(null);
    setFormData({ unitName: "" });
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (unit: Unit) => {
    setSelectedUnit(unit);
    setFormData({ unitName: unit.unitName });
    setFormError(null);
    setIsFormOpen(true);
  };

  const executeSave = async (forceSave: boolean = false) => {
    if (!formData.unitName.trim()) {
      setFormError("Nama Satuan (Unit) wajib diisi.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const payload = { unitName: formData.unitName, forceSave };

    try {
      if (selectedUnit) {
        await unitApi.update(selectedUnit.unitId, payload);
      } else {
        await unitApi.create(payload);
      }
      setIsFormOpen(false);
      setDuplicateAlert(null);
      setFilters(prev => ({ ...prev })); // Memaksa re-fetch data
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
    if (!statusAlert.unit) return;
    setIsSubmitting(true);
    try {
      if (statusAlert.type === 'INACTIVATE') {
        await unitApi.inactivate(statusAlert.unit.unitId);
      } else {
        await unitApi.reactivate(statusAlert.unit.unitId);
      }
      setStatusAlert({ isOpen: false, type: 'INACTIVATE', unit: null });
      setFilters(prev => ({ ...prev })); // Memaksa re-fetch data
    } catch (error: unknown) {
      setErrorMsg(parseApiError(error));
      setStatusAlert({ isOpen: false, type: 'INACTIVATE', unit: null });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-full flex flex-col">
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800">Master Satuan (Unit)</h2>
          <p className="text-sm text-slate-500 font-medium">Satuan ukuran barang (PCS, KG, BOX) untuk perhitungan kuantitas.</p>
        </div>
        {hasEditAccess && (
          <Button onClick={openCreateForm} className="bg-[#326dc8] hover:bg-[#2858a6] text-white shadow-sm">
            <Plus className="w-4 h-4 mr-2" /> Tambah Satuan
          </Button>
        )}
      </div>

      <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 flex-wrap flex-1">
          {/* Search Input dengan Indikator Loading Anti-Glitch */}
          <div className="relative min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <Input 
              placeholder="Cari nama satuan..." 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 pr-9 bg-white border-slate-200 focus-visible:ring-slate-900"
            />
            {isLoading && <Loader2 className="w-4 h-4 absolute right-3 top-3 text-slate-400 animate-spin" />}
          </div>
          
          {/* Dropdown Status dengan Background Putih Solid */}
          <Select value={filters.status} onValueChange={(val) => setFilters(prev => ({ ...prev, status: val as UnitQueryParams['status'] }))}>
            <SelectTrigger className="w-[160px] bg-white border-slate-200 shadow-sm"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent className="bg-white border border-slate-200 shadow-xl z-50">
              <SelectItem value="ALL">Semua Status</SelectItem>
              <SelectItem value="ACTIVE">Aktif</SelectItem>
              <SelectItem value="INACTIVE">Tidak Aktif</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="text-sm font-bold text-slate-600 px-2">
          Total: <span className="text-[#326dc8]">{totalData} Satuan</span>
        </div>
      </div>

      {errorMsg && (
        <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" /> {errorMsg}
        </div>
      )}

      {/* Table Data dengan Transisi Halus Anti-Glitch */}
      <div className="flex-1 overflow-auto p-6 pt-4">
        <div className="border border-slate-200 rounded-lg overflow-hidden relative">
          <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
            <Table>
              <TableHeader className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                <TableRow>
                  <TableHead className="font-bold text-slate-700 w-1/2">Nama Satuan (Unit)</TableHead>
                  <TableHead className="font-bold text-slate-700 text-center">Total Produk</TableHead>
                  <TableHead className="font-bold text-slate-700 text-center">Status</TableHead>
                  {hasEditAccess && <TableHead className="font-bold text-slate-700 text-center">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody className={`transition-opacity duration-200 ${isLoading ? "opacity-40" : "opacity-100"}`}>
                {units.length === 0 && !isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12 text-slate-500 font-medium">
                      Tidak ada Satuan yang ditemukan.
                    </TableCell>
                  </TableRow>
                ) : (
                  units.map((u) => (
                    <TableRow key={u.unitId} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="font-bold text-slate-800 text-lg">{u.unitName}</TableCell>
                      <TableCell className="text-center font-medium text-slate-600">
                        {u.totalProduct > 0 ? (
                          <span className="bg-blue-100 text-blue-700 py-1 px-3 rounded-full text-xs">{u.totalProduct} Produk</span>
                        ) : (
                          <span className="text-slate-400 text-xs">Kosong</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={u.isActive ? "default" : "secondary"} className={u.isActive ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0" : "border-0"}>
                          {u.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      {hasEditAccess && (
                        <TableCell className="text-center space-x-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditForm(u)} className="h-8 px-2 text-slate-500 hover:text-[#326dc8] hover:bg-blue-50">
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          {u.isActive ? (
                            <Button variant="ghost" size="sm" onClick={() => setStatusAlert({ isOpen: true, type: 'INACTIVATE', unit: u })} className="h-8 px-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50">
                              <Ban className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => setStatusAlert({ isOpen: true, type: 'REACTIVATE', unit: u })} className="h-8 px-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50">
                              <CheckCircle2 className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-extrabold text-slate-900">{selectedUnit ? "Edit Satuan" : "Tambah Satuan Baru"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {formError}
              </div>
            )}
            <div className="space-y-2">
              <Label className="font-bold text-slate-700">Nama Satuan (Unit) <span className="text-rose-500">*</span></Label>
              <Input placeholder="Cth: PCS, KILOGRAM, BOX" value={formData.unitName} onChange={(e) => setFormData({ ...formData, unitName: e.target.value })} disabled={isSubmitting} className="uppercase bg-slate-50" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSubmitting}>Batal</Button>
            <Button onClick={() => void executeSave(false)} className="bg-[#326dc8] hover:bg-[#2858a6] text-white" disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan..." : "Simpan Satuan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={duplicateAlert?.isOpen} onOpenChange={(open) => { if (!open) setDuplicateAlert(null); }}>
        <AlertDialogContent className="bg-white border border-amber-200 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600 font-extrabold">
              <AlertOctagon className="w-6 h-6" /> Peringatan Kemiripan Data
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-700 font-medium leading-relaxed pt-2">
              {duplicateAlert?.message}
              <br/><br/>
              Apakah Anda yakin bahwa Satuan ini berbeda dan ingin tetap menyimpannya?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel className="font-bold text-slate-600">Batal Simpan</AlertDialogCancel>
            <AlertDialogAction onClick={() => void executeSave(true)} className="bg-amber-500 hover:bg-amber-600 text-white font-bold border-0">
              Ya, Tetap Simpan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={statusAlert.isOpen} onOpenChange={(open) => { if (!open) setStatusAlert({ ...statusAlert, isOpen: false }); }}>
        <AlertDialogContent className="bg-white border border-slate-200 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-extrabold text-slate-900">
              {statusAlert.type === 'INACTIVATE' ? 'Nonaktifkan Satuan?' : 'Aktifkan Kembali Satuan?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 font-medium">
              {statusAlert.type === 'INACTIVATE' 
                ? `Satuan "${statusAlert.unit?.unitName}" tidak akan bisa dipilih lagi saat Anda membuat Produk baru.` 
                : `Satuan "${statusAlert.unit?.unitName}" akan bisa kembali digunakan untuk Produk baru.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => void executeStatusToggle()} 
              className={statusAlert.type === 'INACTIVATE' ? "bg-amber-600 hover:bg-amber-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
            >
              Ya, {statusAlert.type === 'INACTIVATE' ? 'Nonaktifkan' : 'Aktifkan'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}