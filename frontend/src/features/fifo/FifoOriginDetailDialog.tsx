import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  purchasingApi,
  type PurchaseInvoiceFullDetail,
  type PurchaseReturnDetail,
} from "@/features/purchasing/purchasing.api";
import PurchaseInvoiceDetailDialog from "@/features/purchasing/components/PurchaseInvoiceDetailDialog";
import {
  inventoryApi,
  type InventoryDetail,
  type TransformationDetail,
} from "@/features/inventory/inventory.api";
import { parseApiError } from "@/utils/error";
import type { FifoOriginSummary } from "./fifo.api";

interface Props {
  origin: FifoOriginSummary | null;
  onClose: () => void;
}

const rupiah = (value: number) =>
  `Rp ${Number(value || 0).toLocaleString("id-ID")}`;

export default function FifoOriginDetailDialog({ origin, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [invoice, setInvoice] = useState<PurchaseInvoiceFullDetail | null>(
    null,
  );
  const [purchaseReturn, setPurchaseReturn] =
    useState<PurchaseReturnDetail | null>(null);
  const [adjustment, setAdjustment] = useState<InventoryDetail | null>(null);
  const [transformation, setTransformation] =
    useState<TransformationDetail | null>(null);

  useEffect(() => {
    if (!origin) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setInvoice(null);
      setPurchaseReturn(null);
      setAdjustment(null);
      setTransformation(null);
      setError("");
      setLoading(true);
      const request =
        origin.type === "PURCHASE_INVOICE"
          ? purchasingApi
              .getInvoiceDetail(origin.id)
              .then((data) => active && setInvoice(data))
          : origin.type === "PURCHASE_RETURN"
            ? purchasingApi
                .getPurchaseReturn(origin.id)
                .then((data) => active && setPurchaseReturn(data))
            : origin.type === "INVENTORY_ADJUSTMENT"
              ? inventoryApi
                  .detail("adjustments", origin.id)
                  .then((data) => active && setAdjustment(data))
              : origin.type === "INVENTORY_TRANSFORMATION"
                ? inventoryApi
                    .transformationDetail(origin.id)
                    .then((data) => active && setTransformation(data))
                : Promise.reject(
                    new Error(
                      "Detail dokumen ini akan tersedia ketika modul terkait selesai dibuat.",
                    ),
                  );
      void request
        .catch((reason) => active && setError(parseApiError(reason)))
        .finally(() => active && setLoading(false));
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [origin]);

  if (origin?.type === "PURCHASE_INVOICE") {
    return (
      <PurchaseInvoiceDetailDialog
        open={Boolean(origin)}
        onOpenChange={(open) => !open && onClose()}
        detail={invoice}
        loading={loading}
      />
    );
  }

  return (
    <Dialog open={Boolean(origin)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="z-[80] flex max-h-[92dvh] w-[96vw] max-w-5xl flex-col overflow-hidden bg-white p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Detail Dokumen · {origin?.number}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && (
            <div className="flex h-56 items-center justify-center gap-2 text-sm text-slate-500">
              <LoaderCircle className="h-5 w-5 animate-spin" />
              Memuat detail dokumen...
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
              {error}
            </div>
          )}
          {purchaseReturn && (
            <div className="space-y-4">
              <div className="grid gap-2 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
                <p>
                  <b>Supplier</b>
                  <br />
                  {purchaseReturn.supplierName}
                </p>
                <p>
                  <b>Status</b>
                  <br />
                  {purchaseReturn.status}
                </p>
                <p>
                  <b>Penyelesaian</b>
                  <br />
                  {purchaseReturn.resolutionType}
                </p>
                <p>
                  <b>Nilai retur</b>
                  <br />
                  {rupiah(purchaseReturn.returnTotal)}
                </p>
                <p>
                  <b>Nilai persediaan</b>
                  <br />
                  {rupiah(purchaseReturn.inventoryCostTotal)}
                </p>
                <p>
                  <b>PI terkait</b>
                  <br />
                  {purchaseReturn.purchaseInvoiceNumber}
                </p>
              </div>
              <div className="space-y-2">
                {purchaseReturn.details.map((item) => (
                  <div
                    key={item.purchaseReturnDetailId}
                    className="rounded-lg border p-3 text-sm"
                  >
                    <b>{item.productName}</b>
                    <p className="mt-1 text-slate-600">
                      {item.quantity} {item.unitName} · {rupiah(item.subtotal)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {adjustment && (
            <div className="space-y-4">
              <div className="grid gap-2 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
                <p>
                  <b>Nomor</b>
                  <br />
                  {adjustment.adjustmentNumber}
                </p>
                <p>
                  <b>Status</b>
                  <br />
                  {adjustment.status}
                </p>
                <p>
                  <b>Alasan</b>
                  <br />
                  {adjustment.reason}
                </p>
              </div>
              <div className="space-y-2">
                {adjustment.details.map((item, index) => (
                  <div
                    key={String(item.adjustmentDetailId ?? index)}
                    className="rounded-lg border p-3 text-sm"
                  >
                    <b>{item.productName}</b>
                    <p className="mt-1 text-slate-600">
                      {String(item.direction ?? "")} ·{" "}
                      {String(item.quantity ?? "")} {item.unitName} ·{" "}
                      {rupiah(Number(item.totalCost ?? 0))}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {transformation && (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 p-4 text-sm">
                <b>{transformation.transformationNumber}</b>
                <p className="mt-1 text-slate-600">
                  {new Date(
                    transformation.transformationDate,
                  ).toLocaleDateString("id-ID")}{" "}
                  · {transformation.createdByUser?.fullName ?? "-"}
                </p>
              </div>
              <div className="space-y-2">
                {transformation.details.map((item) => (
                  <div
                    key={item.transformationDetailId}
                    className="rounded-lg border p-3 text-sm"
                  >
                    <b>Baris {item.lineNumber}</b>
                    <p className="mt-1">
                      {item.sourceProductName} · {item.sourceQuantity}{" "}
                      {item.sourceUnitName} → {item.resultProductName} ·{" "}
                      {item.resultQuantity} {item.resultUnitName}
                    </p>
                    <p className="mt-1 text-slate-500">
                      Modal hasil: {rupiah(item.appliedUnitCost)}/unit · total{" "}
                      {rupiah(item.resultCostTotal)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end border-t pt-3">
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
