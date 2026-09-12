import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HandCoins,
  Plus,
  Printer,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
} from "@/components/ui/dialog";
import { hasPermission, useAuthStore } from "@/store/authStore";
import { parseApiError } from "@/utils/error";
import { systemConfigApi } from "@/features/system/system-configuration.api";
import {
  createThermalPrintJob,
  escapeReceiptHtml,
  thermalReceiptFooter,
  thermalReceiptHeader,
  type ThermalPrintJob,
} from "@/lib/thermal-print";
import InventoryPageSizeSelect from "./InventoryPageSizeSelect";
import InventorySectionNav, {
  type InventorySection,
} from "./InventorySectionNav";
import {
  inventoryApi,
  type InventoryLoanCard,
  type InventoryLoanDetail,
  type InventoryLoanDirection,
  type InventoryLoanLookups,
  type InventoryLoanPayload,
  type InventoryLoanResolutionPayload,
  type PaginationMeta,
} from "./inventory.api";

const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = () => localDate(new Date());
const weekAgo = () => {
  const value = new Date();
  value.setDate(value.getDate() - 7);
  return localDate(value);
};
const emptyMeta: PaginationMeta = {
  currentPage: 1,
  pageSize: 20,
  totalData: 0,
  totalPage: 0,
};
const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);

type LoanRow = {
  key: number;
  productUnitId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  note: string;
};
type ResolutionRow = {
  key: number;
  detailId: string;
  product: string;
  unit: string;
  outstanding: number;
  unitCost: number;
  type: "" | InventoryLoanResolutionPayload["items"][number]["resolutionType"];
  quantity: number;
  replacementProductUnitId: string;
  replacementQuantity: number;
  invoiceUnitPrice: number;
  note: string;
  recoveredWriteOffDetailId?: string;
};
let rowKey = 0;
const emptyRow = (): LoanRow => ({
  key: ++rowKey,
  productUnitId: "",
  quantity: 0,
  unitCost: 0,
  totalCost: 0,
  note: "",
});

