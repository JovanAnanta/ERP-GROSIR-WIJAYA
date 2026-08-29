import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { systemConfigApi } from '@/features/system/system-configuration.api';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PurchaseInvoiceFullDetail } from '../purchasing.api';
import PurchaseInvoiceDetailContent from './PurchaseInvoiceDetailContent';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: PurchaseInvoiceFullDetail | null;
  loading?: boolean;
  onPrint?: (detail: PurchaseInvoiceFullDetail) => void;
  backLabel?: string;
  onBack?: () => void;
}

/** Canonical Purchase Invoice detail popup, shared by PI, PO, FIFO, and returns. */
export default function PurchaseInvoiceDetailDialog({
  open,
  onOpenChange,
  detail,
  loading = false,
  onPrint,
  backLabel,
  onBack,
}: Props) {
  const printReceipt = async (invoice: PurchaseInvoiceFullDetail) => {
    if (onPrint) return onPrint(invoice);
    const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
    const config = (await systemConfigApi.get()).data;
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Struk Pembelian - ${escapeHtml(invoice.purchaseInvoiceNumber)}</title>
      <style>@page{margin:0}body{font-family:'Courier New',monospace;font-size:11px;width:58mm;margin:0;padding:6px;color:#000}.center{text-align:center}.bold{font-weight:bold}.line{border-bottom:1px dashed #000;margin:5px 0}.solid-line{border-bottom:1px solid #000;margin:5px 0}table{width:100%;border-collapse:collapse;font-size:10px}th,td{text-align:left;padding:2px 0;vertical-align:top}.right{text-align:right}.item-name{word-break:break-word;font-weight:bold}</style></head>
      <body>
      ${config.logoBase64 ? `<div class="center"><img src="${escapeHtml(config.logoBase64)}" style="max-height:40px;filter:grayscale(100%) contrast(150%)" /></div>` : ''}
      <div class="center bold" style="font-size:13px;margin-top:4px">${escapeHtml(config.companyName)}</div>
      <div class="center">${escapeHtml(config.address)}</div><div class="center">Telp: ${escapeHtml(config.phone)}</div>
      <div class="line"></div><div class="center bold">PURCHASE INVOICE</div><div class="line"></div>
      <div>No. Faktur : ${escapeHtml(invoice.purchaseInvoiceNumber)}</div><div>Supplier : ${escapeHtml(invoice.supplierName)}</div><div>Tgl Terima : ${invoice.invoiceDate.slice(0, 10)}</div><div class="solid-line"></div>
      <table><thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Total</th></tr></thead><tbody>
      ${invoice.details.map((item) => `<tr><td colspan="3" class="item-name">${escapeHtml(item.productName)} (${escapeHtml(item.unitName)})</td></tr><tr><td></td><td class="right">${item.quantity}x</td><td class="right">${item.subtotal.toLocaleString('id-ID')}</td></tr>`).join('')}
      </tbody></table><div class="solid-line"></div>
      <div style="display:flex;justify-content:space-between"><span>Diskon:</span><span>Rp ${invoice.discountAmount.toLocaleString('id-ID')}</span></div>
      <div class="bold" style="display:flex;justify-content:space-between"><span>GRAND TOTAL:</span><span>Rp ${invoice.invoiceTotal.toLocaleString('id-ID')}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Sudah Bayar:</span><span>Rp ${invoice.paidAmount.toLocaleString('id-ID')}</span></div>
      <div class="bold" style="display:flex;justify-content:space-between"><span>Sisa Hutang:</span><span>Rp ${invoice.outstandingAmount.toLocaleString('id-ID')}</span></div>
      ${invoice.note ? `<div style="margin-top:4px"><b>Catatan Faktur:</b> ${escapeHtml(invoice.note)}</div>` : ''}
      <div class="line"></div><div class="center">HANYA UNTUK TOKO</div><div class="center" style="font-size:9px;margin-top:6px;color:#555">Dicetak: ${new Date().toLocaleString('id-ID')}</div>
      </body></html>`);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[60] flex max-h-[92vh] flex-col overflow-hidden rounded-xl border-slate-200 bg-white p-6 shadow-2xl"
        style={{ maxWidth: '96vw', width: '1000px' }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-base font-black uppercase text-slate-800">
            <span>Detail Purchase Invoice: {detail?.purchaseInvoiceNumber}</span>
            <span className="text-xs font-bold text-slate-500">Status Dokumen: {detail?.status}</span>
          </DialogTitle>
        </DialogHeader>

        <PurchaseInvoiceDetailContent detail={detail} loading={loading} />

        <DialogFooter className="mt-4 flex w-full shrink-0 items-center justify-between border-t border-slate-100 pt-2">
          <Button variant="outline" disabled={!detail} onClick={() => detail && void printReceipt(detail)} className="h-9 text-xs font-bold text-slate-700">
              <Printer className="mr-1.5 h-4 w-4" /> Cetak Struk Kasir
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onBack?.();
            }}
            className="ml-auto h-9 px-6 text-xs"
          >
            {backLabel && <ArrowLeft className="mr-1 h-4 w-4" />}
            {backLabel ?? 'Tutup'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
