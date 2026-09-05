import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Eye,
  FileCheck2,
  Loader2,
  Pencil,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseApiError } from "@/utils/error";
import { defaultSalesAccount } from "./sales-form.utils";
import { printSalesReceipt } from "./sales-receipt";
import {
  salesApi,
  type PaginationMeta,
  type SalesFinancialAccount,
  type SalesInvoiceDocument,
  type SalesOrderDocument,
} from "./sales.api";
import SalesReturnDialog from "./SalesReturnDialog";

const rupiah = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;
const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString("id-ID");
async function printCompletedInvoice(invoice: SalesInvoiceDocument) {
  await printSalesReceipt({ documentNumber: invoice.salesInvoiceNumber, customerName: invoice.customerName, transactionDate: dateLabel(invoice.invoiceDate), items: (invoice.details ?? []).map(line => ({ productName: line.productName, unitName: line.unitName, quantity: line.quantity, bonusQuantity: line.bonusQuantity, subtotal: line.subtotal })), discountAmount: invoice.discountAmount, grandTotal: invoice.invoiceTotal, paidAmount: invoice.paidAmount, outstandingAmount: invoice.outstandingAmount, note: invoice.note });
}

interface Props {
  version: number;
  canUpdate: boolean;
  canApprove: boolean;
  canReceivePayment: boolean;
  canReturn: boolean;
  onEdit: (kind: "SO" | "SI", id: string) => void;
  onChanged: (message: string) => void;
}

