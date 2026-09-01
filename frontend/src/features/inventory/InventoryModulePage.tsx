import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, PackageSearch, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { hasPermission, useAuthStore } from '@/store/authStore';
import { parseApiError } from '@/utils/error';
import {
  inventoryApi,
  type AdjustmentPayload,
  type InventoryCard,
  type InventoryDetail,
  type OpnamePayload,
  type PaginationMeta,
  type ProductStockOption,
  type SupplierOption,
} from './inventory.api';
import InventoryTransformationPanel from './InventoryTransformationPanel';
import StockMovementHistoryPanel from './StockMovementHistoryPanel';
import InventorySectionNav, { type InventorySection } from './InventorySectionNav';
import InventoryPageSizeSelect from './InventoryPageSizeSelect';

type Kind = 'adjustments' | 'opnames';

type FormItem = {
  productUnitId: string;
  direction: 'IN' | 'OUT';
  quantity: number;
  warehouseQty: number;
  packedQty: number;
  unitCost?: number;
  note: string;
};

const formatLocalDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const today = () => formatLocalDate(new Date());
const sevenDaysAgo = () => {
  const value = new Date();
  value.setDate(value.getDate() - 7);
  return formatLocalDate(value);
};

const emptyMeta: PaginationMeta = {
  currentPage: 1,
  pageSize: 20,
  totalData: 0,
  totalPage: 0,
};

