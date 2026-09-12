import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { systemConfigApi } from "@/features/system/system-configuration.api";
import {
  createThermalPrintJob,
  escapeReceiptHtml as escapeHtml,
  thermalReceiptFooter,
  thermalReceiptHeader,
  type ThermalPrintJob,
} from "@/lib/thermal-print";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PurchaseInvoiceFullDetail } from "../purchasing.api";
import PurchaseInvoiceDetailContent from "./PurchaseInvoiceDetailContent";

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
    let printJob: ThermalPrintJob | undefined;
    try {
      printJob = createThermalPrintJob(invoice.purchaseInvoiceNumber);
      const config = (await systemConfigApi.get()).data;
      await printJob.printDocument(`
      <html><head><title>Struk Pembelian - ${escapeHtml(invoice.purchaseInvoiceNumber)}</title>
      <style>@page{size:80mm auto;margin:0}body{font-family:'Courier New',monospace;font-size:10px;width:80mm;margin:0;padding:4mm;color:#000}.center{text-align:center}.bold{font-weight:bold}.line{border-bottom:1px dashed #000;margin:5px 0}.solid-line{border-bottom:1px solid #000;margin:5px 0}table{width:100%;border-collapse:collapse;font-size:9.5px}th,td{text-align:left;padding:2px 0;vertical-align:top}.right{text-align:right}.item-name{word-break:break-word;font-weight:bold}</style></head>
      <body>
      ${thermalReceiptHeader(config)}
      <div class="line"></div><div class="center bold">PURCHASE INVOICE</div><div class="line"></div>
      <div>No. Faktur : ${escapeHtml(invoice.purchaseInvoiceNumber)}</div><div>Supplier : ${escapeHtml(invoice.supplierName)}</div><div>Tgl Terima : ${invoice.invoiceDate.slice(0, 10)}</div><div class="solid-line"></div>
      <table><thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Total</th></tr></thead><tbody>
      ${invoice.details.map((item) => `<tr><td colspan="3" class="item-name">${escapeHtml(item.productName)} (${escapeHtml(item.unitName)})</td></tr><tr><td></td><td class="right">${item.quantity}x${item.bonusQuantity ? ` + Bonus ${item.bonusQuantity}` : ""}</td><td class="right">${item.subtotal.toLocaleString("id-ID")}</td></tr>`).join("")}
      </tbody></table><div class="solid-line"></div>
      <div style="display:flex;justify-content:space-between"><span>Diskon:</span><span>Rp ${invoice.discountAmount.toLocaleString("id-ID")}</span></div>
      <div class="bold" style="display:flex;justify-content:space-between"><span>GRAND TOTAL:</span><span>Rp ${invoice.invoiceTotal.toLocaleString("id-ID")}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Sudah Bayar:</span><span>Rp ${invoice.paidAmount.toLocaleString("id-ID")}</span></div>
      <div class="bold" style="display:flex;justify-content:space-between"><span>Sisa Hutang:</span><span>Rp ${invoice.outstandingAmount.toLocaleString("id-ID")}</span></div>
      ${invoice.note ? `<div style="margin-top:4px"><b>Catatan Faktur:</b> ${escapeHtml(invoice.note)}</div>` : ""}
      ${thermalReceiptFooter(config)}
      </body></html>`);
    } catch (error) {
      printJob?.close();
      throw error;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[60] flex max-h-[92vh] flex-col overflow-hidden rounded-xl border-slate-200 bg-white p-6 shadow-2xl"
        style={{ maxWidth: "96vw", width: "1000px" }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-base font-black uppercase text-slate-800">
            <span>
              Detail Purchase Invoice: {detail?.purchaseInvoiceNumber}
            </span>
            <span className="text-xs font-bold text-slate-500">
              Status Dokumen: {detail?.status}
            </span>
          </DialogTitle>
        </DialogHeader>

        <PurchaseInvoiceDetailContent detail={detail} loading={loading} />

        <DialogFooter className="mt-4 flex w-full shrink-0 items-center justify-between border-t border-slate-100 pt-2">
          <Button
            variant="outline"
            disabled={!detail}
            onClick={() => detail && void printReceipt(detail)}
            className="h-9 text-xs font-bold text-slate-700"
          >
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
            {backLabel ?? "Tutup"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