export default function SalesDocumentList(props: Props) {
  const [tab, setTab] = useState<"ACTIVE" | "HISTORY">("ACTIVE");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [orderPage, setOrderPage] = useState(1);
  const [invoicePage, setInvoicePage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [orders, setOrders] = useState<SalesOrderDocument[]>([]);
  const [invoices, setInvoices] = useState<SalesInvoiceDocument[]>([]);
  const [orderMeta, setOrderMeta] = useState<PaginationMeta>(emptyMeta);
  const [invoiceMeta, setInvoiceMeta] = useState<PaginationMeta>(emptyMeta);
  const [detail, setDetail] = useState<{
    kind: "SO" | "SI";
    data: SalesOrderDocument | SalesInvoiceDocument;
  } | null>(null);
  const [processingInvoice, setProcessingInvoice] =
    useState<SalesInvoiceDocument | null>(null);
  const [returnInvoiceId, setReturnInvoiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setOrderPage(1);
      setInvoicePage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [orderResult, invoiceResult] = await Promise.all([
        salesApi.listOrders(tab, orderPage, limit, debouncedSearch),
        salesApi.listInvoices(tab, invoicePage, limit, debouncedSearch),
      ]);
      setOrders(orderResult.data);
      setOrderMeta(orderResult.meta);
      setInvoices(invoiceResult.data);
      setInvoiceMeta(invoiceResult.meta);
    } catch (caught) {
      setError(parseApiError(caught));
    } finally {
      setLoading(false);
    }
  }, [tab, orderPage, invoicePage, limit, debouncedSearch]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load, props.version]);

  const openDetail = async (kind: "SO" | "SI", id: string) => {
    try {
      setDetail({
        kind,
        data:
          kind === "SO" ? await salesApi.order(id) : await salesApi.invoice(id),
      });
    } catch (caught) {
      setError(parseApiError(caught));
    }
  };

  return (
    <div className="space-y-5 pb-8">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-black uppercase tracking-wide text-slate-800">
              <FileCheck2 className="h-5 w-5 text-blue-600" /> Sales Document
              Monitoring
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Pantau Sales Order dan Sales Invoice dalam satu tempat.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void load()}
            className="h-8 text-xs font-bold"
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh Sales
          </Button>
        </div>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setTab("ACTIVE");
                setOrderPage(1);
                setInvoicePage(1);
              }}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-black uppercase ${tab === "ACTIVE" ? "bg-[#326dc8] text-white shadow" : "bg-slate-100 text-slate-600"}`}
            >
              <CalendarClock className="h-4 w-4" /> Sedang Diproses
            </button>
            <button
              onClick={() => {
                setTab("HISTORY");
                setOrderPage(1);
                setInvoicePage(1);
              }}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-black uppercase ${tab === "HISTORY" ? "bg-slate-600 text-white shadow" : "bg-slate-100 text-slate-600"}`}
            >
              <CheckCircle2 className="h-4 w-4" /> Riwayat Selesai
            </button>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <label className="relative w-full sm:min-w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nomor dokumen atau customer..."
                className="sales-input pl-9"
              />
            </label>
            <select
              aria-label="Jumlah dokumen per halaman"
              value={limit}
              onChange={(event) => {
                setLimit(Number(event.target.value));
                setOrderPage(1);
                setInvoicePage(1);
              }}
              className="sales-input w-full bg-white sm:w-auto"
            >
              {[20, 30, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} / halaman
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          <AlertTriangle className="h-5 w-5 shrink-0" /> {error}
        </div>
      )}
      {loading ? (
        <div className="flex min-h-60 items-center justify-center text-sm text-slate-500">
          <Loader2 className="mr-2 h-6 w-6 animate-spin text-blue-600" /> Memuat
          Sales...
        </div>
      ) : (
        <>
          <Section
            title="Sales Order"
            subtitle="Pesanan yang belum atau sudah dikonversi menjadi Sales Invoice"
            icon={<ShoppingBag className="h-5 w-5 text-amber-500" />}
            empty="Belum ada Sales Order pada bagian ini."
          >
            {orders.map((order) => (
              <OrderCard
                key={order.salesOrderId}
                order={order}
                canUpdate={props.canUpdate}
                onDetail={() => void openDetail("SO", order.salesOrderId)}
                onEdit={() => props.onEdit("SO", order.salesOrderId)}
              />
            ))}
          </Section>
          <Pagination meta={orderMeta} page={orderPage} onPage={setOrderPage} />
          <Section
            title="Sales Invoice"
            subtitle="Barang terreservasi, status pembayaran, dan outstanding customer"
            icon={<FileCheck2 className="h-5 w-5 text-emerald-500" />}
            empty="Belum ada Sales Invoice pada bagian ini."
          >
            {invoices.map((invoice) => (
              <InvoiceCard
                key={invoice.salesInvoiceId}
                invoice={invoice}
                canUpdate={props.canUpdate}
                canProcess={props.canApprove || props.canReceivePayment}
                canReturn={props.canReturn}
                onDetail={() => void openDetail("SI", invoice.salesInvoiceId)}
                onEdit={() => props.onEdit("SI", invoice.salesInvoiceId)}
                onProcess={() => setProcessingInvoice(invoice)}
                onReturn={() => setReturnInvoiceId(invoice.salesInvoiceId)}
              />
            ))}
          </Section>
          <Pagination
            meta={invoiceMeta}
            page={invoicePage}
            onPage={setInvoicePage}
          />
        </>
      )}
      {detail && (
        <SalesDetailDialog
          kind={detail.kind}
          data={detail.data}
          accountsPermission={props.canReceivePayment}
          canApprove={props.canApprove}
          onClose={() => setDetail(null)}
          onChanged={async (message) => {
            setDetail(null);
            props.onChanged(message);
            await load();
          }}
        />
      )}
      {processingInvoice && (
        <InvoiceProcessDialog
          invoice={processingInvoice}
          canApprove={props.canApprove}
          canReceivePayment={props.canReceivePayment}
          onClose={() => setProcessingInvoice(null)}
          onProcessed={async (message) => {
            setProcessingInvoice(null);
            props.onChanged(message);
            await load();
          }}
        />
      )}
      {returnInvoiceId && <SalesReturnDialog invoiceId={returnInvoiceId} onClose={()=>setReturnInvoiceId(null)} onSaved={async(message)=>{setReturnInvoiceId(null);props.onChanged(message);await load()}}/>}
    </div>
  );
}

