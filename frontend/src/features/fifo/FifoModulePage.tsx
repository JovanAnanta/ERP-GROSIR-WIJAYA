import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Filter,
  History,
  Layers3,
  LoaderCircle,
  PackageSearch,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import InventoryPageSizeSelect from "@/features/inventory/InventoryPageSizeSelect";
import { parseApiError } from "@/utils/error";
import FifoOriginDetailDialog from "./FifoOriginDetailDialog";
import {
  fifoApi,
  type FifoFilterOptions,
  type FifoFilters,
  type FifoLayerCard,
  type FifoLayerDetail,
  type FifoOriginSummary,
  type PaginationMeta,
} from "./fifo.api";

type Tab = "COST" | "HISTORY";
const emptyMeta: PaginationMeta = {
  currentPage: 1,
  pageSize: 20,
  totalData: 0,
  totalPage: 0,
};
const rupiah = (value: number) =>
  `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
const originLabels: Record<string, string> = {
  PURCHASE_INVOICE: "Purchase Invoice",
  PURCHASE_RETURN: "Purchase Return",
  SALES_INVOICE: "Sales Invoice",
  SALES_RETURN: "Sales Return",
  INVENTORY_ADJUSTMENT: "Stock Adjustment",
  INVENTORY_TRANSFORMATION: "Transformation",
  INVENTORY_LOAN: "Inventory Loan",
  INVENTORY_LOAN_RETURN: "Pengembalian Loan",
  OPENING_BALANCE: "Opening Balance",
};

export default function FifoModulePage() {
  const [tab, setTab] = useState<Tab>("COST");
  const [rows, setRows] = useState<FifoLayerCard[]>([]);
  const [meta, setMeta] = useState(emptyMeta);
  const [options, setOptions] = useState<FifoFilterOptions | null>(null);
  const [filters, setFilters] = useState<FifoFilters>({
    page: 1,
    limit: 20,
    status: "ALL",
  });
  const [searchText, setSearchText] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<FifoLayerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [originDetail, setOriginDetail] = useState<FifoOriginSummary | null>(
    null,
  );

  useEffect(() => {
    void fifoApi
      .filters()
      .then(setOptions)
      .catch((reason) => setError(parseApiError(reason)));
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setFilters((current) => ({
          ...current,
          page: 1,
          search: searchText.trim() || undefined,
        })),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [searchText]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fifoApi.list(tab, filters);
      setRows(result.data);
      setMeta(result.meta);
    } catch (reason) {
      setError(parseApiError(reason));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filters, tab]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const patchFilter = (patch: Partial<FifoFilters>) =>
    setFilters((current) => ({ ...current, page: 1, ...patch }));
  const switchTab = (next: Tab) => {
    setTab(next);
    setFilters((current) => ({
      ...current,
      page: 1,
      status: "ALL",
      sort: next === "COST" ? "OLDEST" : "NEWEST",
    }));
  };
  const openLayer = async (id: string, page = 1) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      setDetail(await fifoApi.detail(id, page, 50));
    } catch (reason) {
      setError(parseApiError(reason));
    } finally {
      setDetailLoading(false);
    }
  };
  const activeFilterCount = useMemo(
    () =>
      [
        "productId",
        "categoryId",
        "brandId",
        "supplierId",
        "originType",
        "dateFrom",
        "dateTo",
      ].filter((key) => Boolean(filters[key as keyof FifoFilters])).length,
    [filters],
  );

  return (
    <div className="mx-auto w-full max-w-[1500px] p-3 sm:p-5 lg:p-7">
      <div className="mb-4">
        <h1 className="text-xl font-black text-slate-900 sm:text-2xl">
          FIFO & Cost
        </h1>
        <p className="text-xs font-medium text-slate-500 sm:text-sm">
          Pantau modal dan perjalanan setiap layer persediaan.
        </p>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-200/70 p-1.5 sm:flex sm:w-fit">
        <button
          onClick={() => switchTab("COST")}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition sm:px-5 ${tab === "COST" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}
        >
          <Layers3 className="h-4 w-4" />
          Analisis Modal
        </button>
        <button
          onClick={() => switchTab("HISTORY")}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition sm:px-5 ${tab === "HISTORY" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}
        >
          <History className="h-4 w-4" />
          Riwayat Layer
        </button>
      </div>

      <div className="mb-4 rounded-xl border bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="h-10 w-full rounded-lg border pl-9 pr-3 text-sm outline-none focus:border-blue-400"
              placeholder="Cari produk, nomor layer, atau dokumen..."
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFilterOpen((value) => !value)}
            className="relative h-10"
          >
            <Filter className="mr-2 h-4 w-4" />
            Filter
            {activeFilterCount > 0 && (
              <span className="ml-2 rounded-full bg-blue-600 px-1.5 text-[10px] text-white">
                {activeFilterCount}
              </span>
            )}
          </Button>
          <InventoryPageSizeSelect
            value={Number(filters.limit ?? 20)}
            onChange={(limit) => patchFilter({ limit })}
          />
        </div>
        {filterOpen && (
          <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect
              label="Produk"
              value={filters.productId}
              onChange={(value) => patchFilter({ productId: value })}
            >
              <option value="">Semua produk</option>
              {options?.products.map((item) => (
                <option key={item.productId} value={item.productId}>
                  {item.productName}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Kategori"
              value={filters.categoryId}
              onChange={(value) => patchFilter({ categoryId: value })}
            >
              <option value="">Semua kategori</option>
              {options?.categories.map((item) => (
                <option key={item.categoryId} value={item.categoryId}>
                  {item.categoryName}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Brand"
              value={filters.brandId}
              onChange={(value) => patchFilter({ brandId: value })}
            >
              <option value="">Semua brand</option>
              {options?.brands.map((item) => (
                <option key={item.brandId} value={item.brandId}>
                  {item.brandName}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Supplier"
              value={filters.supplierId}
              onChange={(value) => patchFilter({ supplierId: value })}
            >
              <option value="">Semua supplier</option>
              {options?.suppliers.map((item) => (
                <option key={item.supplierId} value={item.supplierId}>
                  {item.supplierName}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Sumber layer"
              value={filters.originType}
              onChange={(value) => patchFilter({ originType: value })}
            >
              <option value="">Semua sumber</option>
              {options?.originTypes.map((type) => (
                <option key={type} value={type}>
                  {originLabels[type] ?? type}
                </option>
              ))}
            </FilterSelect>
            {tab === "HISTORY" && (
              <FilterSelect
                label="Status layer"
                value={filters.status}
                onChange={(value) =>
                  patchFilter({ status: value as FifoFilters["status"] })
                }
              >
                <option value="ALL">Semua status</option>
                <option value="ACTIVE">Masih tersedia</option>
                <option value="DEPLETED">Sudah habis</option>
              </FilterSelect>
            )}
            <DateFilter
              label="Dari tanggal dibuat"
              value={filters.dateFrom}
              onChange={(value) => patchFilter({ dateFrom: value })}
            />
            <DateFilter
              label="Sampai tanggal dibuat"
              value={filters.dateTo}
              onChange={(value) => patchFilter({ dateTo: value })}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}
      {loading ? (
        <div className="flex h-56 items-center justify-center gap-2 text-sm text-slate-500">
          <LoaderCircle className="h-5 w-5 animate-spin" />
          Memuat layer FIFO...
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center rounded-xl border border-dashed bg-white text-center">
          <PackageSearch className="mb-2 h-8 w-8 text-slate-300" />
          <p className="font-bold text-slate-600">Layer tidak ditemukan</p>
          <p className="text-xs text-slate-400">
            Ubah pencarian atau filter yang digunakan.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <LayerCard
              key={row.fifoLayerId}
              row={row}
              onOpen={() => void openLayer(row.fifoLayerId)}
            />
          ))}
        </div>
      )}
      <Pagination
        meta={meta}
        onPage={(page) => setFilters((current) => ({ ...current, page }))}
      />

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="z-[70] flex h-[94dvh] w-[97vw] max-w-6xl flex-col overflow-hidden bg-white p-4 sm:h-[92vh] sm:p-6">
          <DialogHeader>
            <DialogTitle>
              Perjalanan FIFO Layer · {detail?.fifoLayerNumber ?? ""}
            </DialogTitle>
          </DialogHeader>
          {detailLoading && !detail ? (
            <div className="flex flex-1 items-center justify-center">
              <LoaderCircle className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            detail && (
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="grid gap-2 rounded-xl bg-slate-900 p-4 text-white sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-slate-300">Produk</p>
                    <b>{detail.productName}</b>
                  </div>
                  <div>
                    <p className="text-xs text-slate-300">Sisa layer</p>
                    <b>{detail.remainingDisplay}</b>
                  </div>
                  <div>
                    <p className="text-xs text-slate-300">Modal tersisa</p>
                    <b>{rupiah(detail.remainingCost)}</b>
                  </div>
                </div>
                <div className="relative mt-5 space-y-3 before:absolute before:bottom-4 before:left-[18px] before:top-4 before:w-px before:bg-slate-200">
                  {detail.timeline.map((item) => {
                    const doc = item.movement.document;
                    return (
                      <div
                        key={item.fifoLayerTransactionId}
                        className="relative flex gap-3"
                      >
                        <div
                          className={`z-10 mt-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${item.direction === "IN" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
                        >
                          {item.direction === "IN" ? (
                            <ArrowDown className="h-4 w-4" />
                          ) : (
                            <ArrowUp className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 rounded-xl border bg-white p-3 shadow-sm">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-xs font-black text-slate-800">
                                {item.direction === "IN"
                                  ? "BARANG MASUK"
                                  : "BARANG KELUAR"}{" "}
                                · {item.quantityDisplay}
                              </p>
                              <p className="mt-0.5 break-all text-[11px] text-slate-500">
                                {originLabels[item.movement.originType] ??
                                  item.movement.originType}{" "}
                                · {item.movement.originNumber}
                              </p>
                            </div>
                            <span className="text-[10px] font-medium text-slate-400">
                              {new Date(item.createdAt).toLocaleString("id-ID")}
                            </span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2 text-[11px] sm:grid-cols-4">
                            <p>
                              Sebelum
                              <br />
                              <b>{item.quantityBeforeDisplay}</b>
                            </p>
                            <p>
                              Sesudah
                              <br />
                              <b>{item.quantityAfterDisplay}</b>
                            </p>
                            <p>
                              Modal/unit
                              <br />
                              <b>{rupiah(item.unitCost)}</b>
                            </p>
                            <p>
                              Nilai
                              <br />
                              <b>{rupiah(item.totalCost)}</b>
                            </p>
                          </div>
                          {item.movement.transformationAllocations.length >
                            0 && (
                            <div className="mt-2 space-y-1">
                              {item.movement.transformationAllocations.map(
                                (link, index) => (
                                  <p
                                    key={index}
                                    className="rounded bg-blue-50 px-2 py-1 text-[11px] text-blue-800"
                                  >
                                    Baris {link.lineNumber}:{" "}
                                    {link.sourceProductName} →{" "}
                                    {link.resultProductName} · nilai{" "}
                                    {rupiah(link.allocatedCost)}
                                  </p>
                                ),
                              )}
                            </div>
                          )}
                          {doc?.detailAvailable && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-2 h-8 text-xs"
                              onClick={() => setOriginDetail(doc)}
                            >
                              <Eye className="mr-1.5 h-3.5 w-3.5" />
                              Lihat Detail {doc.number}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Pagination
                  meta={detail.timelineMeta}
                  onPage={(page) => void openLayer(detail.fifoLayerId, page)}
                />
              </div>
            )
          )}
        </DialogContent>
      </Dialog>
      <FifoOriginDetailDialog
        origin={originDetail}
        onClose={() => setOriginDetail(null)}
      />
    </div>
  );
}

