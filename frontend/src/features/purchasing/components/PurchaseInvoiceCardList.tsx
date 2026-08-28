import { useState, useEffect, useCallback } from "react";
import { purchasingApi, type SupplierFinancialSummaryCard, type PurchaseInvoiceListItem, type PurchaseInvoiceFullDetail, type FinancialAccountOption } from "../purchasing.api";
import { systemConfigApi } from "@/features/system/system-configuration.api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogOverlay } from "@/components/ui/dialog";
import { Loader2, AlertTriangle, Eye, CreditCard, ArrowLeft, Building2, CheckCircle2, Clock, RefreshCw, Save, Printer, Receipt } from "lucide-react";
import { parseApiError } from "@/utils/error";

interface Props {
  onEditInvoice: (invoiceId: string) => void;
}

export default function PurchaseInvoiceCardList({ onEditInvoice }: Props) {
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierFinancialSummaryCard | null>(null);
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'COMPLETED'>('ACTIVE');
  
  const [summaries, setSummaries] = useState<SupplierFinancialSummaryCard[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoiceListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal Detail (Dilebarkan ke max-w-[1200px] agar sangat lega dan teks tidak turun)
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<PurchaseInvoiceFullDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Modal Pembayaran (Dilebarkan ke max-w-3xl)
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<PurchaseInvoiceListItem | null>(null);
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccountOption[]>([]);
  const [payAccountId, setPayAccountId] = useState("");
  const [payMethod, setPayMethod] = useState<'CASH' | 'TRANSFER'>('CASH');
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payRef, setPayRef] = useState("");
  const [isPaying, setIsPaying] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function initData() {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const [sumData, accData] = await Promise.all([
          purchasingApi.getSupplierSummaries(),
          purchasingApi.getFinancialAccounts()
        ]);
        if (isMounted) {
          setSummaries(sumData);
          setFinancialAccounts(accData);
        }
      } catch (err: unknown) {
        if (isMounted) setErrorMsg(parseApiError(err as Error));
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initData();
    return () => { isMounted = false; };
  }, []);

  const loadInvoices = useCallback(async (supplierId: string, tab: 'ACTIVE' | 'COMPLETED') => {
    setIsLoading(true); setErrorMsg(null);
    try {
      const data = await purchasingApi.getInvoices(supplierId, tab);
      setInvoices(data);
    } catch (err: unknown) {
      setErrorMsg(parseApiError(err as Error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSelectSupplier = (supp: SupplierFinancialSummaryCard) => {
    setSelectedSupplier(supp);
    loadInvoices(supp.supplierId, activeTab);
  };

  const handleTabChange = (tab: 'ACTIVE' | 'COMPLETED') => {
    setActiveTab(tab);
    if (selectedSupplier) {
      loadInvoices(selectedSupplier.supplierId, tab);
    }
  };

  const handleOpenDetail = async (invoiceId: string) => {
    setIsDetailLoading(true);
    setIsDetailOpen(true);
    try {
      const detail = await purchasingApi.getInvoiceDetail(invoiceId);
      setDetailData(detail);
    } catch (err: unknown) {
      setErrorMsg(parseApiError(err as Error));
      setIsDetailOpen(false);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleOpenPayment = async (inv: PurchaseInvoiceListItem) => {
    setPaymentTarget(inv);
    setPayAmount(inv.outstandingAmount);
    setPayAccountId("");
    setPayRef("");
    try {
      const detail = await purchasingApi.getInvoiceDetail(inv.purchaseInvoiceId);
      setDetailData(detail);
    } catch { /* ignore */ }
    setIsPaymentOpen(true);
  };

  const handleProcessPayment = async () => {
    if (!paymentTarget) return;
    if (!payAccountId) return setErrorMsg("Pilih Akun Kas/Bank tujuan pembayaran.");
    if (payAmount <= 0) return setErrorMsg("Nominal pembayaran harus lebih besar dari 0.");

    setIsPaying(true); setErrorMsg(null);
    try {
      await purchasingApi.addInvoicePayment(paymentTarget.purchaseInvoiceId, {
        financialAccountId: payAccountId,
        paymentAmount: payAmount,
        paymentMethod: payMethod,
        paymentDate: payDate,
        referenceNumber: payRef || undefined,
      });
      setIsPaymentOpen(false);
      if (selectedSupplier) {
        loadInvoices(selectedSupplier.supplierId, activeTab);
      }
      const sumData = await purchasingApi.getSupplierSummaries();
      setSummaries(sumData);
    } catch (err: unknown) {
      setErrorMsg(parseApiError(err as Error));
    } finally {
      setIsPaying(false);
    }
  };

  // CETAK STRUK KASIR TERMAL
  const handlePrintReceipt = async (invDetail: PurchaseInvoiceFullDetail) => {
    try {
      const configRes = await systemConfigApi.get();
      const cfg = configRes.data;
      const printDate = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

      const printWindow = window.open('', '_blank', 'width=400,height=600');
      if (!printWindow) return;

      printWindow.document.write(`
        <html>
          <head>
            <title>Struk Pembelian - ${invDetail.purchaseInvoiceNumber}</title>
            <style>
              @page { margin: 0; }
              body { font-family: 'Courier New', Courier, monospace; font-size: 11px; width: 58mm; margin: 0; padding: 6px; color: #000; background: #fff; }
              .center { text-align: center; }
              .bold { font-weight: bold; }
              .line { border-bottom: 1px dashed #000; margin: 5px 0; }
              .solid-line { border-bottom: 1px solid #000; margin: 5px 0; }
              table { width: 100%; border-collapse: collapse; font-size: 10px; }
              th, td { text-align: left; padding: 2px 0; vertical-align: top; }
              .right { text-align: right; }
              .item-name { word-break: break-word; font-weight: bold; }
            </style>
          </head>
          <body>
            ${cfg.logoBase64 ? `<div class="center"><img src="${cfg.logoBase64}" style="max-height: 40px; filter: grayscale(100%); contrast: 150%;" /></div>` : ''}
            <div class="center bold" style="font-size: 13px; margin-top: 4px;">${cfg.companyName}</div>
            <div class="center">${cfg.address}</div>
            <div class="center">Telp: ${cfg.phone}</div>
            ${cfg.receiptHeader1 ? `<div class="center" style="margin-top: 2px;">${cfg.receiptHeader1}</div>` : ''}
            <div class="line"></div>
            <div>No. Faktur : ${invDetail.purchaseInvoiceNumber}</div>
            <div>Supplier   : ${invDetail.supplierName}</div>
            <div>Tgl Terima : ${invDetail.invoiceDate.slice(0, 10)}</div>
            <div class="solid-line"></div>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th class="right">Qty</th>
                  <th class="right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${invDetail.details.map(d => `
                  <tr>
                    <td colspan="3" class="item-name">${d.productName} (${d.unitName})</td>
                  </tr>
                  <tr>
                    <td></td>
                    <td class="right">${d.quantity}x</td>
                    <td class="right">${d.subtotal.toLocaleString('id-ID')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="solid-line"></div>
            <div style="display: flex; justify-content: space-between;"><span>Diskon:</span> <span>Rp ${invDetail.discountAmount.toLocaleString('id-ID')}</span></div>
            <div style="display: flex; justify-content: space-between;" class="bold font-size: 12px;"><span>GRAND TOTAL:</span> <span>Rp ${invDetail.invoiceTotal.toLocaleString('id-ID')}</span></div>
            <div style="display: flex; justify-content: space-between;"><span>Sudah Bayar:</span> <span>Rp ${invDetail.paidAmount.toLocaleString('id-ID')}</span></div>
            <div style="display: flex; justify-content: space-between;" class="bold"><span>Sisa Hutang:</span> <span>Rp ${invDetail.outstandingAmount.toLocaleString('id-ID')}</span></div>
            <div class="line"></div>
            <div class="center">${cfg.receiptFooter1 || 'Terima Kasih atas Kerjasama Anda'}</div>
            <div class="center" style="font-size: 9px; margin-top: 6px; color: #555;">Dicetak: ${printDate}</div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 300);
    } catch {
      alert("Gagal mencetak struk térmal.");
    }
  };

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
      
      <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          {selectedSupplier && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedSupplier(null)} className="h-8 px-2 text-slate-600 hover:bg-slate-100">
              <ArrowLeft className="w-4 h-4 mr-1"/> Kembali ke List Supplier
            </Button>
          )}
          <h2 className="text-base font-black text-slate-800 uppercase tracking-wide">
            {selectedSupplier ? `Tagihan: ${selectedSupplier.supplierName}` : 'Command Center - Supplier Financial Summary'}
          </h2>
        </div>
        <Button variant="outline" size="sm" onClick={async () => {
          if (selectedSupplier) loadInvoices(selectedSupplier.supplierId, activeTab);
          const sumData = await purchasingApi.getSupplierSummaries();
          setSummaries(sumData);
        }} className="h-8 text-xs font-bold text-slate-600 border-slate-300">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5"/> Refresh Data
        </Button>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-rose-50 text-rose-700 text-sm font-bold border border-rose-200 rounded flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-5 h-5 shrink-0"/> <span>{errorMsg}</span>
        </div>
      )}

      {/* LEVEL 1: SUPPLIER CARDS */}
      {!selectedSupplier ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
          {isLoading ? (
            <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-[#326dc8]"/></div>
          ) : summaries.length === 0 ? (
            <div className="text-center py-16 text-slate-400 font-medium text-sm">Tidak ada tagihan aktif atau outstanding dari supplier saat ini.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {summaries.map(supp => (
                <div 
                  key={supp.supplierId} 
                  onClick={() => handleSelectSupplier(supp)}
                  className="bg-gradient-to-br from-white to-slate-50 border border-slate-200 hover:border-[#326dc8] rounded-xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div className="p-2 bg-blue-50 text-[#326dc8] rounded-lg group-hover:bg-[#326dc8] group-hover:text-white transition-colors">
                        <Building2 className="w-5 h-5"/>
                      </div>
                      <span className="text-[10px] font-black uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        {supp.activeInvoiceCount} Dokumen Aktif
                      </span>
                    </div>
                    <h3 className="font-extrabold text-slate-800 text-sm mb-1 truncate">{supp.supplierName}</h3>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-500 font-bold">Total Outstanding:</span>
                      <span className="font-extrabold text-rose-600">Rp {supp.outstandingAmount.toLocaleString('id-ID')}</span>
                    </div>
                    {supp.overdueAmount > 0 && (
                      <div className="flex justify-between text-[11px] text-rose-500 font-bold bg-rose-50 px-1.5 py-0.5 rounded">
                        <span>Jatuh Tempo:</span>
                        <span>Rp {supp.overdueAmount.toLocaleString('id-ID')}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* LEVEL 2: INVOICE CARDS KECIL */
        <div className="flex-1 flex flex-col overflow-hidden">
          
          <div className="flex gap-2 mb-4 shrink-0 border-b border-slate-200 pb-3">
            <button 
              onClick={() => handleTabChange('ACTIVE')} 
              className={`px-4 py-2 text-xs font-black uppercase rounded-lg transition-all flex items-center gap-2 ${activeTab === 'ACTIVE' ? 'bg-[#326dc8] text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <Clock className="w-4 h-4"/> Tagihan Aktif & Draft (Belum Lunas)
            </button>
            <button 
              onClick={() => handleTabChange('COMPLETED')} 
              className={`px-4 py-2 text-xs font-black uppercase rounded-lg transition-all flex items-center gap-2 ${activeTab === 'COMPLETED' ? 'bg-emerald-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <CheckCircle2 className="w-4 h-4"/> Riwayat Selesai (Lunas)
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
            {isLoading ? (
              <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-[#326dc8]"/></div>
            ) : invoices.length === 0 ? (
              <div className="text-center py-16 text-slate-400 font-medium text-sm">Tidak ada dokumen ditemukan pada kategori ini.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {invoices.map(inv => {
                  const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date() && inv.statusPayment !== 'PAID' && inv.status === 'COMPLETED';

                  return (
                    <div 
                      key={inv.purchaseInvoiceId}
                      className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 shadow-sm ${
                        isOverdue 
                          ? 'bg-rose-50/70 border-rose-300' 
                          : inv.status === 'DRAFT' 
                          ? 'bg-amber-50/50 border-amber-300' 
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <span className="font-black text-sm text-slate-900">{inv.purchaseInvoiceNumber}</span>
                          <div className="flex gap-1">
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${
                              inv.status === 'DRAFT' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {inv.status}
                            </span>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${
                              inv.statusPayment === 'PAID' ? 'bg-emerald-600 text-white' : inv.statusPayment === 'PARTIAL' ? 'bg-blue-600 text-white' : 'bg-rose-600 text-white'
                            }`}>
                              {inv.statusPayment}
                            </span>
                          </div>
                        </div>

                        {isOverdue && (
                          <div className="mb-2 text-[9px] font-black bg-rose-600 text-white px-2 py-0.5 rounded uppercase text-center animate-pulse">
                            ⚠️ OVERDUE (Jatuh Tempo)
                          </div>
                        )}

                        <div className="space-y-1 text-xs text-slate-600 bg-white/70 p-2.5 rounded-lg border border-slate-100">
                          <div className="flex justify-between">
                            <span className="text-slate-400 font-semibold">Tgl Faktur:</span>
                            <span className="font-bold">{inv.invoiceDate.slice(0, 10)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400 font-semibold">Jatuh Tempo:</span>
                            <span className={`font-bold ${isOverdue ? 'text-rose-600' : ''}`}>{inv.dueDate ? inv.dueDate.slice(0, 10) : 'Cash'}</span>
                          </div>
                          <div className="flex justify-between border-t border-slate-100 pt-1 mt-1">
                            <span className="text-slate-400 font-semibold">Grand Total:</span>
                            <span className="font-black text-slate-900">Rp {inv.invoiceTotal.toLocaleString('id-ID')}</span>
                          </div>
                          {inv.outstandingAmount > 0 && (
                            <div className="flex justify-between text-rose-600 font-extrabold">
                              <span>Sisa Hutang:</span>
                              <span>Rp {inv.outstandingAmount.toLocaleString('id-ID')}</span>
                            </div>
                          )}
                        </div>

                        {inv.note && (
                          <p className="text-[11px] text-slate-500 italic mt-2 truncate"><b>Catatan:</b> {inv.note}</p>
                        )}
                      </div>

                      <div className="flex justify-end items-center gap-1.5 pt-2 border-t border-slate-100">
                        <Button variant="outline" size="sm" onClick={() => handleOpenDetail(inv.purchaseInvoiceId)} className="h-7 text-[11px] font-bold border-slate-300 px-2.5">
                          <Eye className="w-3 h-3 mr-1"/> Detail
                        </Button>

                        {inv.status === 'DRAFT' && (
                          <Button size="sm" onClick={() => onEditInvoice(inv.purchaseInvoiceId)} className="h-7 text-[11px] font-bold bg-[#326dc8] hover:bg-blue-700 text-white px-2.5">
                            Edit
                          </Button>
                        )}

                        {inv.status === 'COMPLETED' && inv.statusPayment !== 'PAID' && (
                          <Button size="sm" onClick={() => handleOpenPayment(inv)} className="h-7 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5">
                            <CreditCard className="w-3 h-3 mr-1"/> Bayar
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* LEVEL 3: MODAL DETAIL (Dilebarkan ke max-w-[1200px] dengan info header 4 kolom sejajar tanpa turun) */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
  <DialogOverlay className="bg-black/50 z-50 fixed inset-0" />
  <DialogContent 
    className="bg-white z-[60] shadow-2xl border-slate-200 p-6 flex flex-col max-h-[92vh] overflow-hidden rounded-xl"
    style={{ maxWidth: '100vw', width: '1000px' }}
  >
    <DialogHeader>
      <DialogTitle className="text-base font-black uppercase text-slate-800 flex items-center justify-between">
        <span>Detail Purchase Invoice: {detailData?.purchaseInvoiceNumber}</span>
        <span className="text-xs font-bold text-slate-500">Status Dokumen: {detailData?.status}</span>
      </DialogTitle>
    </DialogHeader>

          {isDetailLoading || !detailData ? (
            <div className="flex justify-center items-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#326dc8]"/></div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-6 pr-1 custom-scrollbar text-xs">
              
              {/* Header Info Sejajar 4 Kolom, Tidak Akan Turun / Menumpuk */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm items-center">
                <div className="truncate"><span className="text-slate-400 block font-bold uppercase text-[10px]">Supplier</span> <strong className="text-slate-800 text-sm truncate block">{detailData.supplierName}</strong></div>
                <div><span className="text-slate-400 block font-bold uppercase text-[10px]">Tgl Faktur</span> <strong className="text-slate-800 text-sm">{detailData.invoiceDate.slice(0, 10)}</strong></div>
                <div><span className="text-slate-400 block font-bold uppercase text-[10px]">Jatuh Tempo</span> <strong className="text-rose-600 text-sm">{detailData.dueDate ? detailData.dueDate.slice(0, 10) : 'Cash'}</strong></div>
                <div><span className="text-slate-400 block font-bold uppercase text-[10px]">Status Pembayaran</span> <strong className="text-emerald-700 text-sm">{detailData.statusPayment}</strong></div>
              </div>

              {/* TABEL BARANG (Dilengkapi Scroll Max-Height untuk Menangani Banyak Produk) */}
              <div>
                <h4 className="font-extrabold text-slate-700 uppercase mb-2">Daftar Barang Diterima ({detailData.details.length} Item)</h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[260px] overflow-y-auto custom-scrollbar shadow-inner bg-white">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10 shadow-xs">
                      <tr>
                        <th className="p-3 font-bold text-slate-600 w-12 text-center">No</th>
                        <th className="p-3 font-bold text-slate-600">Produk</th>
                        <th className="p-3 font-bold text-slate-600 w-36">Satuan</th>
                        <th className="p-3 font-bold text-slate-600 text-center w-28">Qty</th>
                        <th className="p-3 font-bold text-slate-600 text-right w-44">Harga Satuan (Rp)</th>
                        <th className="p-3 font-bold text-slate-600 text-right w-48">Subtotal (Rp)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.details.map((d, i) => (
                        <tr key={d.purchaseInvoiceDetailId} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-3 text-slate-400 text-center font-bold">{i + 1}</td>
                          <td className="p-3 font-bold text-slate-800">{d.productName}</td>
                          <td className="p-3">{d.unitName}</td>
                          <td className="p-3 text-center font-bold text-[#326dc8]">{d.quantity}</td>
                          <td className="p-3 text-right">{d.unitCost.toLocaleString('id-ID')}</td>
                          <td className="p-3 text-right font-extrabold">{d.subtotal.toLocaleString('id-ID')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* HISTORI PEMBAYARAN KAS / BANK (Dilengkapi Scroll Max-Height untuk Menangani Banyak Riwayat) */}
              <div>
                <h4 className="font-extrabold text-slate-700 uppercase mb-2 flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-emerald-600"/> Histori Pembayaran Kas / Bank ({detailData.payments.length} Transaksi)
                </h4>
                {detailData.payments.length === 0 ? (
                  <p className="text-slate-400 italic bg-slate-50 p-3 rounded border text-center">Belum ada riwayat pembayaran yang dicatat.</p>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[220px] overflow-y-auto custom-scrollbar shadow-inner bg-white">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-emerald-50 border-b border-emerald-200 text-emerald-800 sticky top-0 z-10 shadow-xs">
                        <tr>
                          <th className="p-3 font-bold">Tanggal Bayar</th>
                          <th className="p-3 font-bold">Akun Kas / Bank</th>
                          <th className="p-3 font-bold">Metode</th>
                          <th className="p-3 font-bold">No. Ref / Bukti</th>
                          <th className="p-3 font-bold text-right">Nominal (Rp)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailData.payments.map(p => (
                          <tr key={p.purchasePaymentId} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="p-3">{p.paymentDate.slice(0, 10)}</td>
                            <td className="p-3 font-bold">{p.accountName}</td>
                            <td className="p-3 uppercase font-medium">{p.paymentMethod}</td>
                            <td className="p-3 text-slate-500">{p.referenceNumber || '-'}</td>
                            <td className="p-3 text-right font-extrabold text-emerald-600">Rp {p.paymentAmount.toLocaleString('id-ID')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* SUMMARY TOTAL */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex justify-end shadow-sm">
                <div className="w-80 space-y-2">
                  <div className="flex justify-between text-slate-500"><span>Diskon Global:</span> <span>Rp {detailData.discountAmount.toLocaleString('id-ID')}</span></div>
                  <div className="flex justify-between text-slate-800 font-extrabold text-sm border-t border-slate-200 pt-1.5"><span>Grand Total:</span> <span>Rp {detailData.invoiceTotal.toLocaleString('id-ID')}</span></div>
                  <div className="flex justify-between text-emerald-700 font-bold"><span>Total Dibayar:</span> <span>Rp {detailData.paidAmount.toLocaleString('id-ID')}</span></div>
                  <div className="flex justify-between text-rose-600 font-bold text-sm border-t border-slate-200 pt-1.5"><span>Sisa Hutang:</span> <span>Rp {detailData.outstandingAmount.toLocaleString('id-ID')}</span></div>
                </div>
              </div>

            </div>
          )}

          <DialogFooter className="mt-4 flex justify-between items-center w-full shrink-0 pt-2 border-t border-slate-100">
            <Button variant="outline" onClick={() => detailData && handlePrintReceipt(detailData)} className="h-9 text-xs font-bold text-slate-700 border-slate-300">
              <Printer className="w-4 h-4 mr-1.5"/> Cetak Struk Kasir
            </Button>
            <Button variant="outline" onClick={() => setIsDetailOpen(false)} className="h-9 text-xs px-6">Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* POPUP BAYAR TAGIHAN (Dilebarkan ke max-w-3xl agar lebih lapang dan ringkas 1 line) */}
      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
  <DialogOverlay className="bg-black/50 z-50 fixed inset-0" />
  <DialogContent 
    className="bg-white z-[60] shadow-2xl border-slate-200 p-6 flex flex-col rounded-xl"
    style={{ maxWidth: '90vw', width: '750px' }}
  >
    <DialogHeader>
      <DialogTitle className="text-sm font-black uppercase text-slate-800">
        Pelunasan / Bayar Tagihan: {paymentTarget?.purchaseInvoiceNumber}
      </DialogTitle>
    </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-amber-900 font-bold flex justify-between items-center">
              <span>Sisa Hutang Saat Ini:</span>
              <span className="text-rose-600 text-base font-black">Rp {paymentTarget?.outstandingAmount.toLocaleString('id-ID')}</span>
            </div>

            {/* Riwayat Pembayaran Sebelumnya (Ditampilkan dalam format 1 Baris per transaksi) */}
            {detailData && detailData.payments.length > 0 && (
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1.5">
                <span className="font-bold text-slate-700 block mb-1 uppercase text-[10px]">Histori Pembayaran Sebelumnya:</span>
                {detailData.payments.map(cp => (
                  <div key={cp.purchasePaymentId} className="flex justify-between items-center text-slate-700 bg-white px-3 py-1.5 rounded border border-slate-200 shadow-2xs">
                    <span className="font-semibold">📅 {cp.paymentDate.slice(0, 10)} &bull; 🏦 {cp.accountName} ({cp.paymentMethod}) {cp.referenceNumber ? `[Ref: ${cp.referenceNumber}]` : ''}</span>
                    <span className="font-black text-emerald-600">Rp {cp.paymentAmount.toLocaleString('id-ID')}</span>
                  </div>
                ))}
              </div>
            )}

            <div>
              <Label className="font-bold text-slate-600 uppercase text-[10px]">Pilih Akun Kas / Bank Tujuan (Dari Database) *</Label>
              <Select value={payAccountId || undefined} onValueChange={(val) => setPayAccountId(val || "")}>
                <SelectTrigger className="h-10 text-xs font-bold bg-[#fff8e1] border-amber-300 mt-1">
                  <SelectValue placeholder="-- Klik di sini untuk pilih sumber dana --">
                    {financialAccounts.find(a => a.financialAccountId === payAccountId)?.accountName}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-white z-[70] border border-slate-200 shadow-2xl max-h-60">
                  {financialAccounts.map(a => (
                    <SelectItem key={a.financialAccountId} value={a.financialAccountId} className="text-xs cursor-pointer py-2">
                      {a.accountName} (Saldo: Rp {a.currentBalance.toLocaleString('id-ID')})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="font-bold text-slate-600 uppercase text-[10px]">Metode Bayar</Label>
                <Select value={payMethod} onValueChange={(v) => { if (v === 'CASH' || v === 'TRANSFER') setPayMethod(v); }}>
                  <SelectTrigger className="h-9 text-xs font-bold bg-slate-50 mt-1"><SelectValue/></SelectTrigger>
                  <SelectContent className="bg-white z-[70] border border-slate-200 shadow-2xl">
                    <SelectItem value="CASH" className="text-xs cursor-pointer">CASH</SelectItem>
                    <SelectItem value="TRANSFER" className="text-xs cursor-pointer">TRANSFER</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="font-bold text-slate-600 uppercase text-[10px]">Tanggal Pembayaran</Label>
                <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="h-9 text-xs font-bold mt-1"/>
              </div>
            </div>

            <div>
              <Label className="font-bold text-slate-600 uppercase text-[10px]">Nominal Pembayaran (Rp) *</Label>
              <Input type="number" min="1" value={payAmount || ''} onChange={e => setPayAmount(parseFloat(e.target.value) || 0)} className="h-9 text-xs font-bold text-emerald-700 bg-emerald-50 border-emerald-300 mt-1"/>
            </div>

            <div>
              <Label className="font-bold text-slate-600 uppercase text-[10px]">Nomor Referensi / Bukti Transfer / Catatan</Label>
              <Input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="Contoh: No. Ref Transfer Bank..." className="h-9 text-xs mt-1"/>
            </div>
          </div>

          <DialogFooter className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => setIsPaymentOpen(false)} className="h-9 text-xs">Batal</Button>
            <Button onClick={handleProcessPayment} disabled={isPaying} className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 shadow">
              {isPaying ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <Save className="w-4 h-4 mr-2"/>} Simpan Pembayaran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}