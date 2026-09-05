import { systemConfigApi } from "@/features/system/system-configuration.api";

export interface SalesReceiptItem {
  productName: string;
  unitName: string;
  quantity: number;
  bonusQuantity?: number;
  subtotal: number;
}

export interface SalesReceiptData {
  documentNumber: string;
  customerName: string;
  transactionDate: string;
  items: SalesReceiptItem[];
  discountAmount: number;
  grandTotal: number;
  paidAmount?: number;
  outstandingAmount?: number;
  note?: string | null;
  preview?: boolean;
}

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const money = (value: number) => Number(value || 0).toLocaleString("id-ID");

export async function printSalesReceipt(data: SalesReceiptData) {
  const config = await systemConfigApi.get();
  const popup = window.open("", "_blank", "width=420,height=760");
  if (!popup) throw new Error("Popup cetak diblokir browser.");
  const headers = [config.receiptHeader1, config.receiptHeader2, config.receiptHeader3].filter(Boolean).map(value => `<div>${escapeHtml(value)}</div>`).join("");
  const footers = [config.receiptFooter1, config.receiptFooter2, config.receiptFooter3].filter(Boolean).map(value => `<div>${escapeHtml(value)}</div>`).join("");
  const items = data.items.map(item => `<div class="item"><span>${escapeHtml(item.quantity)} ${escapeHtml(item.unitName)} ${escapeHtml(item.productName)}${item.bonusQuantity ? ` + bonus ${escapeHtml(item.bonusQuantity)}` : ""}</span><span>${money(item.subtotal)}</span></div>`).join("");
  popup.document.write(`<!doctype html><html><head><title>${escapeHtml(data.documentNumber)}</title><style>@page{size:58mm auto;margin:0}*{box-sizing:border-box}body{width:58mm;margin:0;padding:5mm 4mm;font-family:'Courier New',Courier,monospace;font-size:10px;line-height:1.25;color:#000;background:#fff}.center{text-align:center}.logo{display:block;max-width:28mm;max-height:17mm;margin:0 auto 3mm;filter:grayscale(100%) contrast(150%)}.company{font-weight:700;font-size:11px}.header{margin-top:3mm;padding-top:2mm;border-top:1px dashed #777;text-align:center}.meta{margin:2mm 0}.meta div{display:grid;grid-template-columns:19mm 1fr;gap:1mm}.items{margin-top:2mm;padding:2mm 0;border-top:1px solid #111;border-bottom:1px solid #111}.item-head,.item{display:grid;grid-template-columns:minmax(0,1fr) 24mm;gap:2mm}.item-head{font-weight:700;margin-bottom:1mm}.item span:last-child,.item-head span:last-child{text-align:right}.item span:first-child{overflow-wrap:anywhere}.total{display:flex;justify-content:space-between;margin-top:2mm;font-weight:700;font-size:11px}.summary{margin-top:1mm}.summary div{display:flex;justify-content:space-between}.note{margin-top:2mm;overflow-wrap:anywhere}.footer{margin-top:4mm;padding-top:3mm;border-top:1px dashed #777;text-align:center;font-size:9px}.printed{margin-top:2mm;text-align:center;font-size:8px;color:#555}</style></head><body>${config.logoBase64 ? `<img class="logo" src="${escapeHtml(config.logoBase64)}"/>` : ""}${config.companyName ? `<div class="center company">${escapeHtml(config.companyName)}</div>` : ""}<div class="center">${escapeHtml(config.address)}</div><div class="center">Telp: ${escapeHtml(config.phone)}</div>${headers ? `<div class="header">${headers}</div>` : ""}<div class="meta"><div><span>No.</span><strong>${escapeHtml(data.documentNumber)}</strong></div><div><span>Pelanggan</span><span>${escapeHtml(data.customerName || "Guest")}</span></div><div><span>Tanggal</span><span>${escapeHtml(data.transactionDate)}</span></div>${data.preview ? `<div><span>Status</span><span>PREVIEW</span></div>` : ""}</div><div class="items"><div class="item-head"><span>Item</span><span>Total</span></div>${items}</div>${data.discountAmount ? `<div class="summary"><div><span>Diskon</span><span>${money(data.discountAmount)}</span></div></div>` : ""}<div class="total"><span>GRAND TOTAL</span><span>${money(data.grandTotal)}</span></div>${data.paidAmount !== undefined ? `<div class="summary"><div><span>Sudah Bayar</span><span>${money(data.paidAmount)}</span></div><div><span>Sisa Piutang</span><span>${money(data.outstandingAmount ?? 0)}</span></div></div>` : ""}${data.note ? `<div class="note"><b>Catatan:</b> ${escapeHtml(data.note)}</div>` : ""}${footers ? `<div class="footer">${footers}</div>` : ""}<div class="printed">Dicetak: ${escapeHtml(new Date().toLocaleString("id-ID"))}</div></body></html>`);
  popup.document.close();
  window.setTimeout(() => { popup.focus(); popup.print(); }, 250);
}
