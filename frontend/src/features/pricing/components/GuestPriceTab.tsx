import { useState, useEffect } from "react";
import { pricingApi, type PriceData, type PriceQueryParams, type PriceMeta } from "../pricing.api";
import { parseApiError } from "@/utils/error";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Loader2, Save, X, Edit2, Search } from "lucide-react";

interface GuestPriceTabProps {
  onUnsavedChanges: (hasChanges: boolean) => void;
}

export default function GuestPriceTab({ onUnsavedChanges }: GuestPriceTabProps) {
  const { user } = useAuthStore();
  const hasEditAccess = user?.roleId === '1' || user?.roleId === '2';

  const [data, setData] = useState<PriceData[]>([]);
  const [meta, setMeta] = useState<PriceMeta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [filters, setFilters] = useState<PriceQueryParams>({ page: 1, limit: 20, search: "" });
  const [searchInput, setSearchInput] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);

  // Mode Edit (Spreadsheet-like)
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Debounce Search
  useEffect(() => {
    const timeoutId = setTimeout(() => setFilters(prev => ({ ...prev, search: searchInput, page: 1 })), 500);
    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  // Fetch Data
  useEffect(() => {
    let isMounted = true;
    
    const fetchData = async () => {
      setIsLoading(true); 
      setErrorMsg(null);
      try {
        const response = await pricingApi.getGuestPrices(filters);
        if (isMounted) {
          setData(response.data);
          setMeta(response.meta);
        }
      } catch (error: unknown) {
        if (isMounted) setErrorMsg(parseApiError(error));
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void fetchData();

    return () => { isMounted = false; };
  }, [filters, refreshKey]);

  // Melacak Unsaved Changes
  useEffect(() => {
    const hasChanges = Object.keys(editValues).length > 0;
    onUnsavedChanges(hasChanges);
  }, [editValues, onUnsavedChanges]);

  // Helper formatting angka ke ribuan (contoh: 17000 -> 17.000)
  const formatNumberInput = (val: number | undefined) => {
    if (val === undefined || val === 0) return "";
    return val.toLocaleString('id-ID');
  };

  const handlePriceChange = (productUnitId: string, rawInput: string) => {
    // Hanya ambil angka
    const cleanDigits = rawInput.replace(/\D/g, "");
    const numValue = cleanDigits === "" ? 0 : Number(cleanDigits);
    
    setEditValues(prev => {
      const updated = { ...prev, [productUnitId]: numValue };
      const originalPrice = data.find(d => d.productUnitId === productUnitId)?.suggestedPrice || 0;
      if (updated[productUnitId] === originalPrice) delete updated[productUnitId];
      return updated;
    });
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditValues({});
  };

  const saveChanges = async () => {
    const updates = Object.keys(editValues).map(key => ({
      productUnitId: key,
      price: editValues[key]
    }));

    if (updates.length === 0) {
      setIsEditing(false); return;
    }

    setIsSaving(true); setErrorMsg(null);
    try {
      await pricingApi.updateGuestPrices({ updates });
      setIsEditing(false);
      setEditValues({});
      setRefreshKey(prev => prev + 1);
    } catch (error: unknown) {
      setErrorMsg(parseApiError(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm">
      {/* Toolbar */}
      <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between bg-slate-50 rounded-t-xl">
        <div className="relative min-w-[250px]">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <Input placeholder="Cari nama produk..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} disabled={isEditing} className="pl-9 bg-white" />
        </div>

        <div className="flex items-center gap-2">
          {!isEditing ? (
            hasEditAccess && (
              <Button onClick={() => setIsEditing(true)} className="bg-[#326dc8] hover:bg-[#2858a6] text-white">
                <Edit2 className="w-4 h-4 mr-2" /> Edit Harga
              </Button>
            )
          ) : (
            <>
              <Button variant="outline" onClick={cancelEdit} disabled={isSaving} className="text-slate-600">
                <X className="w-4 h-4 mr-2" /> Batal
              </Button>
              <Button onClick={() => void saveChanges()} disabled={isSaving || Object.keys(editValues).length === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Simpan Perubahan
              </Button>
            </>
          )}
        </div>
      </div>

      {errorMsg && (<div className="m-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm font-medium flex items-center gap-2"><AlertTriangle className="w-5 h-5 shrink-0" /> {errorMsg}</div>)}

      {/* Table */}
      <div className="flex-1 overflow-auto p-4">
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-100">
              <TableRow>
                <TableHead className="font-bold text-slate-700">Nama Produk</TableHead>
                <TableHead className="font-bold text-slate-700">Kategori / Merek</TableHead>
                <TableHead className="font-bold text-slate-700 text-center">Satuan</TableHead>
                <TableHead className="font-bold text-slate-700 text-right w-48">Harga Default (Guest)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={`${isLoading ? "opacity-50" : "opacity-100"}`}>
              {data.length === 0 && !isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-12 text-slate-500">Tidak ada produk ditemukan.</TableCell></TableRow>
              ) : (
                data.map((row) => {
                  const currentPrice = row.suggestedPrice || 0;
                  const editedPrice = editValues[row.productUnitId];
                  const activeDisplayVal = editedPrice !== undefined ? editedPrice : currentPrice;
                  const isChanged = editedPrice !== undefined && editedPrice !== currentPrice;

                  return (
                    <TableRow key={row.productUnitId} className="hover:bg-slate-50">
                      <TableCell className="font-bold text-slate-800">{row.productName}</TableCell>
                      <TableCell className="text-sm text-slate-500">{row.categoryName} {row.brandName ? ` • ${row.brandName}` : ''}</TableCell>
                      <TableCell className="text-center font-bold text-slate-600 bg-slate-50">{row.unitName}</TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <div className={`flex items-center justify-end ${isChanged ? 'border-amber-400' : ''}`}>
                            <span className="text-slate-400 text-xs mr-2">Rp</span>
                            <Input 
                              type="text"
                              value={formatNumberInput(activeDisplayVal)}
                              onChange={(e) => handlePriceChange(row.productUnitId, e.target.value)}
                              placeholder="0"
                              className={`w-32 text-right font-bold ${isChanged ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white'}`}
                            />
                          </div>
                        ) : (
                          <span className="font-bold text-[#326dc8]">
                            Rp {currentPrice.toLocaleString('id-ID')}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination menggunakan data meta */}
        {meta && meta.totalPage > 1 && (
          <div className="flex justify-between items-center mt-4 px-2">
            <p className="text-sm text-slate-500 font-medium">
              Halaman {meta.currentPage} dari {meta.totalPage} (Total: {meta.totalData} data)
            </p>
            <div className="flex gap-2">
              <Button 
                variant="outline" size="sm" 
                disabled={meta.currentPage === 1 || isEditing} 
                onClick={() => setFilters(prev => ({ ...prev, page: (prev.page || 1) - 1 }))}
              >
                Prev
              </Button>
              <Button 
                variant="outline" size="sm" 
                disabled={meta.currentPage === meta.totalPage || isEditing} 
                onClick={() => setFilters(prev => ({ ...prev, page: (prev.page || 1) + 1 }))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}