const emptyMeta: PaginationMeta = {
  currentPage: 1,
  pageSize: 20,
  totalData: 0,
  totalPage: 1,
};
function Section({
  title,
  subtitle,
  icon,
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  empty: string;
  children: React.ReactNode;
}) {
  const rows = Array.isArray(children) ? children : [children];
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-3">
        <div className="rounded-lg border bg-slate-50 p-2">{icon}</div>
        <div>
          <h2 className="text-sm font-black text-slate-900">{title}</h2>
          <p className="text-[11px] text-slate-500">{subtitle}</p>
        </div>
      </div>
      {rows.length && rows.some(Boolean) ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {children}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-white p-8 text-center text-xs text-slate-500">
          {empty}
        </div>
      )}
    </section>
  );
}
function Status({ value }: { value: string }) {
  const color =
    value === "COMPLETED" || value === "PAID"
      ? "bg-emerald-100 text-emerald-700"
      : value === "CANCELLED"
        ? "bg-slate-200 text-slate-600"
        : value === "READY" || value === "PARTIAL"
          ? "bg-amber-100 text-amber-700"
          : "bg-blue-100 text-blue-700";
  return (
    <span className={`rounded-full px-2 py-1 text-[9px] font-black ${color}`}>
      {value}
    </span>
  );
}
function OrderCard({
  order,
  canUpdate,
  onDetail,
  onEdit,
}: {
  order: SalesOrderDocument;
  canUpdate: boolean;
  onDetail: () => void;
  onEdit: () => void;
}) {
  const remaining = order.details.reduce(
    (sum, item) => sum + Math.max(0, item.remainingQuantity ?? item.quantity),
    0,
  );
  const history = ["COMPLETED", "CANCELLED"].includes(order.status);
  return (
    <article
      className={`flex flex-col justify-between gap-3 rounded-xl border p-4 shadow-sm ${history ? "border-slate-300 bg-slate-100 text-slate-600" : order.status === "READY" ? "border-blue-300 bg-blue-50" : "border-amber-300 bg-amber-50"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black">{order.salesOrderNumber}</h3>
          <p className="mt-1 text-xs font-extrabold text-slate-700">
            Customer: {order.customerName}
          </p>
        </div>
        <Status value={order.status} />
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-lg border border-white bg-white/70 p-2 text-[10px]">
        <Mini label="TANGGAL" value={dateLabel(order.orderDate)} />
        <Mini label="SISA QTY" value={remaining.toLocaleString("id-ID")} />
        <Mini label="TOTAL" value={rupiah(order.orderTotal)} />
      </div>
      <div className="flex justify-end gap-1.5 border-t border-slate-200 pt-2">
        <button
          onClick={onDetail}
          className="flex h-7 items-center justify-center gap-1 rounded-lg border bg-white px-3 text-[11px] font-bold hover:bg-slate-50"
        >
          <Eye className="h-3.5 w-3.5" />
          Detail
        </button>
        {canUpdate && ["DRAFT", "READY"].includes(order.status) && (
          <button
            onClick={onEdit}
            className="flex h-7 items-center justify-center gap-1 rounded-lg bg-[#326dc8] px-3 text-[11px] font-bold text-white hover:bg-blue-700"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        )}
      </div>
    </article>
  );
}
function InvoiceCard({
  invoice,
  canUpdate,
  canProcess,
  canReturn,
  onDetail,
  onEdit,
  onProcess,
  onReturn,
}: {
  invoice: SalesInvoiceDocument;
  canUpdate: boolean;
  canProcess: boolean;
  canReturn: boolean;
  onDetail: () => void;
  onEdit: () => void;
  onProcess: () => void;
  onReturn: () => void;
}) {
  const history = ["COMPLETED", "CANCELLED"].includes(invoice.status);
  return (
    <article
      className={`flex flex-col justify-between gap-3 rounded-xl border p-4 shadow-sm ${history ? "border-slate-300 bg-slate-100 text-slate-600" : invoice.status === "READY" ? "border-blue-300 bg-blue-50" : "border-amber-300 bg-amber-50"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black">{invoice.salesInvoiceNumber}</h3>
          <p className="mt-1 text-xs font-extrabold text-slate-700">
            Customer: {invoice.customerName}
            <span className="ml-1 font-semibold text-slate-500">
              · {invoice.partyType}
            </span>
          </p>
        </div>
        <div className="flex gap-1">
          <Status value={invoice.status} />
          {invoice.paymentType === "CREDIT" && <Status value="CREDIT" />}
          <Status value={invoice.statusPayment} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-lg border border-white bg-white/70 p-2 text-[10px]">
        <Mini label="TANGGAL" value={dateLabel(invoice.invoiceDate)} />
        <Mini label="TERBAYAR" value={rupiah(invoice.paidAmount)} />
        <Mini label="SISA" value={rupiah(invoice.outstandingAmount)} />
      </div>
      <div className="flex justify-end gap-1.5 border-t border-slate-200 pt-2">
        <button
          onClick={onDetail}
          className="flex h-7 items-center justify-center gap-1 rounded-lg border bg-white px-3 text-[11px] font-bold hover:bg-slate-50"
        >
          <Eye className="h-3.5 w-3.5" />
          Detail
        </button>
        {canUpdate && ["DRAFT", "READY"].includes(invoice.status) && (
          <button
            onClick={onEdit}
            className="flex h-7 items-center justify-center gap-1 rounded-lg bg-[#326dc8] px-3 text-[11px] font-bold text-white hover:bg-blue-700"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        )}
        {canProcess &&
          invoice.status !== "CANCELLED" &&
          (invoice.status !== "COMPLETED" || invoice.outstandingAmount > 0) && (
            <button
              onClick={onProcess}
              className="flex h-7 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 text-[11px] font-bold text-white hover:bg-emerald-700"
            >
              <CreditCard className="h-3.5 w-3.5" />
              Proses / Bayar
            </button>
          )}
        {canReturn && invoice.status === "COMPLETED" && (
          <button onClick={onReturn} className="flex h-7 items-center justify-center gap-1 rounded-lg bg-rose-600 px-3 text-[11px] font-bold text-white hover:bg-rose-700"><RotateCcw className="h-3.5 w-3.5"/>Retur</button>
        )}
      </div>
    </article>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <p className="font-black text-slate-400">{label}</p>
      <p className="mt-1 truncate font-bold text-slate-700">{value}</p>
    </div>
  );
}

function Pagination({
  meta,
  page,
  onPage,
}: {
  meta: PaginationMeta;
  page: number;
  onPage: (page: number) => void;
}) {
  if (meta.totalData <= 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-1 pt-3 text-xs">
      <span className="text-slate-500">
        {meta.totalData.toLocaleString("id-ID")} data · Halaman{" "}
        {meta.currentPage} dari {Math.max(1, meta.totalPage)}
      </span>
      <div className="flex items-center gap-2">
        <button
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="rounded border px-3 py-2 font-bold disabled:opacity-40"
        >
          Sebelumnya
        </button>
        <button
          disabled={page >= meta.totalPage}
          onClick={() => onPage(page + 1)}
          className="rounded border px-3 py-2 font-bold disabled:opacity-40"
        >
          Berikutnya
        </button>
      </div>
    </div>
  );
}

export function InvoiceProcessDialog({
  invoice,
  canApprove,
  canReceivePayment,
  paymentOnly = false,
  onClose,
  onProcessed,
}: {
  invoice: SalesInvoiceDocument;
  canApprove: boolean;
  canReceivePayment: boolean;
  paymentOnly?: boolean;
  onClose: () => void;
  onProcessed: (message: string) => void | Promise<void>;
}) {
  type TargetStatus = "UNCHANGED" | "DRAFT" | "READY" | "COMPLETED";
  const [targetStatus, setTargetStatus] = useState<TargetStatus>("UNCHANGED");
  const [withPayment, setWithPayment] = useState(paymentOnly);
  const [amount, setAmount] = useState(invoice.outstandingAmount);
  const [accounts, setAccounts] = useState<SalesFinancialAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [method, setMethod] = useState("CASH");
  const [otherMethod, setOtherMethod] = useState("");
  const [reference, setReference] = useState("");
  const [dueDate, setDueDate] = useState(invoice.dueDate?.slice(0, 10) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [printAfterComplete, setPrintAfterComplete] = useState(true);

  useEffect(() => {
    if (!canReceivePayment || invoice.outstandingAmount <= 0) return;
    void salesApi
      .accounts()
      .then((rows) => {
        setAccounts(rows);
        setAccountId(defaultSalesAccount(rows));
      })
      .catch((caught) => setError(parseApiError(caught)));
  }, [canReceivePayment, invoice.outstandingAmount]);

  const paymentAmount =
    invoice.partyType === "GUEST" ? invoice.outstandingAmount : amount;
  const remaining = Math.max(
    0,
    invoice.outstandingAmount - (withPayment ? paymentAmount : 0),
  );
  const submit = async () => {
    if (busy) return;
    const selectedStatus =
      targetStatus === "UNCHANGED" ? undefined : targetStatus;
    const changesStatus = Boolean(selectedStatus);
    if (!changesStatus && !withPayment) {
      setError("Pilih perubahan status atau aktifkan pembayaran.");
      return;
    }
    if (changesStatus && !canApprove) {
      setError("Permission Anda tidak dapat mengubah status Sales Invoice.");
      return;
    }
    if (withPayment) {
      if (!canReceivePayment) {
        setError("Permission Anda tidak dapat menerima pembayaran.");
        return;
      }
      if (
        !Number.isFinite(paymentAmount) ||
        paymentAmount <= 0 ||
        paymentAmount > invoice.outstandingAmount
      ) {
        setError(
          "Nominal pembayaran harus lebih dari nol dan tidak melebihi outstanding.",
        );
        return;
      }
      if (!accountId) {
        setError("Pilih akun penerima pembayaran.");
        return;
      }
      if (method === "LAINNYA" && !otherMethod.trim()) {
        setError("Isi nama metode pembayaran.");
        return;
      }
    }
    if (
      targetStatus === "COMPLETED" &&
      invoice.partyType === "GUEST" &&
      remaining > 0
    ) {
      setError(
        "Guest harus membayar lunas sebelum Sales Invoice diselesaikan.",
      );
      return;
    }
    if (
      targetStatus === "COMPLETED" &&
      invoice.partyType === "CUSTOMER" &&
      remaining > 0 &&
      !dueDate
    ) {
      setError("Isi tanggal jatuh tempo untuk sisa kredit customer.");
      return;
    }
    const payment = withPayment
      ? {
          financialAccountId: accountId,
          paymentAmount,
          paymentMethod: method,
          otherPaymentMethod:
            method === "LAINNYA" ? otherMethod.trim() : undefined,
          paymentDate: new Date().toISOString(),
          referenceNumber:
            method === "CASH" ? undefined : reference.trim() || undefined,
        }
      : undefined;
    setBusy(true);
    setError("");
    try {
      if (changesStatus && payment) {
        await salesApi.processInvoice(invoice.salesInvoiceId, {
          targetStatus: selectedStatus,
          dueDate:
            selectedStatus === "COMPLETED" && remaining > 0
              ? dueDate
              : undefined,
          payment,
        });
      } else if (selectedStatus) {
        await salesApi.changeInvoiceStatus(
          invoice.salesInvoiceId,
          selectedStatus,
          selectedStatus === "COMPLETED" && remaining > 0 ? dueDate : undefined,
        );
      } else if (payment) {
        await salesApi.receivePayment(invoice.salesInvoiceId, payment);
      }
      if (selectedStatus === "COMPLETED" && printAfterComplete) {
        await printCompletedInvoice(await salesApi.invoice(invoice.salesInvoiceId));
      }
      await onProcessed(
        changesStatus && payment
          ? "Status dan pembayaran Sales Invoice berhasil diproses."
          : changesStatus
            ? "Status Sales Invoice berhasil diperbarui."
            : "Pembayaran Sales Invoice berhasil dicatat.",
      );
    } catch (caught) {
      setError(parseApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogOverlay className="fixed inset-0 z-[70] bg-black/50" />
      <DialogContent className="z-[80] flex max-h-[92dvh] w-[calc(100vw-1rem)] flex-col overflow-hidden border-slate-200 bg-white p-0 shadow-2xl sm:max-w-2xl">
        <DialogHeader className="border-b px-4 py-4 sm:px-6">
          <DialogTitle className="text-base font-black uppercase text-slate-900">
            {paymentOnly ? "Pembayaran" : "Proses / Bayar"} {invoice.salesInvoiceNumber}
          </DialogTitle>
          <p className="text-xs text-slate-500">
            {paymentOnly ? "Catat pembayaran baru untuk mengurangi sisa piutang customer." : "Ubah status, catat pembayaran, atau lakukan keduanya sekaligus."}
          </p>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          <div className={`grid grid-cols-2 gap-2 ${paymentOnly ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
            <Mini label="CUSTOMER" value={invoice.customerName} />
            {!paymentOnly && <Mini label="STATUS" value={invoice.status} />}
            <Mini label="TOTAL" value={rupiah(invoice.invoiceTotal)} />
            <Mini
              label="OUTSTANDING"
              value={rupiah(invoice.outstandingAmount)}
            />
          </div>

          {!paymentOnly && <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-black uppercase text-blue-900">
                  Status Dokumen
                </h3>
                <p className="text-[10px] text-blue-700">
                  Pilih “Tidak diubah” jika hanya ingin menerima pembayaran.
                </p>
              </div>
              <CalendarClock className="h-5 w-5 text-blue-600" />
            </div>
            <select
              value={targetStatus}
              disabled={!canApprove || invoice.status === "COMPLETED"}
              onChange={(event) =>
                setTargetStatus(event.target.value as TargetStatus)
              }
              className="sales-input bg-white disabled:bg-slate-100"
            >
              <option value="UNCHANGED">
                Tidak diubah — tetap {invoice.status}
              </option>
              {invoice.status !== "COMPLETED" && (
                <>
                  <option value="DRAFT">DRAFT — belum dikemas</option>
                  <option value="READY">READY — sudah dikemas</option>
                  <option value="COMPLETED">COMPLETED — barang keluar</option>
                </>
              )}
            </select>
          </section>}
          {!paymentOnly && targetStatus === "COMPLETED" && <label className="flex items-center gap-2 rounded-lg border bg-white p-3 text-xs font-bold"><input type="checkbox" checked={printAfterComplete} onChange={(event)=>setPrintAfterComplete(event.target.checked)}/>Cetak struk setelah Sales Invoice selesai</label>}

          <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-black uppercase text-emerald-900">
                  Pembayaran
                </h3>
                <p className="text-[10px] text-emerald-700">
                  Setiap pembayaran menjadi transaksi baru; pembayaran lama
                  tidak diubah.
                </p>
              </div>
              {!paymentOnly && <label className="flex items-center gap-2 text-xs font-black text-emerald-900">
                <input
                  type="checkbox"
                  checked={withPayment}
                  disabled={
                    !canReceivePayment || invoice.outstandingAmount <= 0
                  }
                  onChange={(event) => setWithPayment(event.target.checked)}
                />
                Bayar sekarang
              </label>}
            </div>
            {withPayment && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-[10px] font-black text-slate-600">
                  NOMINAL DITERIMA
                  <input
                    type="number"
                    min="0.01"
                    max={invoice.outstandingAmount}
                    disabled={invoice.partyType === "GUEST"}
                    value={paymentAmount || ""}
                    onChange={(event) => setAmount(Number(event.target.value))}
                    className="sales-input mt-1 bg-white disabled:bg-slate-100"
                  />
                  {invoice.partyType === "GUEST" && (
                    <span className="mt-1 block text-[9px] text-amber-700">
                      Guest wajib melunasi seluruh outstanding.
                    </span>
                  )}
                </label>
                <label className="text-[10px] font-black text-slate-600">
                  AKUN PENERIMA
                  <select
                    value={accountId}
                    onChange={(event) => setAccountId(event.target.value)}
                    className="sales-input mt-1 bg-white"
                  >
                    <option value="">Pilih Kas/Bank...</option>
                    {accounts.map((account) => (
                      <option
                        key={account.financialAccountId}
                        value={account.financialAccountId}
                      >
                        {account.accountName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[10px] font-black text-slate-600">
                  METODE PENERIMAAN
                  <select
                    value={method}
                    onChange={(event) => setMethod(event.target.value)}
                    className="sales-input mt-1 bg-white"
                  >
                    {[
                      "CASH",
                      "TRANSFER",
                      "QRIS",
                      "DEBIT_CARD",
                      "CREDIT_CARD",
                      "E_WALLET",
                      "GIRO",
                      "LAINNYA",
                    ].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                {method === "LAINNYA" && (
                  <label className="text-[10px] font-black text-slate-600">
                    NAMA METODE
                    <input
                      value={otherMethod}
                      onChange={(event) => setOtherMethod(event.target.value)}
                      className="sales-input mt-1 bg-white"
                    />
                  </label>
                )}
                {method !== "CASH" && (
                  <label className="text-[10px] font-black text-slate-600">
                    NO. BUKTI (OPSIONAL)
                    <input
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      className="sales-input mt-1 bg-white"
                    />
                  </label>
                )}
                <div className="rounded-lg border border-emerald-200 bg-white p-3 text-xs">
                  <span className="text-slate-500">
                    Sisa setelah pembayaran
                  </span>
                  <p className="font-black text-emerald-800">
                    {rupiah(remaining)}
                  </p>
                </div>
              </div>
            )}
          </section>

          {targetStatus === "COMPLETED" &&
            invoice.partyType === "CUSTOMER" &&
            remaining > 0 && (
              <label className="block rounded-xl border border-amber-200 bg-amber-50 p-4 text-[10px] font-black text-amber-900">
                JATUH TEMPO SISA KREDIT
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="sales-input mt-1 bg-white"
                />
              </label>
            )}
          <div
            role="alert"
            className="min-h-10 rounded-lg text-xs font-semibold text-rose-600"
          >
            {error}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t bg-white p-4 sm:px-6">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Batal
          </Button>
          <Button
            disabled={busy}
            onClick={() => void submit()}
            className="bg-[#326dc8] text-white"
          >
            {busy ? "Memproses..." : "Konfirmasi Proses"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SalesDetailDialog({
  kind,
  data,
  accountsPermission,
  canApprove,
  onClose,
  onChanged,
}: {
  kind: "SO" | "SI";
  data: SalesOrderDocument | SalesInvoiceDocument;
  accountsPermission: boolean;
  canApprove: boolean;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const invoice = kind === "SI" ? (data as SalesInvoiceDocument) : null;
  const order = kind === "SO" ? (data as SalesOrderDocument) : null;
  const [accounts, setAccounts] = useState<SalesFinancialAccount[]>([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [amount, setAmount] = useState(invoice?.outstandingAmount ?? 0);
  const [accountId, setAccountId] = useState("");
  const [method, setMethod] = useState("CASH");
  const [otherMethod, setOtherMethod] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (invoice && accountsPermission)
      void salesApi
        .accounts()
        .then((rows) => {
          setAccounts(rows);
          setAccountId(defaultSalesAccount(rows));
        })
        .catch((caught) => setError(parseApiError(caught)));
  }, [invoice, accountsPermission]);
  const action = async (type: "COMPLETE" | "CANCEL" | "PAY") => {
    if (!invoice && type !== "CANCEL") return;
    setBusy(true);
    setError("");
    try {
      if (type === "COMPLETE")
        await salesApi.completeInvoice(invoice!.salesInvoiceId);
      else if (type === "CANCEL") {
        if (kind === "SI")
          await salesApi.cancelInvoice(invoice!.salesInvoiceId);
        else await salesApi.cancelOrder(order!.salesOrderId);
      } else
        await salesApi.receivePayment(invoice!.salesInvoiceId, {
          financialAccountId: accountId,
          paymentAmount: amount,
          paymentMethod: method,
          otherPaymentMethod: method === "LAINNYA" ? otherMethod : undefined,
          paymentDate: new Date().toISOString(),
          referenceNumber:
            method === "CASH" ? undefined : reference || undefined,
        });
      onChanged(
        type === "PAY"
          ? "Pembayaran berhasil dicatat."
          : type === "COMPLETE"
            ? "Sales Invoice berhasil diselesaikan."
            : "Dokumen berhasil dibatalkan.",
      );
    } catch (caught) {
      setError(parseApiError(caught));
    } finally {
      setBusy(false);
    }
  };
  const print = async () => {
    try {
      await printSalesReceipt({
        documentNumber: kind === "SI" ? invoice!.salesInvoiceNumber : order!.salesOrderNumber,
        customerName: data.customerName,
        transactionDate: dateLabel(kind === "SI" ? invoice!.invoiceDate : order!.orderDate),
        items: (data.details ?? []).map(line => ({ productName: line.productName, unitName: line.unitName, quantity: line.quantity, bonusQuantity: line.bonusQuantity, subtotal: line.subtotal })),
        discountAmount: kind === "SI" ? invoice!.discountAmount : order!.discountAmount,
        grandTotal: kind === "SI" ? invoice!.invoiceTotal : order!.orderTotal,
        paidAmount: kind === "SI" ? invoice!.paidAmount : undefined,
        outstandingAmount: kind === "SI" ? invoice!.outstandingAmount : undefined,
        note: data.note,
      });
    } catch (caught) {
      setError(parseApiError(caught));
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogOverlay className="fixed inset-0 z-50 bg-black/50" />
      <DialogContent
        className="z-[60] flex max-h-[92dvh] flex-col overflow-hidden rounded-xl border-slate-200 bg-white p-6 shadow-2xl"
        style={{ maxWidth: "100vw", width: "1000px" }}
      >
        <DialogHeader className="border-b border-slate-100 pb-3">
          <DialogTitle className="flex items-center justify-between gap-3 text-base font-black uppercase">
            <span>
              Detail {kind === "SI" ? "Sales Invoice" : "Sales Order"}:{" "}
              {kind === "SI"
                ? invoice!.salesInvoiceNumber
                : order!.salesOrderNumber}
            </span>
            <Status value={data.status} />
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto py-4 pr-1">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Mini label="CUSTOMER" value={data.customerName} />
            <Mini label="STATUS" value={data.status} />
            <Mini
              label="TANGGAL"
              value={dateLabel(
                kind === "SI" ? invoice!.invoiceDate : order!.orderDate,
              )}
            />
            <Mini
              label="TOTAL"
              value={rupiah(
                kind === "SI" ? invoice!.invoiceTotal : order!.orderTotal,
              )}
            />
            {invoice && (
              <>
                <Mini
                  label="JENIS PEMBAYARAN"
                  value={invoice.paymentType === "CREDIT" ? "KREDIT" : "TUNAI"}
                />
                <Mini label="STATUS PEMBAYARAN" value={invoice.statusPayment} />
              </>
            )}
          </div>
          <div className="mt-5 overflow-x-auto rounded-xl border">
            <table className="min-w-[720px] w-full text-xs">
              <thead className="bg-slate-100 text-[9px] font-black text-slate-500">
                <tr>
                  <th className="p-3 text-left">PRODUK</th>
                  <th className="p-3">QTY</th>
                  <th className="p-3">HARGA</th>
                  <th className="p-3">DISKON</th>
                  <th className="p-3">BONUS</th>
                  <th className="p-3 text-right">SUBTOTAL</th>
                </tr>
              </thead>
              <tbody>
                {data.details?.map((line) => (
                  <tr
                    key={line.salesInvoiceDetailId ?? line.salesOrderDetailId}
                    className="border-t"
                  >
                    <td className="p-3 font-bold">
                      {line.productName}
                      <p className="text-[10px] font-normal text-slate-500">
                        {line.unitName}
                      </p>
                    </td>
                    <td className="p-3 text-center">{line.quantity}</td>
                    <td className="p-3 text-right">{rupiah(line.unitPrice)}</td>
                    <td className="p-3 text-right">
                      {rupiah(line.discountAmount)}
                    </td>
                    <td className="p-3 text-center">{line.bonusQuantity}</td>
                    <td className="p-3 text-right font-black">
                      {rupiah(line.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {invoice && (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border p-4">
                <h3 className="text-xs font-black">Ringkasan Pembayaran</h3>
                <div className="mt-2">
                  <Mini label="TERBAYAR" value={rupiah(invoice.paidAmount)} />
                  <div className="mt-2">
                    <Mini
                      label="OUTSTANDING"
                      value={rupiah(invoice.outstandingAmount)}
                    />
                  </div>
                </div>
              </div>
              <div className="rounded-xl border p-4">
                <h3 className="mb-2 text-xs font-black">Histori Pembayaran</h3>
                {invoice.payments?.length ? (
                  <div className="space-y-2">
                    {invoice.payments.map((payment) => (
                      <div
                        key={payment.salesPaymentId}
                        className="flex justify-between rounded-lg bg-slate-50 p-2 text-[10px]"
                      >
                        <div>
                          <b>{payment.paymentNumber}</b>
                          <p>
                            {payment.accountName} · {payment.paymentMethod}
                          </p>
                        </div>
                        <div className="text-right">
                          <b>{rupiah(payment.paymentAmount)}</b>
                          <p>{payment.holdingStatus ?? "APPLIED"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Belum ada pembayaran.
                  </p>
                )}
              </div>
            </div>
          )}
          {paymentOpen && invoice && (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <h3 className="text-sm font-black text-emerald-900">
                Terima Pembayaran
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-[10px] font-black">
                  NOMINAL
                  <input
                    type="number"
                    min="0.01"
                    max={invoice.outstandingAmount}
                    disabled={invoice.partyType === "GUEST"}
                    value={amount || ""}
                    onChange={(event) => setAmount(Number(event.target.value))}
                    className="sales-input mt-1"
                  />
                  {invoice.partyType === "GUEST" && (
                    <span className="mt-1 block text-[9px] font-semibold text-amber-700">
                      Guest harus melunasi seluruh outstanding.
                    </span>
                  )}
                </label>
                <label className="text-[10px] font-black">
                  AKUN
                  <select
                    value={accountId}
                    onChange={(event) => setAccountId(event.target.value)}
                    className="sales-input mt-1"
                  >
                    {accounts.map((account) => (
                      <option
                        key={account.financialAccountId}
                        value={account.financialAccountId}
                      >
                        {account.accountName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[10px] font-black">
                  METODE
                  <select
                    value={method}
                    onChange={(event) => setMethod(event.target.value)}
                    className="sales-input mt-1"
                  >
                    {[
                      "CASH",
                      "TRANSFER",
                      "QRIS",
                      "DEBIT_CARD",
                      "CREDIT_CARD",
                      "E_WALLET",
                      "GIRO",
                      "LAINNYA",
                    ].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                {method === "LAINNYA" && (
                  <label className="text-[10px] font-black">
                    METODE LAIN
                    <input
                      value={otherMethod}
                      onChange={(event) => setOtherMethod(event.target.value)}
                      className="sales-input mt-1"
                    />
                  </label>
                )}
                {method !== "CASH" && (
                  <label className="text-[10px] font-black">
                    NO. BUKTI TRANSFER / PEMBAYARAN (OPSIONAL)
                    <input
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      placeholder="Nomor bukti transaksi dari bank/aplikasi"
                      className="sales-input mt-1"
                    />
                  </label>
                )}
              </div>
              <button
                disabled={busy}
                onClick={() => void action("PAY")}
                className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white"
              >
                Catat Pembayaran
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-white pt-3">
          <button
            onClick={() => void print()}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-bold"
          >
            <Printer className="h-4 w-4" />
            Cetak
          </button>
          <div className="flex flex-wrap gap-2">
            {invoice &&
              accountsPermission &&
              invoice.outstandingAmount > 0 &&
              invoice.status !== "CANCELLED" && (
                <button
                  onClick={() => setPaymentOpen((value) => !value)}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white"
                >
                  <Banknote className="h-4 w-4" />
                  Terima Pembayaran
                </button>
              )}
            {invoice &&
              canApprove &&
              ["DRAFT", "READY"].includes(invoice.status) && (
                <button
                  disabled={busy}
                  onClick={() => void action("COMPLETE")}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white"
                >
                  <CalendarDays className="h-4 w-4" />
                  Selesaikan
                </button>
              )}
            {canApprove && ["DRAFT", "READY"].includes(data.status) && (
              <button
                disabled={busy}
                onClick={() => void action("CANCEL")}
                className="rounded-lg border border-red-200 px-4 py-2 text-xs font-black text-red-600"
              >
                Batalkan
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg border px-4 py-2 text-xs font-bold"
            >
              Tutup
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
