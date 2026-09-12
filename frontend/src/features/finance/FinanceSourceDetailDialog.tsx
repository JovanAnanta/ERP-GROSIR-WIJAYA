import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import PurchaseInvoiceDetailDialog from "@/features/purchasing/components/PurchaseInvoiceDetailDialog";
import { purchasingApi, type PurchaseInvoiceFullDetail } from "@/features/purchasing/purchasing.api";
import { SalesDetailDialog } from "@/features/sales/SalesDocumentList";
import { salesApi, type SalesInvoiceDocument } from "@/features/sales/sales.api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseApiError } from "@/utils/error";
import type { FinanceTransaction } from "./finance.api";

export default function FinanceSourceDetailDialog({ transaction, onClose }: { transaction: FinanceTransaction | null; onClose: () => void }) {
  const [purchase, setPurchase] = useState<PurchaseInvoiceFullDetail | null>(null);
  const [sales, setSales] = useState<SalesInvoiceDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!transaction?.referenceId) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true); setError(""); setPurchase(null); setSales(null);
      const request = transaction.referenceType === "PURCHASE_INVOICE"
        ? purchasingApi.getInvoiceDetail(transaction.referenceId!).then((value) => active && setPurchase(value))
        : transaction.referenceType === "SALES_INVOICE"
          ? salesApi.invoice(transaction.referenceId!).then((value) => active && setSales(value))
          : Promise.resolve();
      void request.catch((reason) => active && setError(parseApiError(reason))).finally(() => active && setLoading(false));
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [transaction]);
  if (transaction?.referenceType === "PURCHASE_INVOICE") return <PurchaseInvoiceDetailDialog open detail={purchase} loading={loading} onOpenChange={(open) => !open && onClose()} />;
  if (transaction?.referenceType === "SALES_INVOICE" && sales) return <SalesDetailDialog kind="SI" data={sales} accountsPermission={false} canApprove={false} onClose={onClose} onChanged={() => undefined} />;
  return <Dialog open={Boolean(transaction)} onOpenChange={(open) => !open && onClose()}><DialogContent className="max-w-lg bg-white"><DialogHeader><DialogTitle>Jejak Dokumen</DialogTitle></DialogHeader>{loading ? <div className="flex h-32 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin"/>Memuat...</div> : <div className="space-y-3 text-sm"><div className="rounded-xl bg-slate-50 p-4"><b>{transaction?.referenceNumber || transaction?.referenceType}</b><p className="mt-1 text-slate-500">{transaction?.description}</p></div>{error && <div className="rounded-lg bg-rose-50 p-3 text-rose-700">{error}</div>}<p className="text-xs text-slate-500">Detail penuh untuk jenis dokumen ini mengikuti modul sumbernya.</p></div>}</DialogContent></Dialog>;
}
