import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Edit2,
  Eye,
  FileCheck,
  Loader2,
  Printer,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { systemConfigApi } from '@/features/system/system-configuration.api';
import { parseApiError } from '@/utils/error';
import {
  purchasingApi,
  type PurchaseOrderFullDetail,
  type PurchaseOrderListItem,
  type PurchasePaginationMeta,
  type PurchaseInvoiceFullDetail,
} from '../purchasing.api';
import PurchaseInvoiceDetailDialog from './PurchaseInvoiceDetailDialog';

interface Props {
  onEditOrder: (purchaseOrderId: string) => void;
}

const EMPTY_META: PurchasePaginationMeta = {
  currentPage: 1,
  pageSize: 20,
  totalData: 0,
  totalPage: 0,
};

function formatDate(value?: string | null): string {
  return value ? value.slice(0, 10) : '-';
}

function getArrivalInfo(order: PurchaseOrderListItem): {
  label: string;
  overdue: boolean;
} {
  if (!order.expectedDate) {
    return { label: 'Tanggal kedatangan belum ditentukan', overdue: false };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expected = new Date(order.expectedDate);
  expected.setHours(0, 0, 0, 0);
  const dayDifference = Math.round(
    (expected.getTime() - today.getTime()) / 86_400_000,
  );

  if (dayDifference === 0) {
    return { label: 'Barang diperkirakan datang hari ini', overdue: false };
  }
  if (dayDifference < 0) {
    return {
      label: `Terlambat ${Math.abs(dayDifference)} hari`,
      overdue: true,
    };
  }
  return {
    label: `Estimasi datang ${dayDifference} hari lagi`,
    overdue: false,
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export default function PurchaseOrderCardList({ onEditOrder }: Props) {
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');
  const [orders, setOrders] = useState<PurchaseOrderListItem[]>([]);
  const [meta, setMeta] = useState<PurchasePaginationMeta>(EMPTY_META);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detail, setDetail] = useState<PurchaseOrderFullDetail | null>(null);
  const [relatedInvoice, setRelatedInvoice] = useState<PurchaseInvoiceFullDetail | null>(null);
  const [isInvoiceDetailOpen, setIsInvoiceDetailOpen] = useState(false);
  const [isInvoiceDetailLoading, setIsInvoiceDetailLoading] = useState(false);

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const response = await purchasingApi.getOrders(activeTab, page, limit);
      setOrders(response.data);
      setMeta(response.meta);
      if (response.meta.totalPage > 0 && page > response.meta.totalPage) {
        setPage(response.meta.totalPage);
      }
    } catch (error: unknown) {
      setErrorMsg(parseApiError(error));
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, limit, page]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadOrders();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadOrders]);

  const openDetail = async (purchaseOrderId: string) => {
    setIsDetailOpen(true);
    setIsDetailLoading(true);
    setDetail(null);
    try {
      setDetail(await purchasingApi.getOrderDetail(purchaseOrderId));
    } catch (error: unknown) {
      setErrorMsg(parseApiError(error));
      setIsDetailOpen(false);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const openRelatedInvoice = async (purchaseInvoiceId: string) => {
    setIsDetailOpen(false);
    setIsInvoiceDetailOpen(true);
    setIsInvoiceDetailLoading(true);
    setRelatedInvoice(null);
    try {
      setRelatedInvoice(await purchasingApi.getInvoiceDetail(purchaseInvoiceId));
    } catch (error: unknown) {
      setErrorMsg(parseApiError(error));
      setIsInvoiceDetailOpen(false);
    } finally {
      setIsInvoiceDetailLoading(false);
    }
  };

  const printOrder = async (order: PurchaseOrderFullDetail) => {
    try {
      const configResponse = await systemConfigApi.get();
      const config = configResponse.data;
      const printWindow = window.open('', '_blank', 'width=420,height=700');
      if (!printWindow) return;

      printWindow.document.write(`
        <html><head><title>Purchase Order - ${escapeHtml(order.purchaseOrderNumber)}</title>
        <style>
          @page { margin: 0; } body { font-family: 'Courier New', monospace; font-size: 11px; width: 80mm; margin: 0; padding: 8px; color: #000; }
          .center { text-align: center; } .bold { font-weight: bold; } .right { text-align: right; }
          .line { border-bottom: 1px dashed #000; margin: 6px 0; } table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th, td { padding: 3px 1px; vertical-align: top; text-align: left; } .item { font-weight: bold; word-break: break-word; }
        </style></head><body>
          ${config.logoBase64 ? `<div class="center"><img src="${escapeHtml(config.logoBase64)}" style="max-height:42px" /></div>` : ''}
          <div class="center bold" style="font-size:14px">${escapeHtml(config.companyName)}</div>
          <div class="center">${escapeHtml(config.address)}</div><div class="center">Telp: ${escapeHtml(config.phone)}</div>
          <div class="line"></div><div class="center bold">PURCHASE ORDER</div><div class="line"></div>
          <div>No. PO&nbsp;&nbsp;&nbsp;&nbsp;: ${escapeHtml(order.purchaseOrderNumber)}</div>
          <div>Supplier&nbsp;&nbsp;: ${escapeHtml(order.supplierName)}</div>
          <div>Tgl Order&nbsp;: ${escapeHtml(formatDate(order.orderDate))}</div>
          <div>Estimasi&nbsp;&nbsp;: ${escapeHtml(formatDate(order.expectedDate))}</div>
          <div>Status&nbsp;&nbsp;&nbsp;&nbsp;: ${escapeHtml(order.status)}</div><div class="line"></div>
          <table><thead><tr><th>Barang</th><th class="right">Qty</th></tr></thead><tbody>
          ${order.details
            .map(
              (item) => `<tr><td class="item">${escapeHtml(item.productName)} (${escapeHtml(item.unitName)})</td><td class="right">${escapeHtml(item.quantity)}</td></tr>`,
            )
            .join('')}
          </tbody></table><div class="line"></div>
          <div>Total jenis item: ${order.totalItem}</div><div>Total quantity: ${order.totalQuantity}</div>
          ${order.note ? `<div>Catatan: ${escapeHtml(order.note)}</div>` : ''}
          <div class="line"></div><div class="center">HANYA UNTUK TOKO</div>
          <div class="center" style="font-size:9px;margin-top:6px">Dicetak: ${escapeHtml(new Date().toLocaleString('id-ID'))}</div>
        </body></html>`,
      );
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 300);
    } catch {
      setErrorMsg('Gagal menyiapkan cetak Purchase Order.');
    }
  };

  return (
    <section className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-base font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-amber-500" /> Purchase Order Monitoring
          </h2>
          <p className="text-xs text-slate-500 mt-1">PO aktif diurutkan berdasarkan estimasi kedatangan terdekat.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadOrders()} className="h-8 text-xs font-bold">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh PO
        </Button>
      </div>

      {errorMsg && <div className="mb-4 p-3 bg-rose-50 text-rose-700 text-sm font-bold border border-rose-200 rounded flex items-center gap-2"><AlertTriangle className="w-5 h-5" />{errorMsg}</div>}

      <div className="flex flex-wrap justify-between gap-3 mb-4">
        <div className="flex gap-2">
          <button onClick={() => { setActiveTab('ACTIVE'); setPage(1); }} className={`px-4 py-2 text-xs font-black uppercase rounded-lg flex items-center gap-2 ${activeTab === 'ACTIVE' ? 'bg-[#326dc8] text-white shadow' : 'bg-slate-100 text-slate-600'}`}>
            <CalendarClock className="w-4 h-4" /> PO Belum Selesai
          </button>
          <button onClick={() => { setActiveTab('HISTORY'); setPage(1); }} className={`px-4 py-2 text-xs font-black uppercase rounded-lg flex items-center gap-2 ${activeTab === 'HISTORY' ? 'bg-slate-600 text-white shadow' : 'bg-slate-100 text-slate-600'}`}>
            <CheckCircle2 className="w-4 h-4" /> Riwayat Completed / Cancelled
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <span>Tampilkan:</span>
          <Select value={String(limit)} onValueChange={(value) => { setLimit(Number(value)); setPage(1); }}>
            <SelectTrigger className="w-[80px] bg-white"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white z-50"><SelectItem value="20">20</SelectItem><SelectItem value="30">30</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem></SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? <div className="h-48 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#326dc8]" /></div> : orders.length === 0 ? <div className="text-center py-12 text-sm text-slate-400">Tidak ada Purchase Order pada kategori ini.</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {orders.map((order) => {
            const arrival = getArrivalInfo(order);
            const history = order.status === 'COMPLETED' || order.status === 'CANCELLED';
            return <article key={order.purchaseOrderId} className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between gap-3 ${history ? 'bg-slate-100 border-slate-300 text-slate-600' : arrival.overdue ? 'bg-rose-50 border-rose-300' : order.status === 'DRAFT' ? 'bg-amber-50 border-amber-300' : 'bg-blue-50 border-blue-300'}`}>
              <div>
                <div className="flex justify-between items-start gap-2 mb-2"><span className="font-black text-sm text-slate-900">{order.purchaseOrderNumber}</span><span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${order.status === 'CANCELLED' ? 'bg-rose-200 text-rose-800' : history ? 'bg-slate-300 text-slate-700' : order.status === 'READY' ? 'bg-blue-600 text-white' : 'bg-amber-200 text-amber-800'}`}>{order.status}</span></div>
                <div className="font-extrabold text-sm text-slate-800 mb-2">Supplier: {order.supplierName}</div>
                <div className="space-y-1 text-xs bg-white/70 p-2.5 rounded-lg border border-white">
                  <div className="flex justify-between"><span className="text-slate-400 font-semibold">Tanggal PO:</span><span className="font-bold">{formatDate(order.orderDate)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400 font-semibold">Estimasi Datang:</span><span className="font-bold">{formatDate(order.expectedDate)}</span></div>
                  {!history && <div className={`font-extrabold text-center mt-2 px-2 py-1 rounded ${arrival.overdue ? 'bg-rose-600 text-white' : 'bg-blue-100 text-blue-800'}`}>{arrival.label}</div>}
                  <div className="flex justify-between border-t border-slate-100 pt-1"><span className="text-slate-400 font-semibold">Item / Total Qty:</span><span className="font-black">{order.totalItem} / {order.totalQuantity}</span></div>
                </div>
                {order.note && <p className="text-[11px] mt-2 italic truncate"><b>Catatan:</b> {order.note}</p>}
              </div>
              <div className="flex justify-end gap-1.5 pt-2 border-t border-slate-200">
                <Button variant="outline" size="sm" onClick={() => void openDetail(order.purchaseOrderId)} className="h-7 text-[11px] font-bold"><Eye className="w-3 h-3 mr-1" />Detail</Button>
                {!history && <Button size="sm" onClick={() => onEditOrder(order.purchaseOrderId)} className="h-7 text-[11px] font-bold bg-[#326dc8] text-white"><Edit2 className="w-3 h-3 mr-1" />Edit</Button>}
              </div>
            </article>;
          })}
        </div>
      )}

      {meta.totalData > 0 && <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap justify-between items-center gap-2 text-sm"><span className="text-slate-500">Menampilkan {orders.length} dari {meta.totalData} PO · Halaman {meta.currentPage} dari {Math.max(meta.totalPage, 1)}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={meta.currentPage <= 1 || isLoading} onClick={() => setPage((value) => value - 1)}>Prev</Button><Button variant="outline" size="sm" disabled={meta.currentPage >= meta.totalPage || isLoading} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>}

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}><DialogOverlay className="bg-black/50 z-50 fixed inset-0" /><DialogContent className="bg-white z-[60] shadow-2xl border-slate-200 p-6 flex flex-col max-h-[92vh] overflow-hidden rounded-xl" style={{ maxWidth: '100vw', width: '1000px' }}><DialogHeader><DialogTitle className="text-base font-black uppercase flex justify-between"><span>Detail Purchase Order: {detail?.purchaseOrderNumber}</span><span className="text-xs text-slate-500">{detail?.status}</span></DialogTitle></DialogHeader>
        {isDetailLoading || !detail ? <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#326dc8]" /></div> : <div className="flex-1 overflow-y-auto space-y-5 pr-1 text-xs">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border"><div><span className="block text-[10px] uppercase text-slate-400 font-bold">Supplier</span><strong>{detail.supplierName}</strong></div><div><span className="block text-[10px] uppercase text-slate-400 font-bold">Tanggal PO</span><strong>{formatDate(detail.orderDate)}</strong></div><div><span className="block text-[10px] uppercase text-slate-400 font-bold">Estimasi Datang</span><strong>{formatDate(detail.expectedDate)}</strong></div><div><span className="block text-[10px] uppercase text-slate-400 font-bold">Status</span><strong>{detail.status}</strong></div></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-blue-50 p-4 rounded-xl border border-blue-100"><div><b>Kontak Supplier:</b> {detail.supplierPhone || '-'} · {detail.supplierEmail || '-'}</div><div><b>PIC:</b> {detail.supplierPicName || '-'}</div><div className="md:col-span-2"><b>Alamat:</b> {detail.supplierAddress || '-'}</div></div>
          <div className="border rounded-lg overflow-auto max-h-[300px]"><table className="w-full text-left"><thead className="bg-slate-100 sticky top-0"><tr><th className="p-3">No</th><th className="p-3">Produk</th><th className="p-3">Satuan</th><th className="p-3 text-right">Quantity</th><th className="p-3">Catatan</th></tr></thead><tbody>{detail.details.map((item, index) => <tr key={item.purchaseOrderDetailId} className="border-t"><td className="p-3">{index + 1}</td><td className="p-3 font-bold">{item.productName}</td><td className="p-3">{item.unitName}</td><td className="p-3 text-right font-bold">{item.quantity}</td><td className="p-3">{item.note || '-'}</td></tr>)}</tbody></table></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div className="bg-slate-50 border rounded-lg p-3"><b>Dibuat oleh:</b> {detail.createdByName}<br/><b>Dibuat:</b> {new Date(detail.createdAt).toLocaleString('id-ID')}<br/><b>Diubah oleh:</b> {detail.updatedByName || '-'}<br/><b>Diubah:</b> {detail.updatedAt ? new Date(detail.updatedAt).toLocaleString('id-ID') : '-'}</div><div className="bg-slate-50 border rounded-lg p-3"><b>Total jenis item:</b> {detail.totalItem}<br/><b>Total quantity:</b> {detail.totalQuantity}<br/><b>Catatan PO:</b> {detail.note || '-'}</div></div>
          {detail.purchaseInvoices.length > 0 && <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><b>Purchase Invoice terkait:</b>{detail.purchaseInvoices.map((invoice) => <div key={invoice.purchaseInvoiceId} className="flex items-center justify-between rounded-lg border border-emerald-100 bg-white px-3 py-2"><span><strong>{invoice.purchaseInvoiceNumber}</strong> · {invoice.status}</span>{detail.status === 'COMPLETED' && <Button size="sm" variant="outline" onClick={() => void openRelatedInvoice(invoice.purchaseInvoiceId)} className="h-7 text-[11px] font-bold"><Eye className="mr-1 h-3 w-3" />Lihat Detail PI</Button>}</div>)}</div>}
        </div>}
        <DialogFooter className="mt-4 border-t pt-3 flex justify-between"><Button variant="outline" disabled={!detail} onClick={() => detail && void printOrder(detail)}><Printer className="w-4 h-4 mr-1.5" />Cetak PO</Button><Button variant="outline" onClick={() => setIsDetailOpen(false)}>{detail?.status === 'CANCELLED' && <XCircle className="w-4 h-4 mr-1" />}Tutup</Button></DialogFooter>
      </DialogContent></Dialog>

      <PurchaseInvoiceDetailDialog
        open={isInvoiceDetailOpen}
        onOpenChange={setIsInvoiceDetailOpen}
        detail={relatedInvoice}
        loading={isInvoiceDetailLoading}
        backLabel="Kembali ke PO"
        onBack={() => { if (detail) setIsDetailOpen(true); }}
      />
    </section>
  );
}