export default function InventoryModulePage() {
  const user = useAuthStore((state) => state.user);

  const canCreate = hasPermission(user, 'INVENTORY_CREATE');
  const canUpdate = hasPermission(user, 'INVENTORY_UPDATE');
  const canApprove = hasPermission(user, 'INVENTORY_APPROVE');

  const [kind, setKind] = useState<Kind>('adjustments');
  const [workspace, setWorkspace] = useState<InventorySection>('MOVEMENTS');
  const [tab, setTab] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [listDateFrom, setListDateFrom] = useState(sevenDaysAgo);
  const [listDateTo, setListDateTo] = useState(today);

  const [cards, setCards] = useState<InventoryCard[]>([]);
  const [meta, setMeta] = useState(emptyMeta);

  const [products, setProducts] = useState<ProductStockOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [detail, setDetail] = useState<InventoryDetail | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>();

  const [date, setDate] = useState(today());
  const [supplierId, setSupplierId] = useState('');
  const [reason, setReason] = useState('Penyesuaian stok manual');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<FormItem[]>([]);
  const [visibleRows, setVisibleRows] = useState(6);

  const [saving, setSaving] = useState(false);

  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogItems, setCatalogItems] = useState<ProductStockOption[]>([]);
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>([]);

  const [confirmAction, setConfirmAction] = useState<null | (() => Promise<void>)>(null);

  const [conflicts, setConflicts] = useState<
    Array<{
      productName: string;
      snapshotQty: number;
      currentQty: number;
    }>
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await inventoryApi.list(kind, tab, page, limit, {
        dateFrom: listDateFrom || undefined,
        dateTo: listDateTo || undefined,
      });

      setCards(Array.isArray(response.data) ? response.data : []);
      setMeta(response.meta ?? emptyMeta);
    } catch (caught) {
      setError(parseApiError(caught));
    } finally {
      setLoading(false);
    }
  }, [kind, tab, page, limit, listDateFrom, listDateTo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    Promise.all([inventoryApi.products(), inventoryApi.suppliers()])
      .then(([productData, supplierData]) => {
        setProducts(productData);
        setSuppliers(supplierData);
      })
      .catch((caught) => setError(parseApiError(caught)));
  }, []);

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.productUnitId, product])),
    [products],
  );

  const rowCount = Math.max(6, visibleRows, items.length);

  const resetForm = () => {
    setEditingId(undefined);
    setDate(today());
    setSupplierId('');
    setReason('Penyesuaian stok manual');
    setNote('');
    setItems([]);
    setVisibleRows(6);
    setError('');
    setNotice('');
    setFormOpen(true);
  };

  const addItem = (id: string) => {
    const product = productMap.get(id);

    if (!product || items.some((item) => item.productUnitId === id)) return;

    setItems((current) => [
      ...current,
      {
        productUnitId: id,
        direction: 'IN',
        quantity: 0,
        warehouseQty: product.warehouseQty,
        packedQty: product.packedQty,
        unitCost: product.suggestedUnitCost ?? undefined,
        note: '',
      },
    ]);
  };

  const patchItem = (index: number, patch: Partial<FormItem>) =>
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );

  const openCatalog = async () => {
    if (!supplierId) {
      setError('Pilih supplier terlebih dahulu untuk membuka katalog.');
      return;
    }

    setError('');
    setSelectedCatalogIds([]);
    setCatalogOpen(true);

    try {
      setCatalogItems(await inventoryApi.supplierCatalog(supplierId));
    } catch (caught) {
      setCatalogItems([]);
      setError(parseApiError(caught));
    }
  };

  const addEmptyRow = () => setVisibleRows((current) => current + 1);

  const addCatalogSelection = () => {
    const selected = new Set(selectedCatalogIds);

    setVisibleRows((rows) =>
      Math.max(rows, items.length + selectedCatalogIds.length),
    );

    setItems((current) => {
      const existing = new Set(
        current.map((item) => item.productUnitId),
      );

      const additions = products
        .filter(
          (product) =>
            selected.has(product.productUnitId) &&
            !existing.has(product.productUnitId),
        )
        .map((product) => ({
          productUnitId: product.productUnitId,
          direction: 'IN' as const,
          quantity: 0,
          warehouseQty: product.warehouseQty,
          packedQty: product.packedQty,
          unitCost: product.suggestedUnitCost ?? undefined,
          note: '',
        }));

      const next = [...current, ...additions];

      return next;
    });

    setCatalogOpen(false);
  };

  const openDetail = async (card: InventoryCard) => {
    try {
      setDetail(
        await inventoryApi.detail(
          kind,
          (card.adjustmentId ?? card.stockOpnameId)!,
        ),
      );
    } catch (caught) {
      setError(parseApiError(caught));
    }
  };

  const formItemsFromDetail = (value: InventoryDetail): FormItem[] =>
    value.details.map((raw) => ({
      productUnitId: String(raw.productUnitId),
      direction: (raw.direction as 'IN' | 'OUT') ?? 'IN',
      quantity: Number(raw.quantity ?? 0),
      warehouseQty: Number(raw.countedQty ?? 0),
      packedQty: Number(raw.packedQty ?? 0),
      unitCost: raw.unitCost == null ? undefined : Number(raw.unitCost),
      note: String(raw.note ?? ''),
    }));

  const edit = (value: InventoryDetail) => {
    const detailItems = formItemsFromDetail(value);

    setEditingId((value.adjustmentId ?? value.stockOpnameId)!);
    setDate(
      String(value.adjustmentDate ?? value.opnameDate).slice(0, 10),
    );
    setSupplierId(value.supplierId ?? '');
    setReason(value.reason ?? 'Penyesuaian stok manual');
    setNote(value.note ?? '');
    setItems(detailItems);
    setVisibleRows(Math.max(6, detailItems.length));
    setError('');
    setNotice('');
    setDetail(null);
    setFormOpen(true);
  };

  const payload = (status: 'DRAFT' | 'APPROVED') =>
    kind === 'adjustments'
      ? {
          adjustmentDate: date,
          reason: reason || 'Penyesuaian stok manual',
          note: note || undefined,
          status,
          items: items.map(
            ({
              productUnitId,
              direction,
              quantity,
              unitCost,
              note: itemNote,
            }) => ({
              productUnitId,
              direction,
              quantity,
              unitCost: direction === 'IN' ? unitCost : undefined,
              note: itemNote || undefined,
            }),
          ),
        } satisfies AdjustmentPayload
      : {
          opnameDate: date,
          supplierId: supplierId || undefined,
          note: note || undefined,
          status,
          items: items.map(
            ({
              productUnitId,
              warehouseQty,
              packedQty,
              unitCost,
              note: itemNote,
            }) => ({
              productUnitId,
              warehouseQty,
              packedQty,
              unitCost,
              note: itemNote || undefined,
            }),
          ),
        } satisfies OpnamePayload;

  const saveDraft = async () => {
    if (!items.length) {
      setError('Pilih minimal satu produk sebelum menyimpan.');
      return undefined;
    }

    setSaving(true);
    setError('');

    try {
      const response =
        kind === 'adjustments'
          ? await inventoryApi.saveAdjustment(
              payload('DRAFT') as AdjustmentPayload,
              editingId,
            )
          : await inventoryApi.saveOpname(
              payload('DRAFT') as OpnamePayload,
              editingId,
            );

      setEditingId(
        response.adjustmentId ??
          response.stockOpnameId ??
          editingId,
      );

      setNotice('Draft berhasil disimpan.');

      await load();

      return response;
    } catch (caught) {
      setError(parseApiError(caught));
      return undefined;
    } finally {
      setSaving(false);
    }
  };

  const requestApprove = async () => {
    const saved = await saveDraft();

    const id =
      editingId ??
      saved?.adjustmentId ??
      saved?.stockOpnameId;

    if (!id) return;

    try {
      if (kind === 'opnames') {
        const found = await inventoryApi.conflicts(id);

        if (found.length) {
          setConflicts(found);
          return;
        }
      }

      setConfirmAction(
        () => async () => {
          await inventoryApi.approve(kind, id);
          setFormOpen(false);
          setConfirmAction(null);
          await load();
        },
      );
    } catch (caught) {
      setError(parseApiError(caught));
    }
  };

  const doCancel = (value: InventoryDetail) =>
    setConfirmAction(
      () => async () => {
        await inventoryApi.cancel(
          kind,
          (value.adjustmentId ?? value.stockOpnameId)!,
        );

        setDetail(null);
        setConfirmAction(null);

        await load();
      },
    );

  const changeWorkspace = (next: InventorySection) => {
    if (next === 'ADJUSTMENT') setKind('adjustments');
    if (next === 'OPNAME') setKind('opnames');
    setWorkspace(next);
    setPage(1);
  };

  if (workspace === 'TRANSFORMATION') {
    return <InventoryTransformationPanel onNavigate={changeWorkspace} />;
  }

  if (workspace === 'MOVEMENTS') {
    return <StockMovementHistoryPanel onNavigate={changeWorkspace} />;
  }

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="mb-5 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
            Inventory & Warehouse
          </h1>

          <p className="text-sm font-medium text-slate-500">
            Koreksi stok dan hasil perhitungan fisik yang dapat ditelusuri.
          </p>
        </div>

        {canCreate && <Button onClick={resetForm} className="w-full bg-[#326dc8] text-white sm:w-auto"><Plus className="mr-2 h-4 w-4"/>Buat {kind === 'adjustments' ? 'Adjustment' : 'Opname'}</Button>}
      </div>

      <div className="mb-4 space-y-2">
        <InventorySectionNav current={workspace} onChange={changeWorkspace} />
        <div className="grid gap-2 rounded-lg border bg-white p-3 sm:ml-auto sm:w-fit sm:grid-cols-2">
          <label className="text-[10px] font-bold uppercase text-slate-500">
            Dari tanggal
            <input type="date" value={listDateFrom} onChange={(event) => { setListDateFrom(event.target.value); setPage(1); }} className="mt-1 h-9 w-full rounded-md border px-2 text-xs font-medium sm:w-40" />
          </label>
          <label className="text-[10px] font-bold uppercase text-slate-500">
            Sampai tanggal
            <input type="date" value={listDateTo} onChange={(event) => { setListDateTo(event.target.value); setPage(1); }} className="mt-1 h-9 w-full rounded-md border px-2 text-xs font-medium sm:w-40" />
          </label>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex w-full rounded-lg bg-slate-100 p-1 sm:w-fit">
          <button
            onClick={() => {
              setTab('ACTIVE');
              setPage(1);
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold ${
              tab === 'ACTIVE' ? 'bg-white shadow' : ''
            }`}
          >
            Draft Aktif
          </button>

          <button
            onClick={() => {
              setTab('HISTORY');
              setPage(1);
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold ${
              tab === 'HISTORY' ? 'bg-white shadow' : ''
            }`}
          >
            Riwayat
          </button>
        </div>
        <InventoryPageSizeSelect value={limit} onChange={(value) => { setLimit(value); setPage(1); }} />
        </div>
      </div>

      {!formOpen && error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {!formOpen && notice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="p-10 text-center text-slate-500">
          Memuat data...
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-12 text-center text-slate-500">
          <Boxes className="mx-auto mb-3 h-8 w-8" />
          Belum ada data.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {cards.map((card) => (
            <button
              key={card.adjustmentId ?? card.stockOpnameId}
              onClick={() => void openDetail(card)}
              className={`rounded-xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                card.status === 'DRAFT'
                  ? 'border-blue-200 bg-white'
                  : 'border-slate-200 bg-slate-100'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-extrabold text-slate-900">
                    {card.adjustmentNumber ?? card.stockOpnameNumber}
                  </p>

                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {new Date(
                      card.adjustmentDate ??
                        card.opnameDate ??
                        card.createdAt,
                    ).toLocaleDateString('id-ID')}{' '}
                    · {card._count.details} produk
                    {card.supplier?.supplierName
                      ? ` · ${card.supplier.supplierName}`
                      : ''}
                  </p>
                </div>

                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                    card.status === 'DRAFT'
                      ? 'bg-amber-100 text-amber-700'
                      : card.status === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {card.status}
                </span>
              </div>

              <p className="mt-4 line-clamp-2 text-sm text-slate-600">
                {card.note ??
                  (kind === 'adjustments'
                    ? 'Lihat catatan per produk'
                    : 'Tanpa catatan')}
              </p>

              <p className="mt-3 text-xs text-slate-400">
                Dibuat oleh {card.createdByUser?.fullName ?? '-'}
              </p>
            </button>
          ))}
        </div>
      )}

      {meta.totalData > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-xs">
          <span className="text-slate-500">
            Menampilkan {cards.length} dari {meta.totalData}{' '}
            {kind === 'adjustments' ? 'adjustment' : 'opname'} · Halaman{' '}
            {meta.currentPage} dari {Math.max(meta.totalPage, 1)}
          </span>
          <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() =>
              setPage((current) => current - 1)
            }
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= meta.totalPage}
            onClick={() =>
              setPage((current) => current + 1)
            }
          >
            Next
          </Button>
          </div>
        </div>
      )}

      <Dialog
        open={formOpen}
        onOpenChange={setFormOpen}
      >
        <DialogOverlay className="fixed inset-0 z-50 bg-black/50" />

        <DialogContent
          className="z-[60] flex max-h-none max-w-none flex-col overflow-x-hidden overflow-y-auto border-slate-200 bg-white p-5 shadow-2xl lg:overflow-hidden"
          style={{
            width: '1200px',
            maxWidth: '96vw',
            height: '92vh',
          }}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-base font-black uppercase">
              {editingId ? 'Edit' : 'Buat'}{' '}
              {kind === 'adjustments'
                ? 'Stock Adjustment'
                : 'Stock Opname'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid shrink-0 gap-3 md:grid-cols-3">
            <label className="text-[11px] font-bold uppercase text-slate-600">
              Tanggal

              <input
                type="date"
                value={date}
                onChange={(event) =>
                  setDate(event.target.value)
                }
                className="mt-1 h-9 w-full rounded-md border px-3 text-xs font-semibold"
              />
            </label>

            {kind === 'opnames' && (
              <label className="text-[11px] font-bold uppercase text-slate-600">
                Supplier (Opsional)

                <select
                  value={supplierId}
                  onChange={(event) =>
                    setSupplierId(event.target.value)
                  }
                  className="mt-1 h-9 w-full rounded-md border bg-white px-3 text-xs font-semibold"
                >
                  <option value="">
                    Tanpa filter supplier
                  </option>

                  {suppliers.map((supplier) => (
                    <option
                      key={supplier.supplierId}
                      value={supplier.supplierId}
                    >
                      {supplier.supplierName}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label
              className={`text-[11px] font-bold uppercase text-slate-600 ${
                kind === 'adjustments'
                  ? 'md:col-span-2'
                  : ''
              }`}
            >
              Catatan Dokumen (Opsional)

              <input
                value={note}
                onChange={(event) =>
                  setNote(event.target.value)
                }
                className="mt-1 h-9 w-full rounded-md border px-3 text-xs font-medium"
                placeholder="Catatan umum dokumen..."
              />
            </label>
          </div>

          <div
            className={`mt-2 flex h-11 shrink-0 items-center rounded-md border px-3 text-xs font-semibold ${
              error
                ? 'border-rose-100 bg-rose-50/60 text-rose-700'
                : notice
                  ? 'border-emerald-100 bg-emerald-50/60 text-emerald-700'
                  : 'border-slate-100 bg-slate-50 text-transparent'
            }`}
          >
            {error || notice || 'Area informasi'}
          </div>

          {/* PRODUCT HEADER + ACTIONS */}
          <div className="mt-2 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase text-slate-700">
                Daftar Produk
              </p>

              <p className="text-[10px] text-slate-500">
                Pilih produk pada baris yang tersedia. Baris kosong tidak akan disimpan.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* TAMBAH BARIS KOSONG */}
              <Button
                type="button"
                variant="ghost"
                onClick={addEmptyRow}
                className="
                  group h-8 gap-1.5 rounded-md px-1.5
                  text-[11px] font-bold text-[#326dc8]
                  transition-all duration-200
                  hover:bg-transparent
                  hover:text-[#2458a5]
                  hover:drop-shadow-[0_1px_1px_rgba(50,109,200,0.12)]
                  focus-visible:bg-transparent
                  focus-visible:text-[#2458a5]
                  focus-visible:ring-2
                  focus-visible:ring-blue-200
                  focus-visible:ring-offset-1
                "
              >
                <span
                  className="
                    flex h-5 w-5 items-center justify-center
                    rounded-full
                    transition-all duration-200
                    group-hover:bg-blue-50
                    group-hover:scale-105
                  "
                >
                  <Plus
                    className="
                      h-3.5 w-3.5
                      transition-transform duration-200
                      group-hover:rotate-90
                    "
                  />
                </span>

                <span className="relative pb-0.5">
                  Tambah Baris Kosong

                  <span
                    className="
                      absolute bottom-0 left-0 h-px w-0
                      bg-current
                      transition-all duration-200
                      group-hover:w-full
                    "
                  />
                </span>
              </Button>

              {/* KATALOG SUPPLIER */}
              {kind === 'opnames' && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!supplierId}
                  onClick={() => void openCatalog()}
                  className="
                    h-9 border-amber-200
                    bg-amber-50
                    text-[11px] font-bold text-amber-700
                    transition-all duration-200
                    hover:border-amber-300
                    hover:bg-amber-100
                    hover:text-amber-800
                    hover:shadow-sm
                    disabled:pointer-events-none
                    disabled:opacity-50
                  "
                >
                  <PackageSearch className="mr-1.5 h-4 w-4" />
                  Katalog Produk Supplier
                </Button>
              )}
            </div>
          </div>

          <div className="erp-scroll-table mt-2 min-h-[260px] shrink-0 overflow-auto rounded-md border border-slate-300 lg:min-h-0 lg:flex-1 lg:shrink">
            <table className="w-full min-w-[1050px] border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100 text-left text-[10px] uppercase text-slate-600">
                <tr>
                  <th className="w-10 border-r p-2 text-center">
                    No
                  </th>

                  <th className="min-w-[230px] border-r p-2">
                    Produk
                  </th>

                  {kind === 'adjustments' ? (
                    <>
                      <th className="w-24 border-r p-2">
                        Arah
                      </th>

                      <th className="w-28 border-r p-2 text-center">
                        Qty
                      </th>

                      <th className="w-40 border-r p-2">
                        Harga Modal / Unit
                      </th>
                    </>
                  ) : (
                    <>
                      <th className="w-48 border-r p-2">
                        Total Fisik Tercatat
                      </th>

                      <th className="w-28 border-r p-2">
                        Di Gudang (Hasil Hitung)
                      </th>

                      <th className="w-28 border-r p-2">
                        Sudah Dikemas (Otomatis)
                      </th>

                      <th className="w-24 border-r p-2">
                        Perbedaan
                      </th>

                      <th className="w-40 border-r p-2">
                        Modal / Unit Jika Lebih
                      </th>
                    </>
                  )}

                  <th className="min-w-[180px] border-r p-2">
                    Catatan Produk
                  </th>

                  <th className="w-12" />
                </tr>
              </thead>

              <tbody>
                {Array.from({ length: rowCount }).map(
                  (_, index) => {
                    const item = items[index];

                    if (!item) {
                      return (
                        <tr
                          key={`blank-${index}`}
                          className="h-11 border-t bg-white"
                        >
                          <td className="border-r text-center text-slate-400">
                            {index + 1}
                          </td>

                          <td className="border-r p-1">
                            <select
                              value=""
                              onChange={(event) =>
                                addItem(event.target.value)
                              }
                              className="h-8 w-full border-none bg-transparent px-2 font-semibold outline-none"
                            >
                              <option value="">
                                Pilih produk...
                              </option>

                              {products
                                .filter(
                                  (product) =>
                                    !items.some(
                                      (selected) =>
                                        selected.productUnitId ===
                                        product.productUnitId,
                                    ),
                                )
                                .map((product) => (
                                  <option
                                    key={product.productUnitId}
                                    value={product.productUnitId}
                                  >
                                    {product.productName} · Stok{' '}
                                    {product.stockDisplay}
                                  </option>
                                ))}
                            </select>
                          </td>

                          <td
                            colSpan={
                              kind === 'adjustments' ? 5 : 7
                            }
                            className="bg-slate-50/50"
                          />
                        </tr>
                      );
                    }

                    const product = productMap.get(
                      item.productUnitId,
                    );

                    const variance =
                      item.warehouseQty +
                      item.packedQty -
                      (product?.actualQty ?? 0);

                    return (
                      <tr
                        key={item.productUnitId}
                        className="h-11 border-t bg-blue-50/10"
                      >
                        <td className="border-r text-center font-bold text-slate-400">
                          {index + 1}
                        </td>

                        <td className="border-r p-2 font-bold text-slate-800">
                          {product?.productName}

                          <div className="text-[10px] font-normal text-slate-500">
                            Stok: {product?.stockDisplay ?? `0 ${product?.unitName ?? ''}`} · tersedia{' '}
                            {product?.availableQty}
                          </div>
                        </td>

                        {kind === 'adjustments' ? (
                          <>
                            <td className="border-r p-1">
                              <select
                                value={item.direction}
                                onChange={(event) =>
                                  patchItem(index, {
                                    direction:
                                      event.target.value as
                                        | 'IN'
                                        | 'OUT',
                                  })
                                }
                                className="h-8 w-full rounded border bg-white px-1"
                              >
                                <option value="IN">
                                  Tambah
                                </option>

                                <option value="OUT">
                                  Kurang
                                </option>
                              </select>
                            </td>

                            <td className="border-r p-1">
                              <input
                                type="number"
                                min="0.001"
                                step="0.001"
                                value={item.quantity || ''}
                                onChange={(event) =>
                                  patchItem(index, {
                                    quantity: Number(
                                      event.target.value,
                                    ),
                                  })
                                }
                                className="h-8 w-full rounded border text-center font-bold"
                              />
                            </td>

                            <td className="border-r p-1">
                              {item.direction === 'IN' ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={item.unitCost ?? ''}
                                  onChange={(event) =>
                                    patchItem(index, {
                                      unitCost: event.target.value
                                        ? Number(
                                            event.target.value,
                                          )
                                        : undefined,
                                    })
                                  }
                                  className="h-8 w-full rounded border px-2"
                                  placeholder="Isi jika belum ada histori"
                                />
                              ) : (
                                <span className="px-2 text-[10px] font-semibold text-slate-500">
                                  Mengikuti FIFO tertua
                                </span>
                              )}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="border-r p-2 font-semibold text-slate-700">
                              {product?.stockDisplay}
                            </td>

                            <td className="border-r p-1">
                              <input
                                type="number"
                                min="0"
                                step="0.001"
                                value={item.warehouseQty || ''}
                                onChange={(event) =>
                                  patchItem(index, {
                                    warehouseQty: Number(
                                      event.target.value,
                                    ),
                                  })
                                }
                                className="h-8 w-full rounded border text-center font-bold"
                              />
                            </td>

                            <td className="border-r p-2 text-center font-bold text-slate-600">
                              {item.packedQty} {product?.unitName}
                            </td>

                            <td
                              className={`border-r p-2 text-center font-black ${
                                variance
                                  ? 'text-amber-600'
                                  : 'text-emerald-600'
                              }`}
                            >
                              {variance > 0 ? '+' : ''}
                              {variance}
                            </td>

                            <td className="border-r p-1">
                              {variance > 0 ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={item.unitCost ?? ''}
                                  onChange={(event) =>
                                    patchItem(index, {
                                      unitCost:
                                        event.target.value
                                          ? Number(
                                              event.target.value,
                                            )
                                          : undefined,
                                    })
                                  }
                                  className="h-8 w-full rounded border px-2"
                                  placeholder="Harga modal per unit"
                                />
                              ) : (
                                <span className="px-2 text-slate-400">
                                  Tidak diperlukan
                                </span>
                              )}
                            </td>
                          </>
                        )}

                        <td className="border-r p-1">
                          <input
                            value={item.note}
                            onChange={(event) =>
                              patchItem(index, {
                                note: event.target.value,
                              })
                            }
                            className="h-8 w-full rounded border px-2"
                            placeholder="Alasan/keterangan produk..."
                          />
                        </td>

                        <td className="p-1 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setItems((current) =>
                                current.filter(
                                  (_, itemIndex) =>
                                    itemIndex !== index,
                                ),
                              )
                            }
                            className="rounded p-1.5 text-rose-500 hover:bg-rose-100"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>

          {kind === 'opnames' && (
            <div className="mt-2 shrink-0 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-medium text-blue-800">
              Isi hanya jumlah yang benar-benar terlihat di gudang. Total fisik tercatat mencakup barang di gudang dan barang Sales READY yang sudah dikemas. Jumlah dikemas diisi otomatis.
            </div>
          )}

          <div className="mt-3 flex shrink-0 flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="w-fit rounded bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
              Produk terisi:{' '}
              <b className="text-blue-700">
                {items.length}
              </b>
            </span>

            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button
                variant="outline"
                onClick={() => setFormOpen(false)}
              >
                Tutup
              </Button>

              <Button
                variant="outline"
                disabled={saving}
                onClick={() => void saveDraft()}
              >
                Simpan Draft
              </Button>

              {canApprove && (
                <Button
                  disabled={saving}
                  onClick={() => void requestApprove()}
                  className="col-span-2 bg-emerald-600 text-white"
                >
                  Setujui
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
      >
        <DialogOverlay className="fixed inset-0 z-[70] bg-black/40" />

        <DialogContent
          className="z-[80] flex max-h-none max-w-none flex-col overflow-hidden bg-white p-5"
          style={{
            width: '720px',
            maxWidth: '92vw',
            height: '72vh',
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase">
              Katalog Produk Supplier
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
            {catalogItems.length === 0 ? (
              <p className="p-10 text-center text-xs text-slate-400">
                Tidak ada produk aktif pada katalog supplier ini.
              </p>
            ) : (
              catalogItems.map((product) => (
                <label
                  key={product.productUnitId}
                  className="flex cursor-pointer flex-col gap-2 border-b p-3 hover:bg-blue-50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedCatalogIds.includes(
                        product.productUnitId,
                      )}
                      onCheckedChange={(checked) =>
                        setSelectedCatalogIds((current) =>
                          checked
                            ? [...current, product.productUnitId]
                            : current.filter(
                                (id) =>
                                  id !==
                                  product.productUnitId,
                              ),
                        )
                      }
                    />

                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        {product.productName}
                      </p>

                      <p className="text-[10px] text-slate-500">
                        Unit dasar: {product.unitName}
                      </p>
                    </div>
                  </div>

                  <span className="w-fit rounded bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">
                    Stok {product.stockDisplay}
                  </span>
                </label>
              ))
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="outline"
              onClick={() =>
                setSelectedCatalogIds(
                  catalogItems
                    .filter(
                      (product) =>
                        !items.some(
                          (item) =>
                            item.productUnitId ===
                            product.productUnitId,
                        ),
                    )
                    .map(
                      (product) =>
                        product.productUnitId,
                    ),
                )
              }
            >
              Pilih Semua
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => setCatalogOpen(false)}
              >
                Batal
              </Button>

              <Button
                onClick={addCatalogSelection}
                className="bg-[#326dc8] text-white"
              >
                Masukkan ({selectedCatalogIds.length})
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!detail}
        onOpenChange={(open) =>
          !open && setDetail(null)
        }
      >
        <DialogOverlay className="fixed inset-0 z-50 bg-black/50" />

        <DialogContent
          className="z-[60] flex max-h-none max-w-none flex-col overflow-hidden bg-white p-6"
          style={{
            width: '1000px',
            maxWidth: '94vw',
            height: '92vh',
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {detail?.adjustmentNumber ??
                detail?.stockOpnameNumber}
            </DialogTitle>
          </DialogHeader>

          {detail && (
            <>
              <div className="grid shrink-0 grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm md:grid-cols-4">
                <div>
                  Status
                  <br />
                  <b>{detail.status}</b>
                </div>

                <div>
                  Tanggal
                  <br />
                  <b>
                    {new Date(
                      detail.adjustmentDate ??
                        detail.opnameDate ??
                        detail.createdAt,
                    ).toLocaleDateString('id-ID')}
                  </b>
                </div>

                <div>
                  Produk
                  <br />
                  <b>{detail.details.length}</b>
                </div>

                <div>
                  Supplier
                  <br />
                  <b>
                    {detail.supplier?.supplierName ?? '-'}
                  </b>
                </div>
              </div>

              <div className="erp-scroll-table mt-3 min-h-0 flex-1 overflow-auto rounded-xl border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="p-3 text-left">
                        Produk
                      </th>
                      <th>Unit</th>
                      <th>Perubahan / Hitungan</th>
                      <th>Harga Modal</th>
                      <th>Catatan Produk</th>
                    </tr>
                  </thead>

                  <tbody>
                    {detail.details.map((item) => (
                      <tr
                        key={String(
                          item.adjustmentDetailId ??
                            item.stockOpnameDetailId,
                        )}
                        className="border-t"
                      >
                        <td className="p-3 font-bold">
                          {item.productName}
                        </td>

                        <td className="text-center">
                          {item.unitName}
                        </td>

                        <td className="text-center">
                          {kind === 'adjustments'
                            ? `${item.direction} ${item.quantity}`
                            : `Dihitung di gudang ${item.countedQty} + sudah dikemas ${item.packedQty} = total fisik ${
                                Number(item.countedQty) +
                                Number(item.packedQty)
                              } (selisih ${item.varianceQty})`}
                        </td>

                        <td className="text-center">
                          {item.unitCost == null
                            ? '-'
                            : Number(
                                item.unitCost,
                              ).toLocaleString('id-ID')}
                        </td>

                        <td className="p-3">
                          {String(item.note ?? '-')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {detail.status === 'DRAFT' && (
                <div className="mt-3 flex shrink-0 flex-wrap justify-end gap-2">
                  {canApprove && (
                    <Button
                      variant="outline"
                      className="text-rose-600"
                      onClick={() => doCancel(detail)}
                    >
                      Batalkan
                    </Button>
                  )}

                  {canUpdate && (
                    <Button
                      onClick={() => edit(detail)}
                      className="bg-[#326dc8] text-white"
                    >
                      Edit Draft
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmAction}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Konfirmasi tindakan permanen
            </AlertDialogTitle>

            <AlertDialogDescription>
              Setelah disetujui atau dibatalkan, dokumen tidak dapat diedit.
              Periksa kembali seluruh data.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() =>
                setConfirmAction(null)
              }
            >
              Kembali
            </AlertDialogCancel>

            <AlertDialogAction
              className="bg-emerald-600"
              onClick={() =>
                void confirmAction
                  ?.()
                  .catch((caught) => {
                    setError(
                      parseApiError(caught),
                    );
                    setConfirmAction(null);
                  })
              }
            >
              Ya, lanjutkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={conflicts.length > 0}>
        <AlertDialogContent className="max-w-2xl bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-700">
              Stok sistem berubah
            </AlertDialogTitle>

            <AlertDialogDescription asChild>
              <div>
                <p>
                  Hasil hitung fisik tetap tersimpan. Perbarui snapshot,
                  tinjau ulang selisih, lalu klik Setujui kembali.
                </p>

                <div className="mt-3 max-h-52 overflow-auto rounded border">
                  {conflicts.map((conflict) => (
                    <div
                      key={conflict.productName}
                      className="flex justify-between border-b p-2 text-sm"
                    >
                      <b>{conflict.productName}</b>

                      <span>
                        {conflict.snapshotQty} →{' '}
                        {conflict.currentQty}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setConflicts([])}
            >
              Tinjau Nanti
            </AlertDialogCancel>

            <AlertDialogAction
              className="bg-rose-600"
              onClick={() =>
                void Promise.all([
                  inventoryApi.refreshSnapshots(
                    editingId!,
                  ),
                  inventoryApi.products(),
                ])
                  .then(
                    async ([, latestProducts]) => {
                      const fresh =
                        await inventoryApi.detail(
                          'opnames',
                          editingId!,
                        );

                      setProducts(
                        latestProducts,
                      );

                      setItems(
                        formItemsFromDetail(
                          fresh,
                        ),
                      );

                      setConflicts([]);
                      setError('');

                      setNotice(
                        'Snapshot diperbarui. Hasil hitung fisik tetap tersimpan; silakan tinjau selisih baru.',
                      );
                    },
                  )
                  .catch((caught) =>
                    setError(
                      parseApiError(caught),
                    ),
                  )
              }
            >
              Perbarui Data Stok
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
