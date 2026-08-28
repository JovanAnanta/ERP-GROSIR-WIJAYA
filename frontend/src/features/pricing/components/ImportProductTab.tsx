import { useState } from "react";
import { productApi, type ImportProductsPayload } from "@/features/master/product.api";
import { parseApiError } from "@/utils/error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle2, Loader2, Plus, Star, Trash2, UploadCloud, ArrowLeft, Save, X } from "lucide-react";

interface FormUnit {
  key: string;
  unitName: string;
  conversionFactor: string;
  isParent: boolean;
}

interface ImportRow {
  id: string;
  productName: string;
  categoryName: string;
  brandName: string;
  minimumInventoryQty: string;
  units: FormUnit[];
}

export default function ImportProductTab() {
  const [step, setStep] = useState<'paste' | 'preview' | 'success'>('paste');
  const [rawText, setRawText] = useState("");
  const [importData, setImportData] = useState<ImportRow[]>([]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Perbaikan tipe data agar sesuai dengan respons backend (createdCount & updatedCount)
  const [successResult, setSuccessResult] = useState<{ createdCount: number; updatedCount: number } | null>(null);

  // 1. ENGINE PARSER: Mengubah teks Excel (TSV) menjadi Array Objek
  const handleParseText = () => {
    if (!rawText.trim()) {
      setErrorMsg("Teks tidak boleh kosong. Silakan paste data dari Excel.");
      return;
    }

    const lines = rawText.split('\n').filter(l => l.trim() !== '');
    const parsedData: ImportRow[] = lines.map((line, idx) => {
      const cols = line.split('\t').map(c => c.trim());
      
      const productName = cols[0] || '';
      const categoryName = cols[1] || '';
      const brandName = cols[2] || '';
      const minStock = cols[3] || '0';
      
      const units: FormUnit[] = [];
      
      for (let i = 4; i < cols.length; i += 2) {
        const uName = cols[i];
        const uConv = cols[i+1] || '1';
        if (uName) {
          units.push({
            key: Math.random().toString(),
            unitName: uName.toUpperCase(),
            conversionFactor: uConv,
            isParent: units.length === 0
          });
        }
      }

      if (units.length === 0) {
        units.push({ key: Math.random().toString(), unitName: '', conversionFactor: '1', isParent: true });
      }

      return { id: idx.toString(), productName, categoryName, brandName, minimumInventoryQty: minStock, units };
    });

    setImportData(parsedData);
    setErrorMsg(null);
    setStep('preview');
  };

  const updateRowField = (id: string, field: keyof ImportRow, value: string) => {
    setImportData(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const addUnitToRow = (rowId: string) => {
    setImportData(prev => prev.map(row => {
      if (row.id === rowId) {
        return { ...row, units: [...row.units, { key: Math.random().toString(), unitName: '', conversionFactor: '', isParent: false }] };
      }
      return row;
    }));
  };

  const removeUnitFromRow = (rowId: string, unitKey: string) => {
    setImportData(prev => prev.map(row => {
      if (row.id === rowId) {
        const newUnits = row.units.filter(u => u.key !== unitKey);
        if (row.units.find(u => u.key === unitKey)?.isParent && newUnits.length > 0) {
          newUnits[0].isParent = true;
          newUnits[0].conversionFactor = '1';
        }
        return { ...row, units: newUnits };
      }
      return row;
    }));
  };

  const setParentUnit = (rowId: string, unitKey: string) => {
    setImportData(prev => prev.map(row => {
      if (row.id === rowId) {
        return {
          ...row,
          units: row.units.map(u => ({
            ...u,
            isParent: u.key === unitKey,
            conversionFactor: u.key === unitKey ? "1" : u.conversionFactor
          }))
        };
      }
      return row;
    }));
  };

  const updateUnitField = (rowId: string, unitKey: string, field: keyof FormUnit, value: string) => {
    setImportData(prev => prev.map(row => {
      if (row.id === rowId) {
        return { ...row, units: row.units.map(u => u.key === unitKey ? { ...u, [field]: value } : u) };
      }
      return row;
    }));
  };

  const addNewProductRow = () => {
    setImportData(prev => [
      ...prev, 
      { id: Math.random().toString(), productName: '', categoryName: '', brandName: '', minimumInventoryQty: '0', units: [{ key: Math.random().toString(), unitName: '', conversionFactor: '1', isParent: true }] }
    ]);
  };

  const removeProductRow = (rowId: string) => {
    setImportData(prev => prev.filter(r => r.id !== rowId));
  };

  const executeImport = async () => {
    for (let i = 0; i < importData.length; i++) {
      const row = importData[i];
      if (!row.productName.trim() || !row.categoryName.trim()) {
        setErrorMsg(`Baris ${i + 1}: Nama Produk dan Kategori wajib diisi.`); return;
      }
      if (row.units.length === 0) {
        setErrorMsg(`Baris ${i + 1} (${row.productName}): Wajib memiliki minimal 1 satuan.`); return;
      }
      for (const u of row.units) {
        if (!u.unitName.trim()) {
          setErrorMsg(`Baris ${i + 1} (${row.productName}): Nama satuan tidak boleh kosong.`); return;
        }
        if (Number(u.conversionFactor) <= 0) {
          setErrorMsg(`Baris ${i + 1} (${row.productName}): Konversi satuan ${u.unitName} tidak valid.`); return;
        }
      }
    }

    setIsSubmitting(true); setErrorMsg(null);
    
    const payload: ImportProductsPayload = {
      products: importData.map(row => ({
        productName: row.productName,
        categoryName: row.categoryName,
        brandName: row.brandName || undefined,
        minimumInventoryQty: Number(row.minimumInventoryQty),
        units: row.units.map(u => ({
          unitName: u.unitName.trim(),
          conversionFactor: Number(u.conversionFactor),
          isParent: u.isParent
        }))
      }))
    };

    try {
      const res = await productApi.massImport(payload);
      setSuccessResult(res.data);
      setStep('success');
    } catch (err: unknown) {
      setErrorMsg(parseApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setRawText(""); setImportData([]); setErrorMsg(null); setSuccessResult(null); setStep('paste');
  };

  if (step === 'paste') {
    return (
      <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <div className="max-w-4xl mx-auto w-full">
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 bg-blue-50 text-[#326dc8] rounded-full flex items-center justify-center mb-4">
              <UploadCloud className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-800">Mass Import Produk</h2>
            <p className="text-slate-500 mt-2">Salin data dari Excel dan Tempel (Paste) di kotak bawah ini.</p>
          </div>

          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6 text-sm">
            <h4 className="font-bold text-slate-700 mb-2">Format Kolom Excel yang Didukung:</h4>
            <div className="flex flex-wrap gap-2 text-xs font-mono font-bold text-slate-600 mb-2">
              <span className="bg-white px-2 py-1 border rounded">NAMA PRODUK</span>
              <span className="bg-white px-2 py-1 border rounded">KATEGORI</span>
              <span className="bg-white px-2 py-1 border rounded">MEREK</span>
              <span className="bg-white px-2 py-1 border rounded">MIN STOK</span>
            </div>
            <p className="text-slate-500 text-xs italic">*Kolom Satuan dan Konversi opsional, bisa Anda tambahkan secara manual di layar berikutnya.</p>
          </div>

          {errorMsg && (<div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm font-medium flex items-center gap-2"><AlertTriangle className="w-5 h-5 shrink-0" /> {errorMsg}</div>)}

          <Textarea 
            value={rawText} onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste di sini...&#10;Kapal Api Mix&#9;Kopi&#9;Kapal Api&#9;50&#9;" 
            className="min-h-[250px] font-mono text-sm bg-slate-50 border-slate-300 focus-visible:ring-[#326dc8] mb-6"
          />

          <div className="flex justify-end">
            <Button onClick={handleParseText} className="bg-[#326dc8] hover:bg-[#2858a6] text-white px-8 h-12 text-lg font-bold shadow-md">
              Validasi & Preview Data
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h2 className="text-3xl font-extrabold text-slate-800 mb-2">Import Berhasil!</h2>
        <p className="text-slate-600 text-lg mb-8">
          <b>{successResult?.createdCount}</b> Produk Baru dibuat & <b>{successResult?.updatedCount}</b> Produk Lama diperbarui (Overwrite).
        </p>
        <Button onClick={resetForm} variant="outline" className="h-12 px-6 font-bold border-slate-300">
          Lakukan Import Lainnya
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => setStep('paste')} className="text-slate-500 hover:text-slate-800">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="font-extrabold text-slate-800 text-lg">Validasi & Resolusi Satuan</h2>
            <p className="text-xs text-slate-500">
              Periksa data di bawah. <b>Klik sebuah kotak satuan</b> untuk menjadikannya Satuan Dasar (Parent).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm font-bold text-slate-600 px-4 py-2 bg-white border border-slate-200 rounded-lg">
            Total: {importData.length} Baris
          </div>
          <Button onClick={() => void executeImport()} disabled={isSubmitting || importData.length === 0} className="bg-[#326dc8] hover:bg-[#2858a6] text-white shadow-md font-bold">
            {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Simpan ke Database
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="m-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm font-medium flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-5 h-5 shrink-0" /> {errorMsg}
        </div>
      )}

      <div className="flex-1 overflow-auto p-4 bg-slate-100">
        <div className="space-y-4">
          {importData.map((row, index) => (
            <div key={row.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
              
              <div className="p-3 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-3 items-end">
                <div className="w-8 shrink-0 text-center font-bold text-slate-400 self-center">#{index + 1}</div>
                <div className="flex-1 min-w-[200px] space-y-1">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nama Produk <span className="text-rose-500">*</span></Label>
                  <Input value={row.productName} onChange={(e) => updateRowField(row.id, 'productName', e.target.value)} className="h-8 font-bold border-slate-300" />
                </div>
                <div className="w-32 shrink-0 space-y-1">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kategori <span className="text-rose-500">*</span></Label>
                  <Input value={row.categoryName} onChange={(e) => updateRowField(row.id, 'categoryName', e.target.value)} className="h-8 border-slate-300 uppercase text-xs font-semibold" />
                </div>
                <div className="w-32 shrink-0 space-y-1">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Merek</Label>
                  <Input value={row.brandName} onChange={(e) => updateRowField(row.id, 'brandName', e.target.value)} className="h-8 border-slate-300 uppercase text-xs font-semibold" />
                </div>
                <div className="w-20 shrink-0 space-y-1">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Min Stok</Label>
                  <Input type="number" value={row.minimumInventoryQty} onChange={(e) => updateRowField(row.id, 'minimumInventoryQty', e.target.value)} className="h-8 border-slate-300 text-xs font-semibold text-center" />
                </div>
                <Button variant="ghost" onClick={() => removeProductRow(row.id)} className="h-8 w-8 p-0 text-rose-500 hover:bg-rose-50 hover:text-rose-600 shrink-0 self-end mb-0.5">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              <div className="p-3 bg-white flex flex-wrap items-center gap-3">
                {row.units.map((u) => (
                  <div 
                    key={u.key}
                    onClick={() => setParentUnit(row.id, u.key)}
                    className={`group relative flex items-center gap-2 p-2 pr-8 rounded-lg border-2 transition-all cursor-pointer ${
                      u.isParent ? 'border-[#326dc8] bg-blue-50/50 shadow-md ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                    }`}
                  >
                    {u.isParent && (
                      <div className="absolute -top-2.5 -right-2.5 bg-[#326dc8] text-white p-1 rounded-full shadow-sm">
                        <Star className="w-3 h-3 fill-current" />
                      </div>
                    )}
                    
                    <div className="space-y-1">
                      <Label className="text-[9px] font-bold text-slate-500 uppercase">Satuan</Label>
                      <Input 
                        value={u.unitName} onChange={(e) => updateUnitField(row.id, u.key, 'unitName', e.target.value.toUpperCase())}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="PCS"
                        className={`w-20 h-7 text-xs font-bold uppercase border-slate-300 ${u.isParent ? 'bg-white' : ''}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[9px] font-bold text-slate-500 uppercase">Konversi</Label>
                      <Input 
                        type="number" min="1" 
                        value={u.conversionFactor} onChange={(e) => updateUnitField(row.id, u.key, 'conversionFactor', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={u.isParent}
                        className={`w-16 h-7 text-xs font-bold text-center border-slate-300 ${u.isParent ? 'bg-slate-100 text-slate-400' : ''}`}
                      />
                    </div>

                    <button 
                      onClick={(e) => { e.stopPropagation(); removeUnitFromRow(row.id, u.key); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-rose-500 p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                
                <Button variant="outline" size="sm" onClick={() => addUnitToRow(row.id)} className="h-14 border-dashed border-2 border-slate-300 text-slate-500 hover:text-[#326dc8] hover:border-[#326dc8] hover:bg-blue-50">
                  <Plus className="w-4 h-4 mr-1" /> Unit
                </Button>
              </div>

            </div>
          ))}

          <Button onClick={addNewProductRow} variant="outline" className="w-full h-12 border-dashed border-2 border-slate-300 text-slate-500 hover:text-[#326dc8] hover:border-[#326dc8] hover:bg-blue-50 font-bold bg-white">
            <Plus className="w-5 h-5 mr-2" /> Tambah Baris Produk Baru (Manual)
          </Button>

        </div>
      </div>
    </div>
  );
}