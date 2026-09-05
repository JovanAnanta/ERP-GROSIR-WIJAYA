import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Download,
  Plus,
  Save,
  Scissors,
  Printer,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  defaultSalesAccount,
  resolveSalesPaymentAmount,
  salesOrderReference,
  formatSalesStock,
} from "./sales-form.utils";
import { parseApiError } from "@/utils/error";
import { hasPermission, useAuthStore } from "@/store/authStore";
import WhatsappImportPanel from "./WhatsappImportPanel";
import {
  importedSalesLine,
  appendImportedLines,
  editSalesLine,
  importValidationError,
  salesLinePayload,
  splitSalesFormLine,
  type SalesFormLine,
} from "./whatsapp-import.utils";
import {
  salesApi,
  type SalesChannel,
  type SalesCustomerOption,
  type SalesFinancialAccount,
  type SalesInvoicePayload,
  type SalesItemPayload,
  type SalesOrderDocument,
  type SalesOrderPayload,
  type SalesProductOption,
} from "./sales.api";
import {
  printSalesReceipt,
  type ReceiptPartCount,
} from "./sales-receipt";

type Kind = "SO" | "SI";
type Line = SalesFormLine;
type PaymentChoice = "UNPAID" | "PARTIAL" | "PAID";

const today = () => new Date().toISOString().slice(0, 10);
const emptyLine = (): Line => ({
  key: crypto.randomUUID(),
  productId: "",
  productUnitId: "",
  quantity: 0,
  unitPrice: 0,
  discountAmount: 0,
  bonusQuantity: 0,
  note: "",
});
const rupiah = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;

interface Props {
  kind: Kind;
  editingId?: string | null;
  canApprove: boolean;
  onSuccess: (message: string) => void;
  onCancel: () => void;
}