function LayerCard({
  row,
  onOpen,
}: {
  row: FifoLayerCard;
  onOpen: () => void;
}) {
  return (
    <article
      className={`overflow-hidden rounded-xl border bg-white shadow-sm ${row.status === "ACTIVE" ? "border-blue-200" : "border-slate-200 opacity-80"}`}
    >
      <div className="flex items-start justify-between border-b bg-slate-50 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-900">
            {row.productName}
          </p>
          <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">
            {row.categoryName}
            {row.brandName ? ` · ${row.brandName}` : ""}
          </p>
        </div>
        <span
          className={`ml-2 shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${row.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}
        >
          {row.status === "ACTIVE" ? "TERSEDIA" : "HABIS"}
        </span>
      </div>
      <div className="p-3">
        <div className="rounded-lg bg-blue-50 p-3">
          <p className="text-[10px] font-bold uppercase text-blue-600">
            Harga modal · {row.parentUnitName}
          </p>
          <p className="mt-1 text-xl font-black text-blue-900">
            {rupiah(row.unitCost)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {row.unitCosts
              .filter((item) => item.productUnitId !== row.productUnitId)
              .map((item) => (
                <span
                  key={item.productUnitId}
                  className="rounded bg-white px-2 py-1 text-[10px] font-semibold text-slate-600"
                >
                  {item.unitName}: {rupiah(item.unitCost)}
                </span>
              ))}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <p className="rounded-lg bg-slate-50 p-2 text-slate-500">
            Awal
            <br />
            <b className="text-slate-800">{row.originalDisplay}</b>
          </p>
          <p className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
            Tersisa
            <br />
            <b>{row.remainingDisplay}</b>
          </p>
        </div>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[10px] text-slate-500">
            <span>Terpakai {row.consumedDisplay}</span>
            <span>{row.utilizationPercent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-blue-500"
              style={{ width: `${Math.min(row.utilizationPercent, 100)}%` }}
            />
          </div>
        </div>
        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold text-slate-700">
              {row.originNumber}
            </p>
            <p className="truncate text-[10px] text-slate-400">
              {originLabels[row.originType] ?? row.originType} ·{" "}
              {new Date(row.createdAt).toLocaleDateString("id-ID")}
            </p>
          </div>
          <Button
            size="sm"
            onClick={onOpen}
            className="h-8 shrink-0 bg-slate-900 text-xs text-white"
          >
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            Lacak
          </Button>
        </div>
      </div>
    </article>
  );
}
function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="text-[10px] font-bold uppercase text-slate-500">
      {label}
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-xs font-medium normal-case"
      >
        {children}
      </select>
    </label>
  );
}
function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-[10px] font-bold uppercase text-slate-500">
      {label}
      <input
        type="date"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-xs font-medium normal-case"
      />
    </label>
  );
}
function Pagination({
  meta,
  onPage,
}: {
  meta: PaginationMeta;
  onPage: (page: number) => void;
}) {
  if (meta.totalPage <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between rounded-xl border bg-white px-3 py-2 text-xs">
      <Button
        size="sm"
        variant="outline"
        disabled={meta.currentPage <= 1}
        onClick={() => onPage(meta.currentPage - 1)}
      >
        Sebelumnya
      </Button>
      <span className="font-semibold text-slate-600">
        Halaman {meta.currentPage} / {meta.totalPage} · {meta.totalData} data
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={meta.currentPage >= meta.totalPage}
        onClick={() => onPage(meta.currentPage + 1)}
      >
        Berikutnya
      </Button>
    </div>
  );
}
