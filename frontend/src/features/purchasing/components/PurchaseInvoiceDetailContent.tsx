import { Loader2, Receipt } from 'lucide-react';
import type { PurchaseInvoiceFullDetail } from '../purchasing.api';

interface Props {
  detail: PurchaseInvoiceFullDetail | null;
  loading?: boolean;
}

export default function PurchaseInvoiceDetailContent({ detail, loading = false }: Props) {
  if (loading || !detail) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[#326dc8]" /></div>;
  }

  return (
    <div className="flex-1 space-y-6 overflow-y-auto pr-1 text-xs custom-scrollbar">
      <div className="grid grid-cols-2 items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm md:grid-cols-4">
        <div className="truncate"><span className="block text-[10px] font-bold uppercase text-slate-400">Supplier</span><strong className="block truncate text-sm text-slate-800">{detail.supplierName}</strong></div>
        <div><span className="block text-[10px] font-bold uppercase text-slate-400">Tgl Faktur</span><strong className="text-sm text-slate-800">{detail.invoiceDate.slice(0, 10)}</strong></div>
        <div><span className="block text-[10px] font-bold uppercase text-slate-400">Jatuh Tempo</span><strong className="text-sm text-rose-600">{detail.dueDate ? detail.dueDate.slice(0, 10) : 'Cash'}</strong></div>
        <div><span className="block text-[10px] font-bold uppercase text-slate-400">Status Pembayaran</span><strong className="text-sm text-emerald-700">{detail.statusPayment}</strong></div>
      </div>

      <div>
        <h4 className="mb-2 font-extrabold uppercase text-slate-700">Daftar Barang Diterima ({detail.details.length} Item)</h4>
        <div className="erp-scroll-table max-h-[260px] overflow-auto rounded-lg border border-slate-200 bg-white shadow-inner custom-scrollbar">
          <table className="w-full min-w-[720px] border-collapse text-left"><thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100"><tr><th className="w-12 p-3 text-center">No</th><th className="p-3">Produk</th><th className="w-36 p-3">Satuan</th><th className="w-28 p-3 text-center">Qty</th><th className="w-44 p-3 text-right">Harga Satuan (Rp)</th><th className="w-48 p-3 text-right">Subtotal (Rp)</th></tr></thead>
            <tbody>{detail.details.map((item, index) => <tr key={item.purchaseInvoiceDetailId} className="border-b border-slate-100 hover:bg-slate-50"><td className="p-3 text-center font-bold text-slate-400">{index + 1}</td><td className="p-3 font-bold text-slate-800">{item.productName}</td><td className="p-3">{item.unitName}</td><td className="p-3 text-center font-bold text-[#326dc8]">{item.quantity}</td><td className="p-3 text-right">{item.unitCost.toLocaleString('id-ID')}</td><td className="p-3 text-right font-extrabold">{item.subtotal.toLocaleString('id-ID')}</td></tr>)}</tbody>
          </table>
        </div>
      </div>

      <div>
        <h4 className="mb-2 flex items-center gap-1.5 font-extrabold uppercase text-slate-700"><Receipt className="h-4 w-4 text-emerald-600" /> Histori Pembayaran Kas / Bank ({detail.payments.length} Transaksi)</h4>
        {detail.payments.length === 0 ? <p className="rounded border bg-slate-50 p-3 text-center italic text-slate-400">Belum ada riwayat pembayaran yang dicatat.</p> : <div className="erp-scroll-table max-h-[220px] overflow-auto rounded-lg border border-slate-200 bg-white shadow-inner custom-scrollbar"><table className="w-full min-w-[680px] border-collapse text-left"><thead className="sticky top-0 z-10 border-b border-emerald-200 bg-emerald-50 text-emerald-800"><tr><th className="p-3">Tanggal Bayar</th><th className="p-3">Akun Kas / Bank</th><th className="p-3">Metode</th><th className="p-3">No. Ref / Bukti</th><th className="p-3 text-right">Nominal (Rp)</th></tr></thead><tbody>{detail.payments.map((payment) => <tr key={payment.purchasePaymentId} className="border-b border-slate-100 hover:bg-slate-50"><td className="p-3">{payment.paymentDate.slice(0, 10)}</td><td className="p-3 font-bold">{payment.accountName}</td><td className="p-3 font-medium uppercase">{payment.paymentMethod}</td><td className="p-3 text-slate-500">{payment.referenceNumber || '-'}</td><td className="p-3 text-right font-extrabold text-emerald-600">Rp {payment.paymentAmount.toLocaleString('id-ID')}</td></tr>)}</tbody></table></div>}
      </div>

      <div className="flex justify-end rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm"><div className="w-full space-y-2 sm:w-80"><div className="flex justify-between gap-3 text-slate-500"><span>Diskon Global:</span><span>Rp {detail.discountAmount.toLocaleString('id-ID')}</span></div><div className="flex justify-between gap-3 border-t border-slate-200 pt-1.5 text-sm font-extrabold text-slate-800"><span>Grand Total:</span><span>Rp {detail.invoiceTotal.toLocaleString('id-ID')}</span></div><div className="flex justify-between gap-3 font-bold text-emerald-700"><span>Total Dibayar:</span><span>Rp {detail.paidAmount.toLocaleString('id-ID')}</span></div><div className="flex justify-between gap-3 border-t border-slate-200 pt-1.5 text-sm font-bold text-rose-600"><span>Sisa Hutang:</span><span>Rp {detail.outstandingAmount.toLocaleString('id-ID')}</span></div></div></div>
    </div>
  );
}
