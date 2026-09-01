import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, PackageCheck, Plus, RotateCcw, Save, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { parseApiError } from '@/utils/error';
import {
  purchasingApi,
  type FinancialAccountOption,
  type PurchaseReturnContext,
  type PurchaseReturnDetail,
  type PurchaseReturnResolutionType,
  type SavePurchaseReturnPayload,
} from '../purchasing.api';

interface Props {
  invoiceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

interface ReturnRow {
  purchaseInvoiceDetailId: string;
  productName: string;
  purchasedLabel: string;
  returnedBaseQty: number;
  maxBaseQty: number;
  units: PurchaseReturnContext['items'][number]['units'];
  productUnitId: string;
  quantity: number;
  unitCost: number;
}

const resolutionLabels: Record<PurchaseReturnResolutionType, string> = {
  REPLACEMENT: 'Ganti Barang',
  CURRENT_INVOICE_DEDUCTION: 'Potong Faktur Ini',
  NEXT_INVOICE_DEDUCTION: 'Potong Faktur Berikutnya',
  CASHBACK: 'Cashback',
};

const statusClass: Record<PurchaseReturnDetail['status'], string> = {
  DRAFT: 'bg-amber-100 text-amber-800',
  READY: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-slate-200 text-slate-600',
};

export default function PurchaseReturnDialog({ invoiceId, open, onOpenChange, onChanged }: Props) {
  const [context, setContext] = useState<PurchaseReturnContext | null>(null);
  const [returns, setReturns] = useState<PurchaseReturnDetail[]>([]);
  const [view, setView] = useState<'history' | 'form' | 'detail'>('history');
  const [selectedReturn, setSelectedReturn] = useState<PurchaseReturnDetail | null>(null);
  const [editingReturnId, setEditingReturnId] = useState<string | null>(null);
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [resolutionType, setResolutionType] = useState<PurchaseReturnResolutionType>('REPLACEMENT');
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [accounts, setAccounts] = useState<FinancialAccountOption[]>([]);
  const [financialAccountId, setFinancialAccountId] = useState('');
  const [cashbackMethod, setCashbackMethod] = useState<'CASH' | 'TRANSFER'>('TRANSFER');
  const [invoiceOptions, setInvoiceOptions] = useState<Array<{ purchaseInvoiceId: string; purchaseInvoiceNumber: string; invoiceDate: string; invoiceTotal: number }>>([]);
  const [appliedInvoiceId, setAppliedInvoiceId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initializeRows = useCallback((data: PurchaseReturnContext) => {
    setRows(data.items.map((item) => {
      const unit = item.units.find((option) => option.productUnitId === item.originalProductUnitId) ?? item.units[0];
      return {
        purchaseInvoiceDetailId: item.purchaseInvoiceDetailId,
        productName: item.productName,
        purchasedLabel: `${item.purchasedQty} ${item.purchasedUnitName}`,
        returnedBaseQty: item.returnedBaseQty,
        maxBaseQty: item.maxBaseQty,
        units: item.units,
        productUnitId: unit?.productUnitId ?? '',
        quantity: 0,
        unitCost: unit?.defaultReturnUnitCost ?? 0,
      };
    }));
  }, []);

  const loadData = useCallback(async () => {
    if (!invoiceId) return;
    // A dialog instance is reused for different invoices. Never carry an edit
    // target from the previously opened invoice into a new return form.
    setEditingReturnId(null);
    setSelectedReturn(null);
    setIsLoading(true);
    setError(null);
    try {
      const [returnContext, history] = await Promise.all([
        purchasingApi.getPurchaseReturnContext(invoiceId),
        purchasingApi.getInvoiceReturns(invoiceId),
      ]);
      setContext(returnContext);
      setReturns(history);
      initializeRows(returnContext);
      setView(history.length > 0 ? 'history' : 'form');
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsLoading(false);
    }
  }, [initializeRows, invoiceId]);

  useEffect(() => {
    if (!open) return;
    const timeoutId = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadData, open]);

  const resetForm = () => {
    if (context) initializeRows(context);
    setEditingReturnId(null);
    setResolutionType('REPLACEMENT');
    setReturnDate(new Date().toISOString().slice(0, 10));
    setExpectedDate('');
    setReason('');
    setNote('');
    setError(null);
  };

  const openNew = () => {
    resetForm();
    setView('form');
  };

  const openDetail = async (item: PurchaseReturnDetail) => {
    setSelectedReturn(item);
    setView('detail');
    if (item.status === 'READY' && item.resolutionType === 'CASHBACK' && accounts.length === 0) {
      setAccounts(await purchasingApi.getFinancialAccounts());
    }
    if (item.status === 'READY' && item.resolutionType === 'NEXT_INVOICE_DEDUCTION') {
      setInvoiceOptions(await purchasingApi.getPurchaseReturnCompletionOptions(item.purchaseReturnId));
    }
  };

  const openEdit = (item: PurchaseReturnDetail) => {
    if (!context) return;
    setEditingReturnId(item.purchaseReturnId);
    setResolutionType(item.resolutionType);
    setReturnDate(item.returnDate.slice(0, 10));
    setExpectedDate(item.expectedResolutionDate?.slice(0, 10) ?? '');
    setReason(item.reason);
    setNote(item.note ?? '');
    setRows(context.items.map((source) => {
      const saved = item.details.find((detail) => detail.purchaseInvoiceDetailId === source.purchaseInvoiceDetailId);
      const unit = source.units.find((option) => option.productUnitId === saved?.productUnitId)
        ?? source.units.find((option) => option.productUnitId === source.originalProductUnitId)
        ?? source.units[0];
      return {
        purchaseInvoiceDetailId: source.purchaseInvoiceDetailId,
        productName: source.productName,
        purchasedLabel: `${source.purchasedQty} ${source.purchasedUnitName}`,
        returnedBaseQty: source.returnedBaseQty,
        maxBaseQty: source.maxBaseQty,
        units: source.units,
        productUnitId: unit?.productUnitId ?? '',
        quantity: saved?.quantity ?? 0,
        unitCost: saved?.unitCost ?? unit?.defaultReturnUnitCost ?? 0,
      };
    }));
    setView('form');
  };

  const updateUnit = (index: number, productUnitId: string | null) => {
    if (!productUnitId) return;
    setRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const unit = row.units.find((option) => option.productUnitId === productUnitId);
      return { ...row, productUnitId, unitCost: unit?.defaultReturnUnitCost ?? row.unitCost, quantity: 0 };
    }));
  };

  const selectedRows = useMemo(() => rows.filter((row) => row.quantity > 0), [rows]);
  const returnTotal = useMemo(() => selectedRows.reduce((sum, row) => sum + row.quantity * row.unitCost, 0), [selectedRows]);

  const save = async (status: 'DRAFT' | 'READY') => {
    if (!context) return;
    if (!reason.trim()) return setError('Alasan retur wajib diisi.');
    if (selectedRows.length === 0) return setError('Isi qty minimal pada satu produk.');
    if (resolutionType === 'REPLACEMENT' && !expectedDate) return setError('Estimasi barang pengganti wajib diisi.');
    if (status === 'READY' && resolutionType === 'CURRENT_INVOICE_DEDUCTION' && returnTotal > context.outstandingAmount) {
      return setError('Nilai retur melebihi outstanding PI. Sesuaikan nilai atau pilih metode lain.');
    }
    const invalid = selectedRows.find((row) => {
      const unit = row.units.find((option) => option.productUnitId === row.productUnitId);
      return !unit || row.quantity * unit.conversionFactor > row.maxBaseQty + 0.000001;
    });
    if (invalid) return setError(`Qty ${invalid.productName} melebihi exact FIFO yang tersedia.`);
    const payload: SavePurchaseReturnPayload = {
      purchaseInvoiceId: context.purchaseInvoiceId,
      returnDate,
      expectedResolutionDate: expectedDate || undefined,
      resolutionType,
      status,
      reason: reason.trim(),
      note: note.trim() || undefined,
      items: selectedRows.map((row) => ({
        purchaseInvoiceDetailId: row.purchaseInvoiceDetailId,
        productUnitId: row.productUnitId,
        quantity: row.quantity,
        unitCost: row.unitCost,
      })),
    };
    setIsSaving(true);
    setError(null);
    try {
      if (editingReturnId) await purchasingApi.updatePurchaseReturn(editingReturnId, payload);
      else await purchasingApi.createPurchaseReturn(payload);
      await loadData();
      onChanged?.();
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const runAction = async (action: 'ready' | 'complete' | 'cancel') => {
    if (!selectedReturn) return;
    if (action === 'cancel' && !window.confirm('Batalkan Purchase Return ini? Inventory/FIFO akan dipulihkan bila barang sudah diambil.')) return;
    setIsSaving(true);
    setError(null);
    try {
      if (action === 'ready') await purchasingApi.markPurchaseReturnReady(selectedReturn.purchaseReturnId);
      if (action === 'cancel') await purchasingApi.cancelPurchaseReturn(selectedReturn.purchaseReturnId);
      if (action === 'complete') {
        if (selectedReturn.resolutionType === 'CASHBACK' && !financialAccountId) throw new Error('Pilih akun kas/bank penerima cashback.');
        if (selectedReturn.resolutionType === 'NEXT_INVOICE_DEDUCTION' && !appliedInvoiceId) throw new Error('Pilih PI tempat potongan diterapkan.');
        await purchasingApi.completePurchaseReturn(selectedReturn.purchaseReturnId, { financialAccountId: financialAccountId || undefined, paymentMethod: selectedReturn.resolutionType === 'CASHBACK' ? cashbackMethod : undefined, appliedPurchaseInvoiceId: appliedInvoiceId || undefined });
      }
      await loadData();
      onChanged?.();
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[60] flex max-h-[92vh] flex-col overflow-hidden rounded-xl border-slate-200 bg-white p-6 shadow-2xl"
        style={{ maxWidth: '96vw', width: '1200px' }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-black uppercase text-slate-800">
            <RotateCcw className="h-5 w-5 text-orange-600" /> Purchase Return {context ? `· ${context.purchaseInvoiceNumber}` : ''}
          </DialogTitle>
        </DialogHeader>

        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div>}
        {isLoading ? <div className="flex h-72 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div> : context && (
          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
            {view === 'history' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border bg-slate-50 p-4">
                  <div><p className="font-black text-slate-900">{context.supplierName}</p><p className="text-xs text-slate-500">{returns.length} Purchase Return aktif</p></div>
                  <Button onClick={openNew} className="bg-orange-600 font-bold text-white hover:bg-orange-700"><Plus className="mr-1 h-4 w-4" /> Buat Retur Lagi</Button>
                </div>
                {returns.length === 0 ? <div className="py-16 text-center text-sm text-slate-400">Belum ada Purchase Return.</div> : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {returns.map((item) => (
                      <button key={item.purchaseReturnId} onClick={() => void openDetail(item)} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-orange-300">
                        <div className="flex items-start justify-between"><strong>{item.purchaseReturnNumber}</strong><span className={`rounded px-2 py-1 text-[10px] font-black ${statusClass[item.status]}`}>{item.status}</span></div>
                        <p className="mt-2 text-xs font-bold text-orange-700">{resolutionLabels[item.resolutionType]}</p>
                        <div className="mt-3 flex justify-between text-sm"><span className="text-slate-500">Nilai Retur</span><strong>Rp {item.returnTotal.toLocaleString('id-ID')}</strong></div>
                        {item.status === 'READY' && item.expectedResolutionDate && <p className="mt-2 text-[11px] text-blue-700">Estimasi selesai: {item.expectedResolutionDate.slice(0, 10)}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === 'form' && (
              <div className="space-y-4">
                {returns.length > 0 && <Button variant="ghost" size="sm" onClick={() => setView('history')}><ArrowLeft className="mr-1 h-4 w-4" /> Riwayat</Button>}
                <div className="grid gap-3 rounded-xl border bg-slate-50 p-4 md:grid-cols-4">
                  <div><Label>Jenis Penyelesaian</Label><Select value={resolutionType} onValueChange={(value) => value && setResolutionType(value as PurchaseReturnResolutionType)}><SelectTrigger className="w-full bg-white"><SelectValue>{resolutionLabels[resolutionType]}</SelectValue></SelectTrigger><SelectContent className="bg-white">{Object.entries(resolutionLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label>Tanggal Retur</Label><Input type="date" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} /></div>
                  <div><Label>Estimasi Selesai</Label><Input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} disabled={resolutionType !== 'REPLACEMENT'} /></div>
                  <div><Label>Alasan</Label><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Rusak / salah kirim / lainnya" /></div>
                </div>
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[980px] text-xs">
                    <thead className="bg-slate-100 text-slate-600"><tr><th className="p-3 text-left">Produk</th><th className="p-3">Dibeli</th><th className="p-3">Maks. Bisa Diretur</th><th className="p-3">Unit Retur</th><th className="p-3">Qty</th><th className="p-3 text-right">Modal FIFO</th><th className="p-3 text-right">Nilai Retur</th><th className="p-3 text-right">Subtotal</th></tr></thead>
                    <tbody>{rows.map((row, index) => {
                      const unit = row.units.find((option) => option.productUnitId === row.productUnitId);
                      const fifoDisplay = (unit?.defaultReturnUnitCost ?? 0);
                      const adjusted = Math.abs(row.unitCost - fifoDisplay) > 0.009;
                      return <tr key={row.purchaseInvoiceDetailId} className="border-t"><td className="p-3 font-bold">{row.productName}</td><td className="p-3 text-center">{row.purchasedLabel}</td><td className="p-3 text-center">{unit ? `${(row.maxBaseQty / unit.conversionFactor).toLocaleString('id-ID')} ${unit.unitName}` : '-'}</td><td className="p-3"><Select value={row.productUnitId} onValueChange={(value) => updateUnit(index, value)}><SelectTrigger className="min-w-32"><SelectValue>{unit?.unitName ?? 'Pilih unit'}</SelectValue></SelectTrigger><SelectContent className="bg-white">{row.units.map((option) => <SelectItem key={option.productUnitId} value={option.productUnitId}>{option.unitName}</SelectItem>)}</SelectContent></Select></td><td className="p-3"><Input type="number" min="0" step="0.001" value={row.quantity || ''} onChange={(event) => setRows((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, quantity: Number(event.target.value) } : item))} className="w-24" /></td><td className="p-3 text-right font-semibold">Rp {fifoDisplay.toLocaleString('id-ID')}</td><td className="p-3"><div className="flex items-center justify-end gap-1"><Input type="number" min="0.01" value={row.unitCost || ''} onChange={(event) => setRows((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, unitCost: Number(event.target.value) } : item))} className="w-32 text-right" />{adjusted && <span className="rounded bg-violet-100 px-1.5 py-1 text-[9px] font-black text-violet-700">Disesuaikan</span>}</div></td><td className="p-3 text-right font-black">Rp {(row.quantity * row.unitCost).toLocaleString('id-ID')}</td></tr>;
                    })}</tbody>
                  </table>
                </div>
                <div className="grid gap-4 md:grid-cols-[1fr_300px]"><div><Label>Note SOP (Opsional)</Label><Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Contoh: cashback via transfer / potong manual pada faktur berikutnya" />{resolutionType === 'CURRENT_INVOICE_DEDUCTION' && <p className={`mt-2 text-xs font-bold ${returnTotal > context.outstandingAmount ? 'text-rose-600' : 'text-blue-700'}`}>Outstanding PI: Rp {context.outstandingAmount.toLocaleString('id-ID')}</p>}</div><div className="rounded-xl bg-slate-900 p-4 text-white"><p className="text-xs text-slate-300">Total Nilai Retur</p><p className="text-2xl font-black">Rp {returnTotal.toLocaleString('id-ID')}</p></div></div>
                <div className="flex justify-end gap-2"><Button variant="outline" disabled={isSaving} onClick={() => void save('DRAFT')}><Save className="mr-1 h-4 w-4" /> Simpan Draft</Button><Button disabled={isSaving} onClick={() => void save('READY')} className="bg-blue-600 font-bold text-white hover:bg-blue-700"><PackageCheck className="mr-1 h-4 w-4" /> Barang Diambil</Button></div>
              </div>
            )}

            {view === 'detail' && selectedReturn && (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setView('history')}><ArrowLeft className="mr-1 h-4 w-4" /> Riwayat Retur</Button>
                <div className="grid gap-3 rounded-xl border bg-slate-50 p-4 md:grid-cols-4"><div><span className="text-[10px] font-bold uppercase text-slate-400">Nomor</span><p className="font-black">{selectedReturn.purchaseReturnNumber}</p></div><div><span className="text-[10px] font-bold uppercase text-slate-400">Status</span><p className="font-black">{selectedReturn.status}</p></div><div><span className="text-[10px] font-bold uppercase text-slate-400">Penyelesaian</span><p className="font-black">{resolutionLabels[selectedReturn.resolutionType]}</p></div><div><span className="text-[10px] font-bold uppercase text-slate-400">Nilai</span><p className="font-black">Rp {selectedReturn.returnTotal.toLocaleString('id-ID')}</p></div></div>
                <div className="erp-scroll-table overflow-auto rounded-xl border"><table className="w-full min-w-[680px] text-xs"><thead className="bg-slate-100"><tr><th className="p-3 text-left">Produk</th><th className="p-3">Unit</th><th className="p-3">Qty</th><th className="p-3 text-right">Modal FIFO</th><th className="p-3 text-right">Nilai Retur</th><th className="p-3 text-right">Subtotal</th></tr></thead><tbody>{selectedReturn.details.map((detail) => <tr key={detail.purchaseReturnDetailId} className="border-t"><td className="p-3 font-bold">{detail.productName}</td><td className="p-3 text-center">{detail.unitName}</td><td className="p-3 text-center">{detail.quantity}</td><td className="p-3 text-right">Rp {(detail.fifoUnitCost * (detail.baseQuantity / detail.quantity)).toLocaleString('id-ID')}</td><td className="p-3 text-right">Rp {detail.unitCost.toLocaleString('id-ID')}</td><td className="p-3 text-right font-black">Rp {detail.subtotal.toLocaleString('id-ID')}</td></tr>)}</tbody></table></div>
                <div className="rounded-lg border p-3 text-sm"><strong>Alasan:</strong> {selectedReturn.reason}{selectedReturn.note && <p className="mt-1"><strong>Note SOP:</strong> {selectedReturn.note}</p>}</div>
                {selectedReturn.status === 'READY' && selectedReturn.resolutionType === 'CASHBACK' && <div className="grid max-w-2xl gap-3 md:grid-cols-2"><div><Label>Metode Cashback</Label><Select value={cashbackMethod} onValueChange={(value) => { if (value === 'CASH' || value === 'TRANSFER') { setCashbackMethod(value); setFinancialAccountId(''); } }}><SelectTrigger className="w-full"><SelectValue>{cashbackMethod === 'CASH' ? 'Tunai' : 'Transfer'}</SelectValue></SelectTrigger><SelectContent className="bg-white"><SelectItem value="CASH">Tunai</SelectItem><SelectItem value="TRANSFER">Transfer</SelectItem></SelectContent></Select></div><div><Label>Akun Penerima Cashback</Label><Select value={financialAccountId || null} onValueChange={(value) => setFinancialAccountId(value ?? '')}><SelectTrigger className="w-full"><SelectValue placeholder="Pilih kas/bank">{accounts.find((account) => account.financialAccountId === financialAccountId)?.accountName}</SelectValue></SelectTrigger><SelectContent className="bg-white">{accounts.map((account) => <SelectItem key={account.financialAccountId} value={account.financialAccountId}>{account.accountName} · {account.accountType}</SelectItem>)}</SelectContent></Select></div></div>}
                {selectedReturn.status === 'READY' && selectedReturn.resolutionType === 'NEXT_INVOICE_DEDUCTION' && <div className="max-w-md"><Label>Faktur Tempat Potongan Diterapkan</Label><Select value={appliedInvoiceId} onValueChange={(value) => setAppliedInvoiceId(value ?? '')}><SelectTrigger><SelectValue placeholder="Pilih PI berikutnya" /></SelectTrigger><SelectContent className="z-[100] bg-white">{invoiceOptions.map((invoice) => <SelectItem key={invoice.purchaseInvoiceId} value={invoice.purchaseInvoiceId}>{invoice.purchaseInvoiceNumber} · {invoice.invoiceDate.slice(0, 10)}</SelectItem>)}</SelectContent></Select></div>}
                <div className="flex flex-wrap justify-end gap-2">
                  {selectedReturn.status === 'DRAFT' && <Button variant="outline" onClick={() => openEdit(selectedReturn)}>Edit</Button>}
                  {selectedReturn.status === 'DRAFT' && <Button onClick={() => void runAction('ready')} className="bg-blue-600 text-white">Barang Diambil</Button>}
                  {selectedReturn.status === 'READY' && <Button onClick={() => void runAction('complete')} className="bg-emerald-600 text-white"><CheckCircle2 className="mr-1 h-4 w-4" />{selectedReturn.resolutionType === 'REPLACEMENT' ? 'Barang Pengganti Diterima' : selectedReturn.resolutionType === 'CASHBACK' ? 'Cashback Diterima' : 'Selesaikan'}</Button>}
                  {selectedReturn.status !== 'COMPLETED' && <Button variant="destructive" onClick={() => void runAction('cancel')}><XCircle className="mr-1 h-4 w-4" /> Batalkan</Button>}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