export default function SalesDocumentForm({
  kind,
  editingId,
  canApprove,
  onSuccess,
  onCancel,
}: Props) {
  const user = useAuthStore((state) => state.user);
  const canImport = hasPermission(user, "SALES_IMPORT");
  const [customers, setCustomers] = useState<SalesCustomerOption[]>([]);
  const [products, setProducts] = useState<SalesProductOption[]>([]);
  const [accounts, setAccounts] = useState<SalesFinancialAccount[]>([]);
  const [orders, setOrders] = useState<SalesOrderDocument[]>([]);
  const [customerId, setCustomerId] = useState("");
  const partyType = customerId ? "CUSTOMER" : "GUEST";
  const [customerName, setCustomerName] = useState("");
  const [salesChannel, setSalesChannel] = useState<SalesChannel>("MANUAL");
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>("PAID");
  const paymentType: "CASH" | "CREDIT" =
    customerId && paymentChoice !== "PAID" ? "CREDIT" : "CASH";
  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [discount, setDiscount] = useState(0);
  const [snapshotMode, setSnapshotMode] = useState<
    "MERGE" | "REWRITE" | "IGNORE"
  >("MERGE");
  const [note, setNote] = useState("");
  const [sourceOrderId, setSourceOrderId] = useState("");
  const [sourceOrderNumber, setSourceOrderNumber] = useState("");
  const [invoiceLines, setInvoiceLines] = useState<Line[]>(() =>
    Array.from({ length: 7 }, emptyLine),
  );
  const [orderLines, setOrderLines] = useState<Line[]>([]);
  const [paymentOverride, setPaymentOverride] = useState<number | null>(null);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [otherMethod, setOtherMethod] = useState("");
  const [accountId, setAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [hydrating, setHydrating] = useState(Boolean(editingId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySelection, setHistorySelection] = useState<string[]>([]);
  const [historyTarget, setHistoryTarget] = useState<"SI" | "SO">("SI");
  const [splitMode, setSplitMode] = useState(false);
  const [splitLineKey, setSplitLineKey] = useState<string | null>(null);
  const [deferredQuantity, setDeferredQuantity] = useState(0);
  const [deferredBonusQuantity, setDeferredBonusQuantity] = useState(0);
  const [receiptParts, setReceiptParts] = useState<ReceiptPartCount>(1);

  const printCurrentInvoice = async () => {
    const currentLines = filled(invoiceLines);
    if (!currentLines.length) {
      setError("Minimal satu produk harus diisi sebelum mencetak bon.");
      return;
    }
    try {
      await printSalesReceipt({
        documentNumber: editingId ? sourceOrderNumber || "PREVIEW" : "PREVIEW",
        customerName: customerName || "Guest",
        transactionDate: date,
        items: currentLines.map((line) => {
        const product = products.find((item) => item.productId === line.productId);
        const unit = product?.units.find((item) => item.productUnitId === line.productUnitId);
          return { productName: product?.productName || "Produk", unitName: unit?.unitName || "", quantity: line.quantity, bonusQuantity: line.bonusQuantity, subtotal: Math.max(0, line.quantity * line.unitPrice - line.discountAmount) };
        }),
        discountAmount: discount,
        grandTotal: totals.invoice,
        note,
        preview: true,
      }, receiptParts);
    } catch (caught) {
      setError(parseApiError(caught));
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      salesApi.customers(),
      salesApi.products(),
      kind === "SI" ? salesApi.accounts() : Promise.resolve([]),
      kind === "SI" ? salesApi.readyOrders() : Promise.resolve([]),
    ])
      .then(([customerRows, productRows, accountRows, orderRows]) => {
        if (!active) return;
        setCustomers(customerRows);
        setProducts(productRows);
        setAccounts(accountRows);
        setOrders(orderRows);
        setAccountId(defaultSalesAccount(accountRows));
      })
      .catch((caught) => setError(parseApiError(caught)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [kind]);

  useEffect(() => {
    let active = true;
    void salesApi
      .products(customerId || undefined)
      .then((rows) => {
        if (active) setProducts(rows);
      })
      .catch((caught) => {
        if (active) setError(parseApiError(caught));
      });
    return () => {
      active = false;
    };
  }, [customerId]);

  useEffect(() => {
    if (!editingId || loading) return;
    const hydrate = async () => {
      try {
        if (kind === "SO") {
          const doc = await salesApi.order(editingId);
          setCustomerId(doc.customerId ?? "");
          setCustomerName(doc.customerName);
          setDate(doc.orderDate.slice(0, 10));
          setSalesChannel(doc.salesChannel);
          setDiscount(doc.discountAmount);
          setNote(doc.note ?? "");
          setInvoiceLines(doc.details.map(detailToLine));
        } else {
          const doc = await salesApi.invoice(editingId);
          setCustomerId(doc.customerId ?? "");
          setCustomerName(doc.customerName);
          setSalesChannel(doc.salesChannel);
          setPaymentChoice(doc.statusPayment);
          setDate(doc.invoiceDate.slice(0, 10));
          setDueDate(doc.customerId ? (doc.dueDate?.slice(0, 10) ?? "") : "");
          setPaidAmount(doc.paidAmount);
          setDiscount(doc.discountAmount);
          setNote(doc.note ?? "");
          setSourceOrderId(doc.salesOrderId ?? "");
          setSourceOrderNumber(doc.salesOrderNumber ?? "SO terkait");
          setInvoiceLines((doc.details ?? []).map(detailToLine));
        }
      } catch (caught) {
        setError(parseApiError(caught));
      } finally {
        setHydrating(false);
      }
    };
    void hydrate();
  }, [editingId, kind, loading]);

  const selectedCustomer = customers.find(
    (item) => item.customerId === customerId,
  );
  // The receipt preview intentionally reads this memoized aggregate without
  // changing form state; preserving it avoids recalculating all lines on input focus.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const totals = useMemo(() => {
    const calculate = (lines: Line[]) =>
      lines
        .filter((line) => line.productUnitId)
        .reduce(
          (sum, line) =>
            sum +
            Math.max(0, line.quantity * line.unitPrice - line.discountAmount),
          0,
        );
    return {
      invoice: Math.max(0, calculate(invoiceLines) - discount),
      order: calculate(orderLines),
    };
  }, [invoiceLines, orderLines, discount]);
  const paymentAmount = editingId
    ? 0
    : resolveSalesPaymentAmount(totals.invoice, paymentOverride);
  const customerHistory = products.flatMap((product) =>
    product.units
      .filter((unit) => unit.priceSource === "CUSTOMER")
      .map((unit) => ({ product, unit })),
  );
  const insertCustomerHistory = () => {
    const chosen = customerHistory.filter(({ unit }) => historySelection.includes(unit.productUnitId));
    const setter = historyTarget === "SI" ? setInvoiceLines : setOrderLines;
    setter((current) => {
      const next = [...current];
      for (const { product, unit } of chosen) {
        if (next.some((line) => line.productUnitId === unit.productUnitId)) continue;
        const row = { ...emptyLine(), productId: product.productId, productUnitId: unit.productUnitId, unitPrice: unit.suggestedPrice };
        const emptyIndex = next.findIndex((line) => !line.productUnitId);
        if (emptyIndex >= 0) next[emptyIndex] = row;
        else next.push(row);
      }
      return next;
    });
    setHistoryOpen(false);
    setHistorySelection([]);
  };
  const openCustomerHistory = (target: "SI" | "SO") => {
    setHistoryTarget(target);
    setHistorySelection([]);
    setHistoryOpen(true);
  };
  const totalPaid = paidAmount + paymentAmount;

  const productFor = (line: Line) =>
    products.find(
      (product) =>
        product.productId === line.productId ||
        product.units.some((unit) => unit.productUnitId === line.productUnitId),
    );
  const unitFor = (line: Line) =>
    productFor(line)?.units.find(
      (unit) => unit.productUnitId === line.productUnitId,
    );
  const updateLine = (side: "SI" | "SO", key: string, patch: Partial<Line>) => {
    const setter = side === "SI" ? setInvoiceLines : setOrderLines;
    setter((current) =>
      current.map((line) =>
        line.key === key ? editSalesLine(line, patch) : line,
      ),
    );
  };
  const selectProduct = (side: "SI" | "SO", key: string, productId: string) => {
    const product = products.find((item) => item.productId === productId);
    const previous = (side === "SI" ? invoiceLines : orderLines).find(
      (line) => line.key === key,
    );
    const unit = previous?.sourceText
      ? product?.units.find(
          (item) => item.productUnitId === previous.productUnitId,
        )
      : product?.units[0];
    updateLine(side, key, {
      productId,
      productUnitId: unit?.productUnitId ?? "",
      unitPrice: unit?.suggestedPrice ?? 0,
      priceMissing: !unit?.hasSuggestedPrice,
    });
  };
  const selectUnit = (
    side: "SI" | "SO",
    key: string,
    productUnitId: string,
  ) => {
    const lines = side === "SI" ? invoiceLines : orderLines;
    const line = lines.find((item) => item.key === key);
    const unit = line
      ? productFor(line)?.units.find(
          (item) => item.productUnitId === productUnitId,
        )
      : undefined;
    updateLine(side, key, {
      productUnitId,
      unitPrice: unit?.suggestedPrice ?? 0,
      priceMissing: !unit?.hasSuggestedPrice,
    });
  };
  const addLine = (side: "SI" | "SO") => {
    const setter = side === "SI" ? setInvoiceLines : setOrderLines;
    setter((current) => [...current, emptyLine()]);
  };
  const removeLine = (side: "SI" | "SO", key: string) => {
    const setter = side === "SI" ? setInvoiceLines : setOrderLines;
    setter((current) => current.filter((line) => line.key !== key));
  };
  const moveToOrder = (key: string) => {
    const line = invoiceLines.find((item) => item.key === key);
    if (!line) return;
    setInvoiceLines((current) => current.filter((item) => item.key !== key));
    setOrderLines((current) => [
      ...current,
      { ...line, key: crypto.randomUUID() },
    ]);
  };
  const moveToInvoice = (key: string) => {
    const line = orderLines.find((item) => item.key === key);
    if (!line) return;
    setOrderLines((current) => current.filter((item) => item.key !== key));
    setInvoiceLines((current) => [
      ...current,
      { ...line, key: crypto.randomUUID() },
    ]);
  };
  const openSplitLine = (key: string) => {
    const line = invoiceLines.find((item) => item.key === key);
    const unit = line ? unitFor(line) : undefined;
    if (!line || line.quantity <= 0) return;
    setSplitLineKey(key);
    setDeferredQuantity(
      unit && line.quantity > unit.availableQty
        ? line.quantity - unit.availableQty
        : 0,
    );
    setDeferredBonusQuantity(0);
  };
  const applySplitLine = () => {
    const line = invoiceLines.find((item) => item.key === splitLineKey);
    if (!line) return;
    try {
      const split = splitSalesFormLine(
        line,
        deferredQuantity,
        deferredBonusQuantity,
      );
      setInvoiceLines((current) =>
        current.map((item) =>
          item.key === line.key ? split.invoiceLine : item,
        ),
      );
      // A referenced SO already retains every quantity not allocated to this SI.
      // Only a direct SI needs a new deferred SO document.
      if (!sourceOrderId)
        setOrderLines((current) => [...current, split.orderLine]);
      setSplitLineKey(null);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Pembagian qty tidak valid.");
    }
  };

  const loadOrder = (id: string) => {
    setSourceOrderId(id);
    const order = orders.find((item) => item.salesOrderId === id);
    setSourceOrderNumber(order?.salesOrderNumber ?? "");
    if (!order) {
      setInvoiceLines((lines) =>
        lines.map((line) => ({ ...line, salesOrderDetailId: undefined })),
      );
      return;
    }
    const reference = salesOrderReference(order);
    setCustomerId(reference.customerId);
    setCustomerName(reference.customerName);
    setSalesChannel(reference.salesChannel);
    setNote(reference.note);
    setDiscount(reference.discountAmount);
    setPaymentChoice("PAID");
    setDueDate("");
    setOrderLines([]);
    setPaymentOverride(null);
    setInvoiceLines(
      reference.items.map((line) => ({
        ...line,
        key: crypto.randomUUID(),
        productId: "",
      })),
    );
  };

  const filled = (lines: Line[]) =>
    lines.filter((line) => line.productUnitId && line.quantity > 0);
  const validate = (status: "DRAFT" | "READY" | "COMPLETED") => {
    const importError = importValidationError([...invoiceLines, ...orderLines]);
    if (importError) return importError;
    if (
      [...invoiceLines, ...orderLines].some(
        (line) => line.productUnitId && line.quantity <= 0,
      )
    )
      return "Qty produk yang dipilih harus lebih besar dari nol.";
    if (!filled(invoiceLines).length)
      return `Minimal satu produk harus ada pada ${kind}.`;
    for (const line of filled(invoiceLines)) {
      if (
        kind === "SI" &&
        !editingId &&
        line.quantity + line.bonusQuantity > (unitFor(line)?.availableQty ?? 0)
      )
        return `Stok ${productFor(line)?.productName ?? "produk"} tidak cukup. Kurangi qty SI atau gunakan Bagi SI & SO.`;
    }
    if (
      kind === "SI" &&
      status === "COMPLETED" &&
      partyType === "GUEST" &&
      totalPaid < totals.invoice
    )
      return "Guest harus membayar lunas sebelum COMPLETED.";
    if (
      kind === "SI" &&
      status === "COMPLETED" &&
      partyType === "CUSTOMER" &&
      totalPaid < totals.invoice &&
      !dueDate
    )
      return "Tanggal jatuh tempo wajib diisi untuk transaksi yang belum lunas.";
    if (kind === "SI" && totalPaid > totals.invoice)
      return "Pembayaran tidak boleh melebihi total invoice.";
    if (
      kind === "SI" &&
      partyType === "GUEST" &&
      totalPaid > 0 &&
      totalPaid < totals.invoice
    )
      return "Guest hanya dapat memilih belum bayar atau bayar lunas.";
    if (
      kind === "SI" &&
      paymentChoice === "PARTIAL" &&
      (totalPaid <= 0 || totalPaid >= totals.invoice)
    )
      return "Bayar sebagian harus lebih dari nol dan lebih kecil dari total invoice.";
    if (kind === "SI" && paymentAmount > 0 && !accountId)
      return "Pilih akun penerima pembayaran.";
    return "";
  };

  const save = async (status: "DRAFT" | "READY" | "COMPLETED") => {
    if (saving || hydrating) return;
    const validation = validate(status);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (kind === "SO") {
        const payload: SalesOrderPayload = {
          customerId: customerId || undefined,
          customerName: customerName || undefined,
          orderDate: date,
          status: status === "READY" ? "READY" : "DRAFT",
          salesChannel,
          discountAmount: discount,
          note: note || undefined,
          items: filled(invoiceLines).map(toPayload),
        };
        if (editingId) await salesApi.updateOrder(editingId, payload);
        else await salesApi.createOrder(payload);
      } else {
        const payload: SalesInvoicePayload = {
          salesOrderId: sourceOrderId || undefined,
          customerId: partyType === "CUSTOMER" ? customerId : undefined,
          partyType,
          customerName: customerName || undefined,
          salesChannel,
          paymentType: customerId ? paymentType : "CASH",
          invoiceDate: date,
          dueDate: customerId ? dueDate || undefined : undefined,
          discountAmount: discount,
          status,
          snapshotMode,
          note: note || undefined,
          items: filled(invoiceLines).map(toPayload),
          orderItems: filled(orderLines).map(toPayload),
          payments:
            !editingId && paymentAmount > 0
              ? [
                  {
                    financialAccountId: accountId,
                    paymentAmount,
                    paymentMethod,
                    otherPaymentMethod:
                      paymentMethod === "LAINNYA" ? otherMethod : undefined,
                    paymentDate: date,
                    referenceNumber:
                      paymentMethod === "CASH"
                        ? undefined
                        : reference || undefined,
                  },
                ]
              : undefined,
        };
        if (editingId) await salesApi.updateInvoice(editingId, payload);
        else await salesApi.createInvoice(payload);
      }
      onSuccess(`${kind} berhasil ${editingId ? "diperbarui" : "dibuat"}.`);
    } catch (caught) {
      setError(parseApiError(caught));
    } finally {
      setSaving(false);
    }
  };

  if (loading || hydrating)
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
        Menyiapkan form Sales...
      </div>
    );

  const changeCustomer = (id: string) => {
    setCustomerId(id);
    setCustomerName(
      customers.find((customer) => customer.customerId === id)?.customerName ??
        "",
    );
    if (!id) {
      if (paymentChoice === "PARTIAL") {
        setPaymentChoice("UNPAID");
        setPaymentOverride(0);
      }
      setDueDate("");
    }
  };
  return (
    <div className="bg-white p-3 sm:p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-full overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart
            className={
              "w-5 h-5 " +
              (kind === "SI" ? "text-emerald-600" : "text-amber-500")
            }
          />
          <h2 className="text-base font-black text-slate-800 uppercase tracking-wide">
            {editingId ? "Edit " : "Buat "}
            {kind === "SI" ? "Sales Invoice (SI)" : "Sales Order (SO)"}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="text-rose-600 hover:bg-rose-50 h-8 text-xs font-bold"
        >
          Kembali
        </Button>
      </div>
      <div
        role={error ? "alert" : undefined}
        className={
          "mb-4 min-h-12 p-3 rounded border flex items-center gap-2 text-xs font-bold " +
          (error
            ? "bg-rose-50 text-rose-700 border-rose-200"
            : "bg-slate-50 border-transparent text-slate-500")
        }
      >
        {error ? (
          <>
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </>
        ) : kind === "SI" ? (
          "Stok direservasi saat SI disimpan. Barang untuk pengiriman berikutnya dapat dipindahkan ke SO."
        ) : (
          "SO mencatat pesanan tanpa mereservasi stok. Data dapat ditarik ke Sales Invoice."
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 bg-slate-50 p-4 rounded-lg border border-slate-200 shrink-0">
        {kind === "SI" && (
          <div className="md:col-span-2">
            <Field label="Tarik Referensi SO (Opsional)">
              <CompactSelect
                value={sourceOrderId}
                onChange={loadOrder}
                disabled={Boolean(editingId)}
                placeholder="-- Buat Faktur Manual (Tanpa SO) --"
                options={[
                  ...orders.map((order) => ({
                    value: order.salesOrderId,
                    label: order.salesOrderNumber + " - " + order.customerName,
                  })),
                  ...(sourceOrderId &&
                  !orders.some((order) => order.salesOrderId === sourceOrderId)
                    ? [{ value: sourceOrderId, label: sourceOrderNumber }]
                    : []),
                ]}
                className="bg-emerald-50 border-emerald-200 text-emerald-700"
              />
            </Field>
          </div>
        )}
        <div className="md:col-span-2">
          <Field label="Customer (Opsional)">
            <CompactSelect
              value={customerId}
              onChange={changeCustomer}
              disabled={Boolean(sourceOrderId)}
              placeholder="-- Guest / Tanpa Customer --"
              options={customers.map((customer) => ({
                value: customer.customerId,
                label: customer.customerName,
              }))}
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label={customerId ? "Nama Customer" : "Nama Guest (Opsional)"}>
            <Input
              value={customerName}
              disabled={Boolean(customerId)}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Guest"
              className="font-bold bg-white h-8 text-xs border-slate-300 disabled:bg-slate-100"
            />
          </Field>
        </div>
        <Field label={kind === "SI" ? "Tanggal Faktur" : "Tanggal Pesanan"}>
          <Input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="font-bold bg-white h-8 text-xs border-slate-300"
          />
        </Field>
        <Field label="Asal Pesanan">
          <CompactSelect
            value={salesChannel}
            onChange={(value) => setSalesChannel(value as SalesChannel)}
            options={[
              "MANUAL",
              "SRC",
              "WHATSAPP",
              "MARKETPLACE",
              "LAINNYA",
            ].map(option)}
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Catatan Dokumen">
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Catatan dokumen (opsional)..."
              className="font-medium bg-white h-8 text-xs border-slate-300"
            />
          </Field>
        </div>
        {selectedCustomer && (
          <div className="md:col-span-2 flex items-center gap-2 text-[11px] text-slate-600">
            <b>{selectedCustomer.customerName}</b>
            <span>Piutang: {rupiah(selectedCustomer.outstandingAmount)}</span>
          </div>
        )}
      </div>

      {canImport && (
        <WhatsappImportPanel
          customerId={customerId}
          disabled={saving || Boolean(sourceOrderId)}
          onImported={(rows) => {
            setInvoiceLines((current) =>
              appendImportedLines(current, rows.map(importedSalesLine)),
            );
            setSalesChannel("WHATSAPP");
            setError("");
          }}
        />
      )}
      <div
        className={
          "grid gap-4 " +
          (kind === "SI" && !sourceOrderId && (splitMode || orderLines.length)
            ? "xl:grid-cols-2"
            : "")
        }
      >
        <LinePanel
          title={
            kind === "SI" ? "Daftar Barang Dijual" : "Daftar Barang Pesanan"
          }
          hint={kind === "SI" ? "Diproses sekarang" : "Belum mereservasi stok"}
          lines={invoiceLines}
          products={products}
          side="SI"
          invoiceMode={kind === "SI" && !editingId}
          sourceLinked={kind === "SI" && Boolean(sourceOrderId)}
          productFor={productFor}
          unitFor={unitFor}
          onProduct={selectProduct}
          onUnit={selectUnit}
          onUpdate={updateLine}
          onAdd={addLine}
          onRemove={removeLine}
          onMove={
            kind === "SI" && !editingId && !sourceOrderId
              ? moveToOrder
              : undefined
          }
          onSplit={
            kind === "SI" && !editingId && splitMode
              ? openSplitLine
              : undefined
          }
          historyAction={
            <>
              {kind === "SI" && !editingId && (
                <Button
                  type="button"
                  variant={splitMode ? "default" : "outline"}
                  size="sm"
                  disabled={splitMode}
                  onClick={() => setSplitMode(true)}
                  className="h-7 text-[10px] font-bold"
                >
                  <Scissors className="mr-1 h-3.5 w-3.5" />
                  {sourceOrderId ? "Bagi Pemenuhan SO" : "Bagi SI & SO"}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!customerId || Boolean(sourceOrderId)}
                title={
                  sourceOrderId
                    ? "Produk dan harga sudah berasal dari SO sumber."
                    : "Tarik produk dan harga dari histori customer"
                }
                onClick={() => openCustomerHistory("SI")}
                className="h-7 text-[10px] font-bold text-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                Tarik Histori Customer
              </Button>
            </>
          }
        />
        {kind === "SI" && sourceOrderId && splitMode && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
            Qty yang tidak dimasukkan ke SI tetap tercatat sebagai sisa pada {sourceOrderNumber}.
            Tidak dibuatkan SO baru.
          </div>
        )}
        {kind === "SI" &&
          !sourceOrderId &&
          (splitMode || orderLines.length > 0) && (
          <LinePanel
            title="Dibuat sebagai Sales Order"
            hint="Bagian yang ditunda; belum mereservasi stok"
            lines={orderLines}
            products={products}
            side="SO"
            invoiceMode={false}
            productFor={productFor}
            unitFor={unitFor}
            onProduct={selectProduct}
            onUnit={selectUnit}
            onUpdate={updateLine}
            onAdd={addLine}
            onRemove={removeLine}
            onMove={moveToInvoice}
            historyAction={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!customerId}
                title="Tarik produk dan harga dari histori customer ke SO"
                onClick={() => openCustomerHistory("SO")}
                className="h-7 text-[10px] font-bold text-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                Tarik Histori Customer
              </Button>
            }
          />
        )}
      </div>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}><DialogContent className="flex max-h-[80dvh] max-w-xl flex-col overflow-hidden bg-white"><DialogHeader><DialogTitle>Histori Harga Jual Customer · {historyTarget}</DialogTitle></DialogHeader><div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-2">{customerHistory.map(({product,unit})=><label key={unit.productUnitId} className="flex cursor-pointer items-center justify-between rounded-lg border p-3 hover:border-blue-400"><span className="flex items-center gap-3"><input type="checkbox" checked={historySelection.includes(unit.productUnitId)} onChange={e=>setHistorySelection(old=>e.target.checked?[...old,unit.productUnitId]:old.filter(id=>id!==unit.productUnitId))}/><span><strong className="block text-xs">{product.productName}</strong><small className="text-slate-500">{unit.unitName}</small></span></span><strong className="text-xs text-blue-700">{rupiah(unit.suggestedPrice)}</strong></label>)}{!customerHistory.length&&<p className="py-10 text-center text-xs text-slate-500">Customer ini belum mempunyai histori harga jual.</p>}</div><DialogFooter><Button variant="outline" onClick={()=>setHistoryOpen(false)}>Batal</Button><Button disabled={!historySelection.length} onClick={insertCustomerHistory}>Masukkan ke {historyTarget} ({historySelection.length})</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={Boolean(splitLineKey)} onOpenChange={(open) => !open && setSplitLineKey(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle>Bagi Qty ke SI dan SO</DialogTitle>
          </DialogHeader>
          {(() => {
            const line = invoiceLines.find((item) => item.key === splitLineKey);
            const product = line ? productFor(line) : undefined;
            const unit = line ? unitFor(line) : undefined;
            if (!line) return null;
            const remainingQty = Math.max(0, line.quantity - deferredQuantity);
            const remainingBonus = Math.max(0, line.bonusQuantity - deferredBonusQuantity);
            return (
              <div className="space-y-4 py-2">
                <div className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-sm font-black text-slate-900">{product?.productName ?? "Produk"}</p>
                  <p className="text-xs text-slate-500">Total awal: {line.quantity.toLocaleString("id-ID")} {unit?.unitName ?? ""}</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={sourceOrderId ? "Tetap sebagai sisa SO" : "Qty dibuat SO"}>
                    <Input type="number" min="0" max={line.quantity} step="any" value={deferredQuantity || ""} placeholder="Isi qty yang ditunda" onChange={(event)=>setDeferredQuantity(Number(event.target.value))} />
                  </Field>
                  <Field label="Qty dibuat SI">
                    <Input value={`${remainingQty.toLocaleString("id-ID")} ${unit?.unitName ?? ""}`} disabled className="bg-slate-100 font-bold" />
                  </Field>
                  {line.bonusQuantity > 0 && (
                    <>
                      <Field label={sourceOrderId ? "Bonus tersisa di SO" : "Bonus dibuat SO"}>
                        <Input type="number" min="0" max={line.bonusQuantity} step="any" value={deferredBonusQuantity || ""} placeholder="0" onChange={(event)=>setDeferredBonusQuantity(Number(event.target.value))} />
                      </Field>
                      <Field label="Bonus dibuat SI">
                        <Input value={remainingBonus.toLocaleString("id-ID")} disabled className="bg-slate-100 font-bold" />
                      </Field>
                    </>
                  )}
                </div>
                <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
                  Harga satuan tetap sama. Diskon baris dibagi proporsional sesuai qty agar total tidak berubah.
                </p>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplitLineKey(null)}>Batal</Button>
            <Button
              disabled={
                !splitLineKey ||
                deferredQuantity <= 0 ||
                deferredQuantity >= (invoiceLines.find((item) => item.key === splitLineKey)?.quantity ?? 0)
              }
              onClick={applySplitLine}
            >
              Terapkan Pembagian
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="mt-auto pt-3 bg-slate-100/50 p-3 rounded-lg border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 shrink-0">
        <div className="flex flex-col gap-3 w-full md:max-w-[480px]">
          {kind === "SO" ? (
            <p className="text-xs text-slate-500">
              Pembayaran dilakukan melalui Sales Invoice, bukan Sales Order.
            </p>
          ) : (
            <>
              <div className="bg-white border border-slate-300 p-2.5 rounded shadow-sm">
                <p className="text-[10px] font-black text-slate-700 uppercase mb-2 border-b border-slate-100 pb-1">
                  Tindakan Histori Harga Jual
                </p>
                <div className="flex flex-wrap gap-3">
                  {(["MERGE", "REWRITE", "IGNORE"] as const).map((mode) => (
                    <label
                      key={mode}
                      className={
                        "flex items-center gap-1.5 text-[11px] font-bold " +
                        (!customerId
                          ? "text-slate-400"
                          : "text-slate-700 cursor-pointer")
                      }
                    >
                      <input
                        type="radio"
                        name="sales-price-history"
                        checked={
                          (customerId ? snapshotMode : "IGNORE") === mode
                        }
                        disabled={!customerId}
                        onChange={() => setSnapshotMode(mode)}
                      />
                      {mode === "MERGE"
                        ? "MERGE (Tambah/Perbarui)"
                        : mode === "REWRITE"
                          ? "REWRITE (Timpa)"
                          : "IGNORE (Abaikan)"}
                    </label>
                  ))}
                </div>
              </div>
              <div className="bg-white border border-slate-300 p-2.5 rounded shadow-sm">
                <p className="text-[10px] font-black text-slate-700 uppercase mb-2 border-b border-slate-100 pb-1">
                  Status Pembayaran Awal
                </p>
                {editingId ? (
                  <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="rounded border border-slate-200 bg-slate-50 p-2">
                      <p className="text-[9px] font-black uppercase text-slate-500">
                        Status
                      </p>
                      <p className="text-xs font-black text-slate-800">
                        {paymentChoice === "PAID"
                          ? "LUNAS"
                          : paymentChoice === "PARTIAL"
                            ? "SEBAGIAN / KREDIT"
                            : "BELUM BAYAR"}
                      </p>
                    </div>
                    <div className="rounded border border-emerald-200 bg-emerald-50 p-2">
                      <p className="text-[9px] font-black uppercase text-emerald-700">
                        Sudah Diterima
                      </p>
                      <p className="text-xs font-black text-emerald-800">
                        {rupiah(paidAmount)}
                      </p>
                    </div>
                    <div className="rounded border border-amber-200 bg-amber-50 p-2">
                      <p className="text-[9px] font-black uppercase text-amber-700">
                        Sisa Tagihan
                      </p>
                      <p className="text-xs font-black text-amber-800">
                        {rupiah(Math.max(0, totals.invoice - paidAmount))}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-4 mb-2">
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-slate-700">
                      <input
                        type="radio"
                        name="sales-payment-choice"
                        disabled={Boolean(editingId)}
                        checked={paymentChoice === "UNPAID"}
                        onChange={() => {
                          setPaymentChoice("UNPAID");
                          setPaymentOverride(0);
                        }}
                      />
                      BELUM BAYAR
                    </label>
                    <label
                      className={
                        "flex items-center gap-1.5 text-[11px] font-bold " +
                        (!customerId || editingId
                          ? "text-slate-400"
                          : "cursor-pointer text-slate-700")
                      }
                    >
                      <input
                        type="radio"
                        name="sales-payment-choice"
                        disabled={!customerId || Boolean(editingId)}
                        checked={paymentChoice === "PARTIAL"}
                        onChange={() => {
                          setPaymentChoice("PARTIAL");
                          setPaymentOverride(0);
                        }}
                      />
                      KREDIT / BAYAR SEBAGIAN
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-slate-700">
                      <input
                        type="radio"
                        name="sales-payment-choice"
                        disabled={Boolean(editingId)}
                        checked={paymentChoice === "PAID"}
                        onChange={() => {
                          setPaymentChoice("PAID");
                          setPaymentOverride(null);
                          setDueDate("");
                        }}
                      />
                      BAYAR LUNAS
                    </label>
                  </div>
                )}
                {!editingId && !customerId && (
                  <p className="text-[10px] text-slate-500 mb-2">
                    Guest boleh belum bayar selama DRAFT/READY, tetapi harus
                    lunas sebelum COMPLETED.
                  </p>
                )}
                {!editingId && customerId && paymentChoice !== "PAID" && (
                  <p className="mb-2 text-[10px] font-semibold text-amber-700">
                    Sisa yang belum dibayar otomatis menjadi kredit customer.
                  </p>
                )}
                <Field label="Tanggal Jatuh Tempo">
                  <Input
                    type="date"
                    disabled={!customerId || paymentChoice === "PAID"}
                    value={
                      customerId && paymentChoice !== "PAID" ? dueDate : ""
                    }
                    onChange={(event) => setDueDate(event.target.value)}
                    className="h-7 text-xs bg-white border-slate-300 disabled:bg-slate-100"
                  />
                </Field>
                {kind === "SI" && !editingId && (
                  <div className="flex flex-col gap-2 mt-3 pt-2 border-t border-slate-100">
                    <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-2">
                      <Field label="Metode Penerimaan">
                        <CompactSelect
                          value={paymentMethod}
                          onChange={setPaymentMethod}
                          options={[
                            "CASH",
                            "TRANSFER",
                            "QRIS",
                            "DEBIT_CARD",
                            "CREDIT_CARD",
                            "E_WALLET",
                            "GIRO",
                            "LAINNYA",
                          ].map(option)}
                        />
                      </Field>
                      <Field label="Akun Penerima">
                        <CompactSelect
                          value={accountId}
                          onChange={setAccountId}
                          placeholder="Pilih Kas/Bank"
                          options={accounts.map((account) => ({
                            value: account.financialAccountId,
                            label: account.accountName,
                          }))}
                          className="bg-[#fff8e1] border-amber-300"
                        />
                      </Field>
                    </div>
                    <Field label="Nominal Diterima">
                      <Input
                        type="number"
                        min="0"
                        value={paymentAmount || ""}
                        onChange={(event) => {
                          const amount = Number(event.target.value);
                          setPaymentOverride(amount);
                          setPaymentChoice(
                            amount <= 0
                              ? "UNPAID"
                              : amount >= totals.invoice
                                ? "PAID"
                                : "PARTIAL",
                          );
                        }}
                        className="h-7 text-xs font-bold text-emerald-700 bg-emerald-50 border-emerald-300"
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentChoice("PAID");
                        setPaymentOverride(null);
                        setDueDate("");
                      }}
                      className="text-[10px] font-bold text-blue-700 text-left underline"
                    >
                      Isi sesuai total (otomatis)
                    </button>
                    {paymentMethod === "LAINNYA" && (
                      <Field label="Nama Metode">
                        <Input
                          value={otherMethod}
                          onChange={(event) =>
                            setOtherMethod(event.target.value)
                          }
                          className="h-7 text-xs"
                        />
                      </Field>
                    )}
                    {paymentMethod !== "CASH" && (
                      <Field label="No. Bukti Transfer / Pembayaran (Opsional)">
                        <Input
                          value={reference}
                          onChange={(event) => setReference(event.target.value)}
                          placeholder="Nomor bukti transaksi dari bank/aplikasi"
                          className="h-7 text-xs"
                        />
                      </Field>
                    )}
                    <p className="text-[10px] text-slate-500">
                      Nominal ini adalah uang yang benar-benar diterima, bukan
                      sekadar rencana.
                    </p>
                  </div>
                )}
                {kind === "SI" && editingId && (
                  <p className="mt-2 text-[10px] font-semibold text-slate-500">
                    Pembayaran lama tidak diubah dari form edit. Gunakan tombol
                    <b> Proses / Bayar</b> pada card SI untuk mencatat
                    pembayaran baru.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
        <div className="w-full md:max-w-[350px] space-y-2">
          <Summary label="Subtotal" value={totals.invoice + discount} />
          <Field label="Diskon Dokumen (Rp)">
            <Input
              type="number"
              min="0"
              value={discount || ""}
              onChange={(event) => setDiscount(Number(event.target.value))}
              className="h-8 text-xs font-bold text-right bg-white"
            />
          </Field>
          <Summary label={"Total " + kind} value={totals.invoice} strong />
          {kind === "SI" && (
            <Summary
              label="Sisa Tagihan"
              value={Math.max(0, totals.invoice - totalPaid)}
            />
          )}
          {orderLines.length > 0 && (
            <Summary label="Total SO Terpisah" value={totals.order} />
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-3">
            {kind === "SI" && (
              <div className="flex min-w-0 items-center gap-2">
                <select
                  aria-label="Pembagian struk"
                  value={receiptParts}
                  onChange={(event) =>
                    setReceiptParts(Number(event.target.value) as ReceiptPartCount)
                  }
                  className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700"
                >
                  <option value={1}>1 struk</option>
                  <option value={2}>Bagi 2</option>
                  <option value={3}>Bagi 3</option>
                </select>
                <Button variant="outline" disabled={saving} onClick={() => void printCurrentInvoice()} className="h-9 text-xs font-bold px-4">
                  <Printer className="mr-1 h-3.5 w-3.5" /> Cetak Bon
                </Button>
              </div>
            )}
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => void save("DRAFT")}
              className="h-9 text-xs font-bold px-4"
            >
              Simpan Draft
            </Button>
            <Button
              disabled={saving}
              onClick={() => void save("READY")}
              className="h-9 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white px-4"
            >
              Simpan {kind} (Ready)
            </Button>
            {kind === "SI" && canApprove && (
              <Button
                disabled={saving}
                onClick={() => void save("COMPLETED")}
                className="h-9 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-4"
              >
                <Save className="w-3.5 h-3.5 mr-1" />
                {saving ? "Menyimpan..." : "Selesaikan SI"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function option(value: string) {
  return { value, label: value };
}
function CompactSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select
      value={value || "NONE"}
      onValueChange={(next) => onChange(next === "NONE" ? "" : (next ?? ""))}
      disabled={disabled}
    >
      <SelectTrigger
        className={
          "w-full font-bold h-8 text-xs bg-white border-slate-300 " + className
        }
      >
        <SelectValue>
          {options.find((item) => item.value === value)?.label ??
            placeholder ??
            "Pilih..."}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-white z-50 max-h-[250px] border-slate-200 shadow-lg">
        {placeholder && (
          <SelectItem value="NONE" className="text-xs italic text-slate-500">
            {placeholder}
          </SelectItem>
        )}
        {options.map((item) => (
          <SelectItem
            key={item.value}
            value={item.value}
            className="text-xs cursor-pointer"
          >
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function detailToLine(detail: {
  productUnitId: string;
  salesOrderDetailId?: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  bonusQuantity: number;
  note?: string | null;
}): Line {
  return {
    key: crypto.randomUUID(),
    productId: "",
    productUnitId: detail.productUnitId,
    salesOrderDetailId: detail.salesOrderDetailId ?? undefined,
    quantity: detail.quantity,
    unitPrice: detail.unitPrice,
    discountAmount: detail.discountAmount,
    bonusQuantity: detail.bonusQuantity,
    note: detail.note ?? "",
  };
}
function toPayload(line: Line): SalesItemPayload {
  return salesLinePayload(line);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-black tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
function Summary({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between border-b py-2 text-sm ${strong ? "font-black text-blue-700" : "text-slate-600"}`}
    >
      <span>{label}</span>
      <span>{rupiah(value)}</span>
    </div>
  );
}

interface LinePanelProps {
  title: string;
  hint: string;
  lines: Line[];
  products: SalesProductOption[];
  side: "SI" | "SO";
  invoiceMode: boolean;
  sourceLinked?: boolean;
  productFor: (line: Line) => SalesProductOption | undefined;
  unitFor: (line: Line) => SalesProductOption["units"][number] | undefined;
  onProduct: (side: "SI" | "SO", key: string, id: string) => void;
  onUnit: (side: "SI" | "SO", key: string, id: string) => void;
  onUpdate: (side: "SI" | "SO", key: string, patch: Partial<Line>) => void;
  onAdd: (side: "SI" | "SO") => void;
  onRemove: (side: "SI" | "SO", key: string) => void;
  onMove?: (key: string) => void;
  onSplit?: (key: string) => void;
  historyAction?: React.ReactNode;
}
function LinePanel(props: LinePanelProps) {
  const productOptions = props.products.map((item) => ({
    value: item.productId,
    label: item.productName,
  }));
  return (
    <section className="min-w-0 flex flex-col mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider">
            {props.title}
          </h3>
          <p className="text-[10px] text-slate-500">{props.hint}</p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          {props.historyAction}
          <Button variant="outline" size="sm" onClick={() => props.onAdd(props.side)} className="h-7 text-[10px] font-bold bg-white border-slate-300"><Plus className="w-3 h-3 mr-1" />Tambah Baris Kosong</Button>
        </div>
      </div>
      <div className="overflow-auto max-h-[460px] bg-white border border-slate-300 rounded-md custom-scrollbar">
        <table className="w-full min-w-[1180px] text-xs text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-300 text-slate-600">
            <tr>
              {[
                "NO",
                "PRODUK",
                "SATUAN",
                "STOK TERSEDIA",
                "QTY",
                "HARGA SATUAN",
                "DISKON (Rp)",
                "BONUS",
                "SUBTOTAL",
                "CATATAN",
                "AKSI",
              ].map((label) => (
                <th
                  key={label}
                  className="p-2 border-r border-slate-200 font-black text-[10px] whitespace-nowrap"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {props.lines.map((line, index) => {
              const product = props.productFor(line);
              const unit = props.unitFor(line);
              const insufficient =
                props.invoiceMode &&
                Boolean(unit) &&
                line.quantity + line.bonusQuantity > (unit?.availableQty ?? 0);
              const numericFields = [
                ["quantity", "Qty", "w-20"],
                ["unitPrice", "Harga satuan", "w-28"],
                ["discountAmount", "Diskon", "w-24"],
                ["bonusQuantity", "Bonus", "w-20"],
              ] as const;
              return (
                <tr
                  key={line.key}
                  className={
                    "align-top " +
                    ((line.sourceText ? line.reviewPending : insufficient)
                      ? "bg-rose-50"
                      : "bg-white")
                  }
                >
                  <td className="p-2 border-r border-slate-200 text-center text-slate-400">
                    {index + 1}
                  </td>
                  <td className="p-1 border-r border-slate-200 min-w-[220px]">
                    <CompactSelect
                      value={product?.productId ?? line.productId}
                      disabled={
                        props.sourceLinked && Boolean(line.salesOrderDetailId)
                      }
                      onChange={(id) =>
                        props.onProduct(props.side, line.key, id)
                      }
                      placeholder="Pilih Produk..."
                      options={productOptions}
                      className="h-7 border-none shadow-none bg-transparent text-xs"
                    />
                    {line.sourceText && (
                      <div
                        className={
                          "px-2 pb-2 text-[10px] max-w-[260px] break-words " +
                          (line.reviewPending
                            ? "text-rose-700"
                            : "text-slate-500")
                        }
                      >
                        <p>WA: {line.sourceText}</p>
                        <p className="font-bold">
                          {line.reviewPending
                            ? line.reviewReasons?.join(" · ")
                            : "Sudah diperiksa / dikenali"}
                        </p>
                      </div>
                    )}
                  </td>
                  <td className="p-1 border-r border-slate-200 min-w-[100px]">
                    <CompactSelect
                      value={line.productUnitId}
                      disabled={
                        !product ||
                        (props.sourceLinked && Boolean(line.salesOrderDetailId))
                      }
                      onChange={(id) => props.onUnit(props.side, line.key, id)}
                      placeholder="Satuan..."
                      options={
                        product?.units.map((item) => ({
                          value: item.productUnitId,
                          label: item.unitName,
                        })) ?? []
                      }
                      className="h-7 border-none shadow-none bg-transparent text-xs"
                    />
                  </td>
                  <td
                    className={
                      "p-2 border-r border-slate-200 min-w-[120px] text-[10px] " +
                      (insufficient
                        ? "font-bold text-rose-600"
                        : "text-slate-500")
                    }
                  >
                    {product ? formatSalesStock(product.units) : "—"}
                  </td>
                  {numericFields.map(([field, label, width]) => (
                    <td key={field} className="p-1 border-r border-slate-200">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        aria-label={label + " baris " + (index + 1)}
                        value={line[field] || ""}
                        placeholder="0"
                        onChange={(event) =>
                          props.onUpdate(props.side, line.key, {
                            [field]: Number(event.target.value),
                          })
                        }
                        className={
                          "h-7 text-xs text-right border-none shadow-none bg-transparent font-bold " +
                          width
                        }
                      />
                      {field === "quantity" && insufficient && (
                        <p className="p-1 text-[9px] font-bold text-rose-600">
                          Melebihi stok tersedia
                        </p>
                      )}
                      {field === "unitPrice" && unit && (
                        <p className="text-[9px] text-blue-600 px-1">
                          Saran{" "}
                          {unit.priceSource === "CUSTOMER"
                            ? "customer"
                            : "umum"}
                          : {rupiah(unit.suggestedPrice)}
                        </p>
                      )}
                    </td>
                  ))}
                  <td className="p-2 border-r border-slate-200 font-black text-right whitespace-nowrap">
                    {rupiah(
                      Math.max(
                        0,
                        line.quantity * line.unitPrice - line.discountAmount,
                      ),
                    )}
                  </td>
                  <td className="p-1 border-r border-slate-200 min-w-[160px]">
                    <Input
                      value={line.note ?? ""}
                      placeholder="Catatan produk..."
                      aria-label={"Catatan baris " + (index + 1)}
                      onChange={(event) =>
                        props.onUpdate(props.side, line.key, {
                          note: event.target.value,
                        })
                      }
                      className="h-7 text-xs border-none shadow-none bg-transparent"
                    />
                  </td>
                  <td className="p-1">
                    <div className="flex gap-1">
                      {props.onSplit && line.productUnitId && line.quantity > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => props.onSplit?.(line.key)}
                          title="Bagi kuantitas ke SI dan SO"
                          aria-label={"Bagi kuantitas baris " + (index + 1)}
                          className="h-7 w-7 p-0 text-violet-600 hover:bg-violet-50"
                        >
                          <Scissors className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {props.onMove && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!line.productUnitId}
                          onClick={() => props.onMove?.(line.key)}
                          title={
                            props.side === "SI"
                              ? "Pindah ke SO"
                              : "Kembalikan ke SI"
                          }
                          aria-label={
                            props.side === "SI"
                              ? "Pindah ke SO"
                              : "Kembalikan ke SI"
                          }
                          className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50"
                        >
                          {props.side === "SI" ? (
                            <ArrowRight className="w-3.5 h-3.5" />
                          ) : (
                            <ShoppingCart className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => props.onRemove(props.side, line.key)}
                        aria-label={"Hapus baris " + (index + 1)}
                        className="h-7 w-7 p-0 text-rose-500 hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