export default function InventoryLoanPanel({
  onNavigate,
}: {
  onNavigate: (section: InventorySection) => void;
}) {
  const user = useAuthStore((state) => state.user);
  const canCreate = hasPermission(user, "INVENTORY_LOAN_CREATE");
  const canUpdate = hasPermission(user, "INVENTORY_LOAN_UPDATE");
  const canActivate = hasPermission(user, "INVENTORY_LOAN_ACTIVATE");
  const canResolve = hasPermission(user, "INVENTORY_LOAN_RESOLVE");
  const [lookups, setLookups] = useState<InventoryLoanLookups>({
    products: [],
    customers: [],
    suppliers: [],
  });
  const [cards, setCards] = useState<InventoryLoanCard[]>([]);
  const [meta, setMeta] = useState(emptyMeta);
  const [tab, setTab] = useState<"ACTIVE" | "HISTORY">("ACTIVE");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [directionFilter, setDirectionFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo, setDateTo] = useState(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<InventoryLoanDetail | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [direction, setDirection] =
    useState<InventoryLoanDirection>("OUTGOING");
  const [partnerId, setPartnerId] = useState("");
  const [loanDate, setLoanDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<LoanRow[]>([
    emptyRow(),
    emptyRow(),
    emptyRow(),
    emptyRow(),
  ]);
  const [saving, setSaving] = useState(false);
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [resolutionRows, setResolutionRows] = useState<ResolutionRow[]>([]);
  const [resolutionInvoiceDueDate, setResolutionInvoiceDueDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await inventoryApi.loanList(tab, page, limit, {
        direction: directionFilter || undefined,
        search: search || undefined,
        dateFrom,
        dateTo,
      });
      setCards(response.data ?? []);
      setMeta(response.meta ?? emptyMeta);
    } catch (caught) {
      setError(parseApiError(caught));
    } finally {
      setLoading(false);
    }
  }, [tab, page, limit, directionFilter, search, dateFrom, dateTo]);
  useEffect(() => {
    const loadTimer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(loadTimer);
  }, [load]);
  useEffect(() => {
    inventoryApi
      .loanLookups()
      .then(setLookups)
      .catch((caught) => setError(parseApiError(caught)));
  }, []);
  const productMap = useMemo(
    () =>
      new Map(
        lookups.products.map((product) => [product.productUnitId, product]),
      ),
    [lookups.products],
  );

  const reset = () => {
    setEditingId(undefined);
    setDirection("OUTGOING");
    setPartnerId("");
    setLoanDate(today());
    setDueDate("");
    setNote("");
    setRows([emptyRow(), emptyRow(), emptyRow(), emptyRow()]);
    setError("");
    setFormOpen(true);
  };
  const patchRow = (key: number, patch: Partial<LoanRow>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  const selectProduct = (row: LoanRow, productUnitId: string) => {
    const product = productMap.get(productUnitId);
    const unitCost = product?.suggestedUnitCost ?? 0;
    patchRow(row.key, {
      productUnitId,
      unitCost,
      totalCost: row.quantity * unitCost,
    });
  };
  const validRows = rows.filter((row) => row.productUnitId && row.quantity > 0);
  const payload = (): InventoryLoanPayload => ({
    direction,
    customerId: direction === "OUTGOING" ? partnerId : undefined,
    supplierId: direction === "INCOMING" ? partnerId : undefined,
    loanDate,
    dueDate: dueDate || undefined,
    note: note || undefined,
    items: validRows.map((row) => ({
      productUnitId: row.productUnitId,
      quantity: row.quantity,
      provisionalUnitCost: row.unitCost,
      note: row.note || undefined,
    })),
  });
  const save = async () => {
    if (!partnerId || !validRows.length) {
      setError("Pilih partner dan isi minimal satu produk.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await inventoryApi.saveLoan(payload(), editingId);
      setFormOpen(false);
      setDetail(saved);
      await load();
    } catch (caught) {
      setError(parseApiError(caught));
    } finally {
      setSaving(false);
    }
  };
  const openDetail = async (id: string) => {
    try {
      setDetail(await inventoryApi.loanDetail(id));
    } catch (caught) {
      setError(parseApiError(caught));
    }
  };
  const printLoan = async (loan: InventoryLoanDetail) => {
    let printJob: ThermalPrintJob | undefined;
    try {
      printJob = createThermalPrintJob(loan.loanNumber);
      const config = await systemConfigApi.get();
      const partner =
        loan.customer?.customerName ?? loan.supplier?.supplierName ?? "-";
      const total = loan.details.reduce(
        (sum, line) => sum + Number(line.provisionalTotalCost),
        0,
      );
      await printJob.printDocument(`<!doctype html><html><head><title>${escapeReceiptHtml(loan.loanNumber)}</title><style>@page{size:80mm auto;margin:0}body{width:80mm;margin:0;padding:4mm;font-family:'Courier New',Courier,monospace;font-size:10px;line-height:1.3;color:#000}.line{border-bottom:1px dashed #000;margin:5px 0}.solid{border-bottom:1px solid #000;margin:5px 0}.row{display:flex;justify-content:space-between;gap:3mm}.item{margin:2px 0}.right{text-align:right}.total{font-weight:700;font-size:10.5px}</style></head><body>${thermalReceiptHeader(config)}<div class="line"></div><div class="center bold">INVENTORY LOAN</div><div class="line"></div><div>No. Loan : ${escapeReceiptHtml(loan.loanNumber)}</div><div>Arah : ${loan.direction === "OUTGOING" ? "Dipinjamkan" : "Kita Pinjam"}</div><div>Partner : ${escapeReceiptHtml(partner)}</div><div>Tanggal : ${escapeReceiptHtml(new Date(loan.loanDate).toLocaleDateString("id-ID"))}</div><div>Target : ${loan.dueDate ? escapeReceiptHtml(new Date(loan.dueDate).toLocaleDateString("id-ID")) : "-"}</div><div>Status : ${escapeReceiptHtml(loan.status)}</div><div class="solid"></div>${loan.details.map((line) => `<div class="item"><div class="bold">${escapeReceiptHtml(line.productUnit.product.productName)}</div><div class="row"><span>${escapeReceiptHtml(line.quantity)} ${escapeReceiptHtml(line.productUnit.unit.unitName)}</span><span>${escapeReceiptHtml(rupiah(Number(line.provisionalTotalCost)))}</span></div></div>`).join("")}<div class="solid"></div><div class="row total"><span>TOTAL NILAI MODAL</span><span>${escapeReceiptHtml(rupiah(total))}</span></div>${loan.note ? `<div style="margin-top:2mm"><b>Catatan:</b> ${escapeReceiptHtml(loan.note)}</div>` : ""}${thermalReceiptFooter(config)}</body></html>`);
    } catch (caught) {
      printJob?.close();
      setError(parseApiError(caught));
    }
  };
  const edit = (loan: InventoryLoanDetail) => {
    setEditingId(loan.inventoryLoanId);
    setDirection(loan.direction);
    setPartnerId(
      loan.direction === "OUTGOING"
        ? String(loan.customerId ?? loan.customer?.customerId ?? "")
        : String(loan.supplierId ?? loan.supplier?.supplierId ?? ""),
    );
    setLoanDate(loan.loanDate.slice(0, 10));
    setDueDate(loan.dueDate?.slice(0, 10) ?? "");
    setNote(loan.note ?? "");
    setRows([
      ...loan.details.map((line) => ({
        key: ++rowKey,
        productUnitId: line.productUnitId,
        quantity: Number(line.quantity),
        unitCost: Number(line.provisionalUnitCost),
        totalCost: Number(line.provisionalTotalCost),
        note: line.note ?? "",
      })),
      emptyRow(),
    ]);
    setDetail(null);
    setFormOpen(true);
  };
  const startResolution = (loan: InventoryLoanDetail) => {
    setResolutionInvoiceDueDate(loan.dueDate?.slice(0, 10) ?? "");
    setResolutionRows(
      loan.details
        .map((line) => ({
          key: ++rowKey,
          detailId: line.inventoryLoanDetailId,
          product: line.productUnit.product.productName,
          unit: line.productUnit.unit.unitName,
          outstanding:
            Number(line.quantity) -
            Number(line.returnedQuantity) -
            Number(line.convertedQuantity) -
            Number(line.writtenOffQuantity),
          unitCost: Number(line.provisionalUnitCost),
          type: "" as const,
          quantity: 0,
          replacementProductUnitId: "",
          replacementQuantity: 0,
          invoiceUnitPrice: Number(line.provisionalUnitCost),
          note: "",
        }))
        .filter((line) => line.outstanding > 0),
    );
    setResolutionOpen(true);
  };
  const patchResolution = (key: number, patch: Partial<ResolutionRow>) =>
    setResolutionRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  const splitResolution = (source: ResolutionRow) =>
    setResolutionRows((current) => {
      const used = current
        .filter((row) => row.detailId === source.detailId)
        .reduce((sum, row) => sum + row.quantity, 0);
      const remaining = Math.max(0, source.outstanding - used);
      return [
        ...current,
        {
          ...source,
          key: ++rowKey,
          type: "",
          quantity: remaining,
          replacementProductUnitId: "",
          replacementQuantity: remaining,
        },
      ];
    });

  const startRecovery = (
    writeOff: InventoryLoanDetail["resolutions"][number]["details"][number],
  ) => {
    if (!detail) return;
    setResolutionInvoiceDueDate(detail.dueDate?.slice(0, 10) ?? "");
    const source = detail.details.find(
      (line) => line.inventoryLoanDetailId === writeOff.inventoryLoanDetailId,
    );
    if (!source) return;
    const recovered = (writeOff.recoveries ?? []).reduce(
      (sum, row) => sum + Number(row.sourceQuantity),
      0,
    );
    const available = Number(writeOff.sourceQuantity) - recovered;
    setResolutionRows([
      {
        key: ++rowKey,
        detailId: source.inventoryLoanDetailId,
        product: source.productUnit.product.productName,
        unit: source.productUnit.unit.unitName,
        outstanding: available,
        unitCost: Number(source.provisionalUnitCost),
        type: "",
        quantity: available,
        replacementProductUnitId: "",
        replacementQuantity: available,
        invoiceUnitPrice: Number(source.provisionalUnitCost),
        note: "Pemulihan kerugian Inventory Loan",
        recoveredWriteOffDetailId: writeOff.inventoryLoanResolutionDetailId,
      },
    ]);
    setResolutionOpen(true);
  };
  const resolve = async () => {
    if (!detail) return;
    const selected = resolutionRows.filter(
      (row) => row.type && row.quantity > 0,
    );
    if (!selected.length) {
      setError("Pilih minimal satu penyelesaian dan jumlahnya.");
      return;
    }
    const createsInvoice = selected.some(
      (row) => row.type === "INVOICE_CONVERSION",
    );
    if (createsInvoice && !resolutionInvoiceDueDate) {
      setError(
        detail.direction === "OUTGOING"
          ? "Tanggal jatuh tempo wajib diisi karena Sales Invoice langsung menjadi piutang customer."
          : "Tanggal jatuh tempo wajib diisi karena Purchase Invoice langsung menjadi hutang supplier.",
      );
      return;
    }
    const invoiceTab = createsInvoice
      ? window.open("about:blank", "_blank")
      : null;
    if (invoiceTab) {
      invoiceTab.document.title = `Menyiapkan ${detail.direction === "OUTGOING" ? "Sales" : "Purchase"} Invoice...`;
      invoiceTab.document.body.innerHTML =
        `<p style="font:14px sans-serif;padding:24px">Menyiapkan ${detail.direction === "OUTGOING" ? "Sales" : "Purchase"} Invoice...</p>`;
    }
    setSaving(true);
    try {
      const existingInvoiceIds = new Set(
        detail.resolutions.flatMap((row) => {
          if (detail.direction === "OUTGOING" && row.salesInvoice)
            return [row.salesInvoice.salesInvoiceId];
          if (detail.direction === "INCOMING" && row.purchaseInvoice)
            return [row.purchaseInvoice.purchaseInvoiceId];
          return [];
        }),
      );
      const saved = await inventoryApi.resolveLoan(detail.inventoryLoanId, {
        resolutionDate: today(),
        invoiceDueDate: createsInvoice
          ? resolutionInvoiceDueDate
          : undefined,
        items: selected.map((row) => ({
          inventoryLoanDetailId: row.detailId,
          resolutionType: row.type as Exclude<ResolutionRow["type"], "">,
          sourceQuantity: row.quantity,
          replacementProductUnitId:
            row.type === "REPLACEMENT_PRODUCT"
              ? row.replacementProductUnitId
              : undefined,
          replacementQuantity:
            row.type === "REPLACEMENT_PRODUCT"
              ? row.replacementQuantity
              : undefined,
          invoiceUnitPrice:
            row.type === "INVOICE_CONVERSION"
              ? row.invoiceUnitPrice
              : undefined,
          recoveredWriteOffDetailId: row.recoveredWriteOffDetailId,
          note: row.note || undefined,
        })),
      });
      setDetail(saved);
      setResolutionOpen(false);
      await load();
      if (invoiceTab) {
        const createdResolution = saved.resolutions.find((row) => {
          const id =
            detail.direction === "OUTGOING"
              ? row.salesInvoice?.salesInvoiceId
              : row.purchaseInvoice?.purchaseInvoiceId;
          return id && !existingInvoiceIds.has(id);
        });
        const createdSalesInvoice = createdResolution?.salesInvoice;
        const createdPurchaseInvoice = createdResolution?.purchaseInvoice;
        if (createdSalesInvoice) {
          invoiceTab.location.href = `${window.location.origin}/sales?tab=sales&viewInvoiceId=${encodeURIComponent(createdSalesInvoice.salesInvoiceId)}`;
        } else if (createdPurchaseInvoice) {
          invoiceTab.location.href = `${window.location.origin}/purchasing?tab=purchases&viewInvoiceId=${encodeURIComponent(createdPurchaseInvoice.purchaseInvoiceId)}`;
        } else {
          invoiceTab.close();
        }
      }
    } catch (caught) {
      invoiceTab?.close();
      setError(parseApiError(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 p-3 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 sm:text-2xl">
            Inventory & Warehouse
          </h1>
          <p className="text-xs font-medium text-slate-500 sm:text-sm">
            Catat barang yang dipinjamkan atau dipinjam tanpa mencampurkannya
            dengan transaksi jual-beli.
          </p>
        </div>
        {canCreate && (
          <Button
            onClick={reset}
            className="w-full bg-[#326dc8] text-white sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Buat Inventory Loan
          </Button>
        )}
      </div>
      <InventorySectionNav current="LOAN" onChange={onNavigate} />
      <div className="mt-3 grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Cari nomor/customer/supplier..."
          className="h-10 rounded-md border px-3 text-xs"
        />
        <select
          value={directionFilter}
          onChange={(e) => {
            setDirectionFilter(e.target.value);
            setPage(1);
          }}
          className="h-10 rounded-md border bg-white px-3 text-xs"
        >
          <option value="">Semua arah</option>
          <option value="OUTGOING">Barang dipinjamkan</option>
          <option value="INCOMING">Barang kita pinjam</option>
        </select>
        <label className="text-[10px] font-bold text-slate-500">
          DARI
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="mt-1 h-8 w-full rounded border px-2"
          />
        </label>
        <label className="text-[10px] font-bold text-slate-500">
          SAMPAI
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="mt-1 h-8 w-full rounded border px-2"
          />
        </label>
        <div className="flex rounded-lg bg-slate-100 p-1">
          <button
            onClick={() => {
              setTab("ACTIVE");
              setPage(1);
            }}
            className={`flex-1 rounded px-2 text-xs font-bold ${tab === "ACTIVE" ? "bg-white shadow" : ""}`}
          >
            Aktif
          </button>
          <button
            onClick={() => {
              setTab("HISTORY");
              setPage(1);
            }}
            className={`flex-1 rounded px-2 text-xs font-bold ${tab === "HISTORY" ? "bg-white shadow" : ""}`}
          >
            Riwayat
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-3 min-h-10 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
          {error}
        </div>
      )}
      {loading ? (
        <div className="p-12 text-center text-sm text-slate-500">
          <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />
          Memuat Inventory Loan...
        </div>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {cards.map((card) => (
            <button
              key={card.inventoryLoanId}
              onClick={() => void openDetail(card.inventoryLoanId)}
              className={`rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md ${card.status === "CANCELLED" ? "grayscale" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <b className="text-sm text-slate-900">{card.loanNumber}</b>
                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    {card.customer?.customerName ?? card.supplier?.supplierName}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[9px] font-black ${card.status === "OUTSTANDING" ? "bg-amber-100 text-amber-700" : card.status === "DRAFT" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}
                >
                  {card.status}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
                <span>
                  {card.direction === "OUTGOING"
                    ? "Dipinjamkan ke customer"
                    : "Dipinjam dari supplier"}
                </span>
                <span>
                  {new Date(card.loanDate).toLocaleDateString("id-ID")}
                </span>
                <span>{card._count?.details ?? 0} produk</span>
              </div>
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <InventoryPageSizeSelect
          value={limit}
          onChange={(value) => {
            setLimit(value);
            setPage(1);
          }}
        />
        <div className="flex items-center justify-between gap-3 text-xs">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((v) => v - 1)}
          >
            Sebelumnya
          </Button>
          <span>
            {page} / {Math.max(meta.totalPage, 1)}
          </span>
          <Button
            variant="outline"
            disabled={page >= meta.totalPage}
            onClick={() => setPage((v) => v + 1)}
          >
            Berikutnya
          </Button>
        </div>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogOverlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogContent
          className="z-[60] flex max-h-none max-w-none flex-col overflow-hidden bg-white p-4 sm:p-5"
          style={{ width: "1250px", maxWidth: "96vw", height: "92vh" }}
        >
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit" : "Buat"} Inventory Loan
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-bold">
              ARAH
              <select
                value={direction}
                onChange={(e) => {
                  setDirection(e.target.value as InventoryLoanDirection);
                  setPartnerId("");
                }}
                className="mt-1 h-10 w-full rounded-md border bg-white px-3"
              >
                <option value="OUTGOING">Barang dipinjamkan</option>
                <option value="INCOMING">Barang kita pinjam</option>
              </select>
            </label>
            <label className="text-xs font-bold">
              {direction === "OUTGOING" ? "CUSTOMER" : "SUPPLIER"}
              <select
                value={partnerId}
                onChange={(e) => setPartnerId(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border bg-white px-3"
              >
                <option value="">
                  Pilih {direction === "OUTGOING" ? "customer" : "supplier"}...
                </option>
                {direction === "OUTGOING"
                  ? lookups.customers.map((x) => (
                      <option key={x.customerId} value={x.customerId}>
                        {x.customerName}
                      </option>
                    ))
                  : lookups.suppliers.map((x) => (
                      <option key={x.supplierId} value={x.supplierId}>
                        {x.supplierName}
                      </option>
                    ))}
              </select>
            </label>
            <label className="text-xs font-bold">
              TANGGAL
              <input
                type="date"
                value={loanDate}
                onChange={(e) => setLoanDate(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border px-3"
              />
            </label>
            <label className="text-xs font-bold">
              TARGET KEMBALI
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border px-3"
              />
            </label>
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Catatan dokumen (opsional)"
            className="mt-3 h-10 rounded-md border px-3 text-xs"
          />
          {error && (
            <div className="mt-3 min-h-10 rounded-md bg-rose-50 p-3 text-xs font-bold text-rose-700">
              {error}
            </div>
          )}
          <div className="erp-scroll-table mt-3 min-h-0 flex-1 overflow-auto rounded-xl border">
            <table className="w-full min-w-[950px] text-xs">
              <thead className="sticky top-0 bg-slate-100">
                <tr>
                  <th className="p-3 text-left">Produk</th>
                  <th>Unit utama</th>
                  <th>Qty</th>
                  <th>Modal/unit</th>
                  <th>Total modal</th>
                  <th>Catatan</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-t">
                    <td className="p-2">
                      <select
                        value={row.productUnitId}
                        onChange={(e) => selectProduct(row, e.target.value)}
                        className="h-9 w-full rounded border bg-white px-2"
                      >
                        <option value="">Pilih produk...</option>
                        {lookups.products.map((p) => (
                          <option key={p.productUnitId} value={p.productUnitId}>
                            {p.productName} · stok {p.availableQty} {p.unitName}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="bg-slate-50 px-3 text-center font-bold text-slate-500">
                      {productMap.get(row.productUnitId)?.unitName ?? "-"}
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={row.quantity || ""}
                        onChange={(e) => {
                          const quantity = Number(e.target.value);
                          patchRow(row.key, {
                            quantity,
                            totalCost: quantity * row.unitCost,
                          });
                        }}
                        className="h-9 w-24 rounded border text-center"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={row.unitCost || ""}
                        onChange={(e) => {
                          const unitCost = Number(e.target.value);
                          patchRow(row.key, {
                            unitCost,
                            totalCost: row.quantity * unitCost,
                          });
                        }}
                        className="h-9 w-32 rounded border px-2"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={row.totalCost || ""}
                        onChange={(e) => {
                          const totalCost = Number(e.target.value);
                          patchRow(row.key, {
                            totalCost,
                            unitCost:
                              row.quantity > 0 ? totalCost / row.quantity : 0,
                          });
                        }}
                        className="h-9 w-36 rounded border px-2"
                      />
                    </td>
                    <td>
                      <input
                        value={row.note}
                        onChange={(e) =>
                          patchRow(row.key, { note: e.target.value })
                        }
                        className="h-9 w-full rounded border px-2"
                        placeholder="Opsional"
                      />
                    </td>
                    <td>
                      <button
                        onClick={() =>
                          setRows((current) =>
                            current.filter((x) => x.key !== row.key),
                          )
                        }
                        className="p-2 text-rose-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:justify-between">
            <Button
              variant="outline"
              onClick={() => setRows((current) => [...current, emptyRow()])}
            >
              <Plus className="mr-2 h-4 w-4" />
              Tambah Baris
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setFormOpen(false)}>
                Tutup
              </Button>
              <Button
                disabled={saving}
                onClick={() => void save()}
                className="bg-[#326dc8] text-white"
              >
                Simpan Draft
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogOverlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogContent
          className="z-[60] flex max-h-none max-w-none flex-col overflow-hidden bg-white p-4 sm:p-6"
          style={{ width: "1250px", maxWidth: "96vw", height: "92vh" }}
        >
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.loanNumber}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-2 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-4">
                <div>
                  <span className="text-slate-500">Partner</span>
                  <b className="block">
                    {detail.customer?.customerName ??
                      detail.supplier?.supplierName}
                  </b>
                </div>
                <div>
                  <span className="text-slate-500">Arah</span>
                  <b className="block">
                    {detail.direction === "OUTGOING"
                      ? "Dipinjamkan"
                      : "Kita pinjam"}
                  </b>
                </div>
                <div>
                  <span className="text-slate-500">Status</span>
                  <b className="block">{detail.status}</b>
                </div>
                <div>
                  <span className="text-slate-500">Target kembali</span>
                  <b className="block">
                    {detail.dueDate
                      ? new Date(detail.dueDate).toLocaleDateString("id-ID")
                      : "-"}
                  </b>
                </div>
              </div>
              <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-xl border">
                <table className="w-full min-w-[850px] text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="p-3 text-left">Produk</th>
                      <th>Jumlah awal</th>
                      <th>Kembali</th>
                      <th>Invoice</th>
                      <th>Kerugian</th>
                      <th>Sisa</th>
                      <th>Nilai modal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.details.map((line) => {
                      const outstanding =
                        Number(line.quantity) -
                        Number(line.returnedQuantity) -
                        Number(line.convertedQuantity) -
                        Number(line.writtenOffQuantity);
                      return (
                        <tr
                          key={line.inventoryLoanDetailId}
                          className="border-t"
                        >
                          <td className="p-3 font-bold">
                            {line.productUnit.product.productName}
                            <small className="block text-slate-500">
                              {line.productUnit.unit.unitName}
                            </small>
                          </td>
                          <td className="text-center">{line.quantity}</td>
                          <td className="text-center">
                            {line.returnedQuantity}
                          </td>
                          <td className="text-center">
                            {line.convertedQuantity}
                          </td>
                          <td className="text-center">
                            {line.writtenOffQuantity}
                          </td>
                          <td className="text-center font-black text-amber-600">
                            {outstanding}
                          </td>
                          <td className="text-right pr-3">
                            {rupiah(Number(line.provisionalTotalCost))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {detail.resolutions.length > 0 && (
                <div className="mt-3 max-h-40 overflow-auto rounded-xl border bg-slate-50 p-3">
                  <p className="mb-2 text-[11px] font-black uppercase text-slate-500">
                    Riwayat Penyelesaian
                  </p>
                  <div className="space-y-2">
                    {detail.resolutions.map((resolution) => (
                      <div
                        key={resolution.inventoryLoanResolutionId}
                        className="rounded-lg border bg-white p-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <b>{resolution.resolutionNumber}</b>
                          <span className="text-slate-500">
                            {new Date(
                              resolution.resolutionDate,
                            ).toLocaleDateString("id-ID")}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {resolution.details.map((item) => {
                            const recovered = (item.recoveries ?? []).reduce(
                              (sum, row) => sum + Number(row.sourceQuantity),
                              0,
                            );
                            const canRecover =
                              item.resolutionType === "WRITE_OFF" &&
                              recovered < Number(item.sourceQuantity);
                            return (
                              <span
                                key={item.inventoryLoanResolutionDetailId}
                                className="rounded-md bg-slate-100 px-2 py-1"
                              >
                                {item.resolutionType.replaceAll("_", " ")} ·{" "}
                                {item.sourceQuantity}
                                {canRecover && canResolve && (
                                  <button
                                    type="button"
                                    onClick={() => startRecovery(item)}
                                    className="ml-2 font-black text-blue-700"
                                  >
                                    Pulihkan
                                  </button>
                                )}
                              </span>
                            );
                          })}
                          {(resolution.salesInvoice ||
                            resolution.purchaseInvoice) && (
                            <span className="rounded-md bg-blue-50 px-2 py-1 font-bold text-blue-700">
                              {resolution.salesInvoice?.salesInvoiceNumber ??
                                resolution.purchaseInvoice
                                  ?.purchaseInvoiceNumber}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  className="mr-auto"
                  onClick={() => void printLoan(detail)}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Cetak IL
                </Button>
                {detail.status === "DRAFT" && canUpdate && (
                  <Button variant="outline" onClick={() => edit(detail)}>
                    Edit Draft
                  </Button>
                )}
                {detail.status === "DRAFT" && canUpdate && (
                  <Button
                    variant="outline"
                    className="text-rose-600"
                    onClick={async () => {
                      if (confirm("Batalkan draft Inventory Loan ini?")) {
                        const saved = await inventoryApi.cancelLoan(
                          detail.inventoryLoanId,
                        );
                        setDetail(saved);
                        await load();
                      }
                    }}
                  >
                    Batalkan
                  </Button>
                )}
                {detail.status === "DRAFT" && canActivate && (
                  <Button
                    className="bg-emerald-600 text-white"
                    onClick={async () => {
                      if (confirm("Aktifkan Loan dan proses stok sekarang?")) {
                        try {
                          const saved = await inventoryApi.activateLoan(
                            detail.inventoryLoanId,
                          );
                          setDetail(saved);
                          await load();
                        } catch (caught) {
                          setError(parseApiError(caught));
                        }
                      }
                    }}
                  >
                    Aktifkan Loan
                  </Button>
                )}
                {["OUTSTANDING", "WRITTEN_OFF"].includes(detail.status) &&
                  canResolve && (
                    <Button
                      className="bg-[#326dc8] text-white"
                      onClick={() => startResolution(detail)}
                    >
                      <HandCoins className="mr-2 h-4 w-4" />
                      Selesaikan Barang
                    </Button>
                  )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={resolutionOpen} onOpenChange={setResolutionOpen}>
        <DialogOverlay className="fixed inset-0 z-[70] bg-black/50" />
        <DialogContent
          className="z-[80] flex max-h-none max-w-none flex-col overflow-hidden bg-white p-4 sm:p-5"
          style={{ width: "1250px", maxWidth: "96vw", height: "90vh" }}
        >
          <DialogHeader>
            <DialogTitle>Penyelesaian Inventory Loan</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500">
            Setiap produk boleh diselesaikan dengan cara berbeda. Baris tanpa
            pilihan tidak akan diproses.
          </p>
          {detail &&
            resolutionRows.some(
              (row) => row.type === "INVOICE_CONVERSION",
            ) && (
              <label className="mt-3 block max-w-sm text-xs font-bold text-slate-700">
                {detail.direction === "OUTGOING"
                  ? "Jatuh tempo piutang SI"
                  : "Jatuh tempo hutang PI"}
                <input
                  type="date"
                  value={resolutionInvoiceDueDate}
                  onChange={(event) =>
                    setResolutionInvoiceDueDate(event.target.value)
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-medium"
                />
                <span className="mt-1 block font-normal text-slate-500">
                  {detail.direction === "OUTGOING"
                    ? "SI akan langsung selesai dan tampil di Piutang Customer."
                    : "PI akan langsung selesai dan tampil di Tagihan Supplier."}
                </span>
              </label>
            )}
          <div className="erp-scroll-table mt-3 min-h-0 flex-1 overflow-auto rounded-xl border">
            <table className="w-full min-w-[1260px] text-xs">
              <thead className="sticky top-0 bg-slate-100">
                <tr>
                  <th className="p-3 text-left">Barang pinjaman</th>
                  <th>Sisa</th>
                  <th>Cara penyelesaian</th>
                  <th>Qty diselesaikan</th>
                  <th>Barang pengganti</th>
                  <th>Qty pengganti</th>
                  <th>Nilai penyelesaian</th>
                  <th>Harga invoice</th>
                  <th>Bagi</th>
                </tr>
              </thead>
              <tbody>
                {resolutionRows.map((row) => (
                  <tr key={row.key} className="border-t">
                    <td className="p-3 font-bold">
                      {row.product}
                      <small className="block text-slate-500">{row.unit}</small>
                    </td>
                    <td className="text-center">{row.outstanding}</td>
                    <td>
                      <select
                        value={row.type}
                        onChange={(e) =>
                          patchResolution(row.key, {
                            type: e.target.value as ResolutionRow["type"],
                            quantity: row.outstanding,
                            replacementQuantity: row.outstanding,
                          })
                        }
                        className="h-9 rounded border bg-white px-2"
                      >
                        <option value="">Belum diselesaikan</option>
                        <option value="SAME_PRODUCT_RETURN">
                          Barang yang sama
                        </option>
                        <option value="REPLACEMENT_PRODUCT">
                          Barang lain, nilai sama
                        </option>
                        <option value="INVOICE_CONVERSION">
                          Jadikan{" "}
                          {detail?.direction === "OUTGOING"
                            ? "Sales Invoice"
                            : "Purchase Invoice"}
                        </option>
                        <option value="WRITE_OFF">Kerugian</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max={row.outstanding}
                        value={row.quantity || ""}
                        onChange={(e) =>
                          patchResolution(row.key, {
                            quantity: Number(e.target.value),
                          })
                        }
                        className="h-9 w-24 rounded border text-center"
                      />
                    </td>
                    <td>
                      {row.type === "REPLACEMENT_PRODUCT" ? (
                        <select
                          value={row.replacementProductUnitId}
                          onChange={(e) =>
                            patchResolution(row.key, {
                              replacementProductUnitId: e.target.value,
                            })
                          }
                          className="h-9 w-56 rounded border bg-white px-2"
                        >
                          <option value="">Pilih barang...</option>
                          {lookups.products.map((p) => (
                            <option
                              key={p.productUnitId}
                              value={p.productUnitId}
                            >
                              {p.productName} · {p.unitName}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td>
                      {row.type === "REPLACEMENT_PRODUCT" ? (
                        <input
                          type="number"
                          min="0"
                          value={row.replacementQuantity || ""}
                          onChange={(e) =>
                            patchResolution(row.key, {
                              replacementQuantity: Number(e.target.value),
                            })
                          }
                          className="h-9 w-24 rounded border text-center"
                        />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-2 text-right font-bold">
                      {rupiah(row.quantity * row.unitCost)}
                    </td>
                    <td>
                      {row.type === "INVOICE_CONVERSION" ? (
                        <input
                          type="number"
                          min="0"
                          value={row.invoiceUnitPrice || ""}
                          onChange={(e) =>
                            patchResolution(row.key, {
                              invoiceUnitPrice: Number(e.target.value),
                            })
                          }
                          className="h-9 w-32 rounded border px-2"
                        />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-2">
                      <button
                        type="button"
                        onClick={() => splitResolution(row)}
                        className="rounded-md border px-2 py-1 font-bold text-blue-700 hover:bg-blue-50"
                      >
                        Bagi
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={() => setResolutionOpen(false)}>
              Batal
            </Button>
            <Button
              disabled={saving}
              onClick={() => void resolve()}
              className="bg-emerald-600 text-white"
            >
              Konfirmasi & Proses
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
