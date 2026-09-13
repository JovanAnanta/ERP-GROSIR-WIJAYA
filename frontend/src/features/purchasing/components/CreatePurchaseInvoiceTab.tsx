import { useState, useEffect, useCallback } from "react";
import {
  purchasingApi,
  defaultFinancialAccount,
  type SupplierDropdownOption,
  type SupplierCatalogItem,
  type SupplierProductOption,
  type ProductLookupOption,
  type ReadyPOOption,
  type FinancialAccountOption,
} from "../purchasing.api";
import { systemConfigApi } from "@/features/system/system-configuration.api";
import { createThermalPrintJob, escapeReceiptHtml, thermalReceiptFooter, thermalReceiptHeader, type ThermalPrintJob } from "@/lib/thermal-print";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogOverlay,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  Trash2,
  Save,
  AlertTriangle,
  FileText,
  Download,
  CheckSquare,
  Plus,
  PackagePlus,
  Printer,
  X,
} from "lucide-react";
import { parseApiError } from "@/utils/error";

interface PIItemForm {
  rowId: string;
  productId: string;
  productUnitId: string;
  productName: string;
  unitName: string;
  availableQty: number;
  purchasedQty: number;
  bonusQty: number;
  price: number;
  subtotal: number;
  note: string;
}

const createEmptyRow = (): PIItemForm => ({
  rowId: crypto.randomUUID(),
  productId: "",
  productUnitId: "",
  productName: "",
  unitName: "",
  purchasedQty: 1,
  bonusQty: 0,
  price: 0,
  subtotal: 0,
  availableQty: 0,
  note: "",
});

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character,
  );

interface Props {
  onSuccess: () => void;
  editingInvoiceId?: string | null;
  onCancelEdit?: () => void;
}

export default function CreatePurchaseInvoiceTab({
  onSuccess,
  editingInvoiceId,
  onCancelEdit,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);

  // Lookups
  const [suppliers, setSuppliers] = useState<SupplierDropdownOption[]>([]);
  const [allProducts, setAllProducts] = useState<ProductLookupOption[]>([]);
  const [readyPOs, setReadyPOs] = useState<ReadyPOOption[]>([]);
  const [financialAccounts, setFinancialAccounts] = useState<
    FinancialAccountOption[]
  >([]);
  const [supplierHistory, setSupplierHistory] = useState<
    SupplierProductOption[]
  >([]);

  // Header State
  const [supplierId, setSupplierId] = useState<string>("");
  const [purchaseOrderId, setPurchaseOrderId] = useState<string>("NONE");
  const [invoiceDate, setInvoiceDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [items, setItems] = useState<PIItemForm[]>(
    Array.from({ length: 7 }, () => createEmptyRow()),
  );

  // Financial & Config State
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [priceHistoryAction, setPriceHistoryAction] = useState<
    "MERGE" | "REWRITE" | "IGNORE"
  >("MERGE");

  const [paymentType, setPaymentType] = useState<"CREDIT" | "PAY_NOW">(
    "CREDIT",
  );
  const [financialAccountId, setFinancialAccountId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "TRANSFER">(
    "CASH",
  );
  const [paymentAmount, setPaymentAmount] = useState<number>(0);

  // Dialog State
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [catalogType, setCatalogType] = useState<"MASTER" | "HISTORY">(
    "MASTER",
  );
  const [catalogItems, setCatalogItems] = useState<
    (SupplierCatalogItem | SupplierProductOption)[]
  >([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);

  // Dialog Confirm Saldo
  const [isConfirmBalanceOpen, setIsConfirmBalanceOpen] = useState(false);
  const [submitStatusRef, setSubmitStatusRef] = useState<"DRAFT" | "COMPLETED">(
    "DRAFT",
  );

  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 100);
  }, []);

  const loadInitialData = useCallback(() => {
    purchasingApi
      .getSuppliers()
      .then(setSuppliers)
      .catch((err: unknown) => showError(parseApiError(err as Error)));
    purchasingApi.getProducts().then(setAllProducts).catch(console.error);
    purchasingApi.getReadyOrders().then(setReadyPOs).catch(console.error);
    purchasingApi
      .getFinancialAccounts()
      .then((rows) => {
        setFinancialAccounts(rows);
        setFinancialAccountId((current) =>
          current || defaultFinancialAccount(rows, "CASH"),
        );
      })
      .catch(console.error);
  }, [showError]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // FIX: Menggunakan async wrapper untuk fetch edit data tanpa cascading synchronous setState
  useEffect(() => {
    if (!editingInvoiceId) return;
    let isMounted = true;

    async function fetchEditInvoice() {
      if (isMounted) setIsLoadingEdit(true);
      try {
        const inv = await purchasingApi.getInvoiceDetail(editingInvoiceId!);
        if (!isMounted) return;

        setSupplierId(inv.supplierId);
        setPurchaseOrderId(inv.purchaseOrderId || "NONE");
        setInvoiceDate(inv.invoiceDate.slice(0, 10));
        setDueDate(inv.dueDate ? inv.dueDate.slice(0, 10) : "");
        setNote(inv.note || "");
        setDiscountAmount(inv.discountAmount);

        const hist = await purchasingApi.getSupplierHistory(inv.supplierId);
        if (isMounted) setSupplierHistory(hist);

        const loadedItems: PIItemForm[] = inv.details.map((d) => ({
          rowId: crypto.randomUUID(),
          productId: d.productUnitId,
          productUnitId: d.productUnitId,
          productName: d.productName,
          unitName: d.unitName,
          availableQty: 0,
          purchasedQty: d.quantity,
          bonusQty: d.bonusQuantity ?? 0,
          price: d.unitCost,
          subtotal: d.subtotal,
          note: d.note || "",
        }));

        while (loadedItems.length < 7) loadedItems.push(createEmptyRow());
        if (isMounted) setItems(loadedItems);
      } catch (err: unknown) {
        if (isMounted) showError(parseApiError(err as Error));
      } finally {
        if (isMounted) setIsLoadingEdit(false);
      }
    }

    fetchEditInvoice();
    return () => {
      isMounted = false;
    };
  }, [editingInvoiceId, showError]);

  const handleSupplierChange = async (val: string | null) => {
    const safeVal = val || "";
    if (!safeVal || safeVal === supplierId) return;
    setSupplierId(safeVal);
    setPurchaseOrderId("NONE");
    setItems(Array.from({ length: 7 }, () => createEmptyRow()));
    try {
      const hist = await purchasingApi.getSupplierHistory(safeVal);
      setSupplierHistory(hist);
    } catch (err: unknown) {
      console.error(parseApiError(err as Error));
    }
  };

  const getStock = (puId: string) => {
    for (const p of allProducts) {
      const u = p.units.find((un) => un.productUnitId === puId);
      if (u) return u.availableQty;
    }
    return 0;
  };

  const getHistoryPrice = (puId: string) => {
    const hist = supplierHistory.find((h) => h.productUnitId === puId);
    return hist ? hist.suggestedCost : 0;
  };

  const handlePOChange = async (val: string | null) => {
    const safeVal = val || "";
    if (!safeVal || safeVal === "NONE") {
      setPurchaseOrderId("NONE");
      setItems(Array.from({ length: 7 }, () => createEmptyRow()));
      return;
    }

    const selectedPO = readyPOs.find((po) => po.purchaseOrderId === safeVal);
    if (selectedPO) {
      setPurchaseOrderId(safeVal);
      setSupplierId(selectedPO.supplierId);
      try {
        const hist = await purchasingApi.getSupplierHistory(
          selectedPO.supplierId,
        );
        setSupplierHistory(hist);

        const mappedItems: PIItemForm[] = selectedPO.items.map((item) => {
          const historicalPrice =
            hist.find((h) => h.productUnitId === item.productUnitId)
              ?.suggestedCost || 0;
          return {
            rowId: crypto.randomUUID(),
            productId: item.productId,
            productUnitId: item.productUnitId,
            productName: item.productName,
            unitName: item.unitName,
            purchasedQty: item.quantity,
            bonusQty: 0,
            price: historicalPrice,
            subtotal: historicalPrice * item.quantity,
            availableQty: getStock(item.productUnitId),
            note: "",
          };
        });

        while (mappedItems.length < 7) mappedItems.push(createEmptyRow());
        setItems(mappedItems);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const openCatalog = async (type: "MASTER" | "HISTORY") => {
    if (!supplierId) return showError("Pilih Supplier terlebih dahulu.");
    try {
      setErrorMsg(null);
      setCatalogType(type);
      setCatalogItems([]);
      setIsCatalogOpen(true);
      const data =
        type === "MASTER"
          ? await purchasingApi.getSupplierCatalog(supplierId)
          : await purchasingApi.getSupplierHistory(supplierId);
      setCatalogItems(data);
      setSelectedUnitIds([]);
    } catch {
      showError("Gagal memuat data dari server.");
      setIsCatalogOpen(false);
    }
  };

  const handleSelectAll = () => {
    let allIds: string[] = [];
    if (catalogType === "MASTER")
      (catalogItems as SupplierCatalogItem[]).forEach((p) =>
        p.units.forEach((u) => allIds.push(u.productUnitId)),
      );
    else
      allIds = (catalogItems as SupplierProductOption[]).map(
        (p) => p.productUnitId,
      );
    setSelectedUnitIds(allIds);
  };

  const saveCatalogSelection = () => {
    const newItems: PIItemForm[] = [];
    selectedUnitIds.forEach((unitId) => {
      let pId = "";
      let pName = "";
      let uName = "";
      if (catalogType === "MASTER") {
        (catalogItems as SupplierCatalogItem[]).forEach((p) =>
          p.units.forEach((u) => {
            if (u.productUnitId === unitId) {
              pId = p.productId;
              pName = p.productName;
              uName = u.unitName;
            }
          }),
        );
      } else {
        const h = (catalogItems as SupplierProductOption[]).find(
          (p) => p.productUnitId === unitId,
        );
        if (h) {
          pId = h.productId;
          pName = h.productName;
          uName = h.unitName;
        }
      }

      if (
        unitId &&
        pName &&
        !items.some((existing) => existing.productUnitId === unitId)
      ) {
        const histPrice = getHistoryPrice(unitId);
        newItems.push({
          rowId: crypto.randomUUID(),
          productId: pId,
          productUnitId: unitId,
          productName: pName,
          unitName: uName,
          purchasedQty: 1,
          bonusQty: 0,
          price: histPrice,
          subtotal: histPrice,
          availableQty: getStock(unitId),
          note: "",
        });
      }
    });

    const currentItems = [...items];
    let emptyIndex = 0;
    newItems.forEach((newItem) => {
      while (
        emptyIndex < currentItems.length &&
        currentItems[emptyIndex].productId !== ""
      )
        emptyIndex++;
      if (emptyIndex < currentItems.length) currentItems[emptyIndex] = newItem;
      else currentItems.push(newItem);
    });
    setItems(currentItems);
    setIsCatalogOpen(false);
  };

  const addItemManual = () => setItems([...items, createEmptyRow()]);
  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    while (newItems.length < 7) newItems.push(createEmptyRow());
    setItems(newItems);
  };

  const updateItemField = (
    index: number,
    field: keyof PIItemForm,
    value: string | number,
  ) => {
    const newItems = [...items];
    const item = newItems[index];
    (item as Record<keyof PIItemForm, string | number>)[field] = value;

    if (field === "price") {
      item.subtotal = Number(value) * item.purchasedQty;
    } else if (field === "subtotal") {
      item.price =
        item.purchasedQty > 0 ? Number(value) / item.purchasedQty : 0;
    } else if (field === "purchasedQty") {
      item.subtotal = item.price * Number(value);
    }

    setItems(newItems);
  };

  const handleProductChange = (index: number, pId: string | null) => {
    const safeId = pId || "";
    if (!safeId) return;
    const prod = allProducts.find((p) => p.productId === safeId);
    if (!prod) return;
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      productId: prod.productId,
      productName: prod.productName,
      productUnitId: "",
      unitName: "",
      availableQty: 0,
      price: 0,
      subtotal: 0,
    };
    setItems(newItems);
  };

  const handleUnitChange = (index: number, puId: string | null) => {
    const safeId = puId || "";
    if (!safeId) return;
    const item = items[index];
    const prod = allProducts.find((p) => p.productId === item.productId);
    if (!prod) return;
    const unit = prod.units.find((u) => u.productUnitId === safeId);
    if (!unit) return;

    const newItems = [...items];
    const historyPrice = getHistoryPrice(unit.productUnitId);
    newItems[index] = {
      ...newItems[index],
      productUnitId: unit.productUnitId,
      unitName: unit.unitName,
      availableQty: unit.availableQty,
      price: historyPrice,
      subtotal: historyPrice * item.purchasedQty,
    };
    setItems(newItems);
  };

  const validItems = items.filter((i) => i.productId !== "");
  const validItemCount = validItems.length;
  const subtotalBarang = validItems.reduce(
    (acc, curr) => acc + curr.subtotal,
    0,
  );
  const grandTotal = subtotalBarang - discountAmount;

  const resetForm = () => {
    setSupplierId("");
    setPurchaseOrderId("NONE");
    setNote("");
    setDiscountAmount(0);
    setPaymentType("CREDIT");
    setFinancialAccountId("");
    setPaymentAmount(0);
    setItems(Array.from({ length: 7 }, () => createEmptyRow()));
    window.scrollTo({ top: 0, behavior: "smooth" });
    loadInitialData();
  };

  const handleSubmitCheck = (status: "DRAFT" | "COMPLETED") => {
    if (isSubmitting) return;

    if (status === "DRAFT" && paymentType === "PAY_NOW") {
      return showError(
        "Dokumen Draft tidak dapat memuat pembayaran (Kas/Bank). Ubah mode ke HUTANG PENUH atau tekan tombol POST STOK (Selesai).",
      );
    }

    if (!supplierId) return showError("Pilih Supplier terlebih dahulu.");
    if (validItems.length === 0)
      return showError("Minimal 1 produk harus diterima.");
    if (validItems.some((i) => !i.productUnitId))
      return showError(
        "Mohon lengkapi Satuan (Unit) pada semua barang yang dipilih.",
      );

    if (paymentType === "PAY_NOW") {
      if (!financialAccountId)
        return showError("Pilih Akun Kas/Bank jika ingin Bayar Langsung.");
      if (paymentAmount <= 0)
        return showError(
          "Nominal pembayaran harus lebih besar dari 0 jika memilih Bayar Langsung.",
        );

      const selectedAccount = financialAccounts.find(
        (a) => a.financialAccountId === financialAccountId,
      );
      if (selectedAccount && paymentAmount > selectedAccount.currentBalance) {
        setSubmitStatusRef(status);
        setIsConfirmBalanceOpen(true);
        return;
      }
    }

    const isPartial = paymentType === "PAY_NOW" && paymentAmount < grandTotal;
    const isCredit = paymentType === "CREDIT";
    if ((isPartial || isCredit) && !dueDate)
      return showError(
        "Jatuh Tempo wajib diisi untuk transaksi hutang/cicilan.",
      );

    executeSubmit(status);
  };

  const executeSubmit = async (status: "DRAFT" | "COMPLETED") => {
    setIsConfirmBalanceOpen(false);
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const payload = {
        supplierId,
        purchaseOrderId:
          purchaseOrderId !== "NONE" ? purchaseOrderId : undefined,
        invoiceDate,
        dueDate:
          paymentType === "CREDIT" ||
          (paymentType === "PAY_NOW" && paymentAmount < grandTotal)
            ? dueDate
            : undefined,
        invoiceTotal: grandTotal,
        discountAmount,
        note,
        status,
        priceHistoryAction,
        items: validItems.map((i) => ({
          productUnitId: i.productUnitId,
          purchasedQty: i.purchasedQty,
          bonusQty: i.bonusQty,
          price: i.price,
          note: i.note,
        })),
        payments:
          paymentType === "PAY_NOW" && paymentAmount > 0
            ? [{ financialAccountId, paymentAmount, paymentMethod }]
            : [],
      };

      if (editingInvoiceId) {
        await purchasingApi.updateInvoice(editingInvoiceId, payload);
      } else {
        await purchasingApi.createInvoice(payload);
      }

      resetForm();
      onSuccess();
    } catch (err: unknown) {
      showError(parseApiError(err as Error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintThermal = async () => {
    if (validItems.length === 0)
      return showError("Minimal 1 item untuk dicetak struk pratinjau.");
    let printJob: ThermalPrintJob | undefined;
    try {
      printJob = createThermalPrintJob("Pratinjau Purchase Invoice");
      const configRes = await systemConfigApi.get();
      const cfg = configRes.data;
      const suppName =
        suppliers.find((s) => s.supplierId === supplierId)?.supplierName ||
        "Supplier Umum";

      await printJob.printDocument(`
        <html>
          <head>
            <title>Pratinjau Struk Pembelian</title>
            <style>
              @page { size: 80mm auto; margin: 0; }
              body { font-family: 'Courier New', Courier, monospace; font-size: 10px; width: 80mm; margin: 0; padding: 4mm; color: #000; }
              .center { text-align: center; }
              .bold { font-weight: bold; }
              .line { border-bottom: 1px dashed #000; margin: 4px 0; }
              table { width: 100%; border-collapse: collapse; font-size: 10px; }
              th, td { text-align: left; padding: 2px 0; }
              .right { text-align: right; }
            </style>
          </head>
          <body>
            ${thermalReceiptHeader(cfg)}
            <div class="line"></div>
            <div>Supplier : ${escapeReceiptHtml(suppName)}</div>
            <div>Tanggal  : ${escapeReceiptHtml(invoiceDate)}</div>
            <div class="line"></div>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th class="right">Qty</th>
                  <th class="right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${validItems
                  .map(
                    (i) => `
                  <tr>
                    <td colspan="3">${escapeReceiptHtml(i.productName)} (${escapeReceiptHtml(i.unitName)})</td>
                  </tr>
                  <tr>
                    <td></td>
                    <td class="right">${i.purchasedQty}${i.bonusQty ? ` + Bonus ${i.bonusQty}` : ""} x ${i.price.toLocaleString("id-ID")}</td>
                    <td class="right">${i.subtotal.toLocaleString("id-ID")}</td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
            <div class="line"></div>
            <div style="display: flex; justify-content: space-between;"><span>Diskon:</span> <span>Rp ${discountAmount.toLocaleString("id-ID")}</span></div>
            <div style="display: flex; justify-content: space-between;" class="bold"><span>Grand Total:</span> <span>Rp ${grandTotal.toLocaleString("id-ID")}</span></div>
            ${note ? `<div style="margin-top: 4px;"><b>Catatan Faktur:</b> ${escapeHtml(note)}</div>` : ""}
            ${thermalReceiptFooter(cfg)}
          </body>
        </html>
      `);
    } catch {
      printJob?.close();
      showError("Gagal mencetak pratinjau struk.");
    }
  };

  if (isLoadingEdit) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-[#326dc8]" />
      </div>
    );
  }

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-full overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <PackagePlus className="w-5 h-5 text-emerald-600" />
          <h2 className="text-base font-black text-slate-800 uppercase tracking-wide">
            {editingInvoiceId
              ? `Edit Draft Purchase Invoice`
              : `Penerimaan Barang (Purchase Invoice)`}
          </h2>
        </div>
        {editingInvoiceId && onCancelEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancelEdit}
            className="text-rose-600 hover:bg-rose-50 h-8 text-xs font-bold"
          >
            <X className="w-4 h-4 mr-1" /> Batalkan Edit
          </Button>
        )}
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-rose-50 text-rose-700 text-sm font-bold border border-rose-200 rounded flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-5 h-5" /> {errorMsg}
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 bg-slate-50 p-4 rounded-lg border border-slate-200 shrink-0">
        <div className="col-span-1 md:col-span-2">
          <Label className="font-bold text-emerald-700 text-[10px] uppercase">
            Tarik Referensi PO (Opsional)
          </Label>
          <SearchableSelect
            value={purchaseOrderId === "NONE" ? "" : purchaseOrderId}
            onChange={(val) => handlePOChange(val || "NONE")}
            placeholder="-- Buat Faktur Manual (Tanpa PO) --"
            options={readyPOs.map((po) => ({
              value: po.purchaseOrderId,
              label: `${po.purchaseOrderNumber} - ${po.supplierName}`,
            }))}
            allowClear
            triggerClassName="bg-emerald-50 font-bold border-emerald-200"
          />
        </div>

        <div className="col-span-1 md:col-span-2">
          <Label className="font-bold text-slate-600 text-[10px] uppercase">
            Supplier *
          </Label>
          <SearchableSelect
            value={supplierId}
            onChange={handleSupplierChange}
            disabled={purchaseOrderId !== "NONE"}
            placeholder="-- Pilih Supplier --"
            options={suppliers.map((s) => ({
              value: s.supplierId,
              label: s.supplierName,
            }))}
            triggerClassName={purchaseOrderId !== "NONE" ? "opacity-70 bg-slate-100" : ""}
          />
        </div>

        <div className="col-span-1 md:col-span-2">
          <Label className="font-bold text-slate-600 text-[10px] uppercase">
            Tgl Terima Dokumen
          </Label>
          <Input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className="font-bold bg-white h-8 text-xs border-slate-300"
          />
        </div>
        <div className="col-span-1 md:col-span-2">
          <Label className="font-bold text-slate-600 text-[10px] uppercase">
            Catatan Dokumen
          </Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Catatan internal..."
            className="font-medium bg-white h-8 text-xs border-slate-300"
          />
        </div>
      </div>

      <div className="mb-2 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <Label className="font-extrabold text-slate-800 text-sm uppercase">
          Daftar Barang Diterima
        </Label>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handlePrintThermal}
            variant="outline"
            size="sm"
            className="h-7 text-[10px] font-bold text-slate-700 border-slate-300 bg-slate-50 hover:bg-slate-100"
          >
            <Printer className="w-3 h-3 mr-1" /> Cetak Struk
          </Button>
          <Button
            onClick={() => openCatalog("HISTORY")}
            disabled={!supplierId}
            variant="outline"
            size="sm"
            className="h-7 text-[10px] font-bold text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
          >
            <Download className="w-3 h-3 mr-1" /> Tarik Histori Beli
          </Button>
          <Button
            onClick={() => openCatalog("MASTER")}
            disabled={!supplierId}
            variant="outline"
            size="sm"
            className="h-7 text-[10px] font-bold text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-100"
          >
            <FileText className="w-3 h-3 mr-1" /> Katalog Produk Supplier
          </Button>
          <Button
            onClick={addItemManual}
            variant="outline"
            size="sm"
            className="h-7 text-[10px] font-bold text-[#326dc8] border-blue-200 bg-blue-50 hover:bg-blue-100"
          >
            <Plus className="w-3 h-3 mr-1" /> Tambah Baris Kosong
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white border border-slate-300 rounded-md mb-4 custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[1080px]">
          <thead className="bg-slate-100 sticky top-0 z-10 shadow-sm border-b border-slate-300">
            <tr>
              <th className="p-2 text-[10px] font-bold text-slate-600 uppercase border-r border-slate-300 w-10 text-center">
                No
              </th>
              <th className="p-2 text-[10px] font-bold text-slate-600 uppercase border-r border-slate-300 min-w-[250px]">
                Pilih Produk (Master)
              </th>
              <th className="p-2 text-[10px] font-bold text-slate-600 uppercase border-r border-slate-300 w-32">
                Satuan Unit
              </th>
              <th className="p-2 text-[10px] font-bold text-slate-600 uppercase border-r border-slate-300 w-24 text-center">
                Stok Gudang
              </th>
              <th className="p-2 text-[10px] font-bold text-[#00509e] uppercase border-r border-slate-300 w-24 text-center">
                Qty Beli
              </th>
              <th className="p-2 text-[10px] font-bold text-emerald-700 uppercase border-r border-slate-300 w-24 text-center">
                Bonus Barang
              </th>
              <th className="p-2 text-[10px] font-bold text-slate-600 uppercase border-r border-slate-300 w-32 text-right">
                Harga Satuan (Rp)
              </th>
              <th className="p-2 text-[10px] font-bold text-slate-600 uppercase border-r border-slate-300 w-36 text-right">
                Subtotal (Rp)
              </th>
              <th className="p-2 text-[10px] font-bold text-slate-600 uppercase border-r border-slate-300 w-40">
                Keterangan
              </th>
              <th className="p-2 w-10 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr
                key={item.rowId}
                className={`border-b border-slate-200 transition-colors ${item.productId ? "bg-emerald-50/10" : "bg-white hover:bg-slate-50"}`}
              >
                <td className="p-1 border-r border-slate-200 text-center text-[10px] font-bold text-slate-400">
                  {index + 1}
                </td>

                <td className="p-1 border-r border-slate-200">
                  <SearchableSelect
                    size="sm"
                    value={item.productId}
                    onChange={(val) => handleProductChange(index, val)}
                    placeholder="Pilih Produk..."
                    options={allProducts.map((p) => ({
                      value: p.productId,
                      label: p.productName,
                    }))}
                    className="border-none shadow-none bg-transparent"
                  />
                </td>

                <td className="p-1 border-r border-slate-200">
                  <SearchableSelect
                    size="sm"
                    value={item.productUnitId}
                    onChange={(val) => handleUnitChange(index, val)}
                    disabled={!item.productId}
                    placeholder="Pilih Satuan..."
                    options={
                      allProducts
                        .find((p) => p.productId === item.productId)
                        ?.units.map((u) => ({
                          value: u.productUnitId,
                          label: u.unitName,
                        })) || []
                    }
                    className="border-none shadow-none bg-transparent"
                  />
                </td>

                <td className="p-1 border-r border-slate-200 bg-slate-50 text-center">
                  <span
                    className={`text-[11px] font-bold ${item.productId ? "text-slate-700" : "text-slate-300"}`}
                  >
                    {item.productId ? item.availableQty : "-"}
                  </span>
                </td>

                <td className="p-1 border-r border-slate-200 bg-blue-50/30">
                  <FormattedNumberInput
                    min={1}
                    allowDecimal={true}
                    disabled={!item.productId}
                    value={item.productId ? item.purchasedQty : ""}
                    onChange={(val) =>
                      updateItemField(index, "purchasedQty", val)
                    }
                    className="h-7 text-xs font-bold text-center border-none shadow-none bg-transparent text-[#00509e] disabled:opacity-50"
                  />
                </td>

                <td className="p-1 border-r border-slate-200 bg-emerald-50/30">
                  <FormattedNumberInput
                    min={0}
                    allowDecimal={true}
                    disabled={!item.productId}
                    value={
                      item.productId
                        ? item.bonusQty === 0
                          ? ""
                          : item.bonusQty
                        : ""
                    }
                    onChange={(val) =>
                      updateItemField(index, "bonusQty", val)
                    }
                    placeholder="0"
                    className="h-7 text-xs font-bold text-center text-emerald-700 border-none shadow-none bg-transparent disabled:opacity-50"
                  />
                </td>

                <td className="p-1 border-r border-slate-200 bg-white">
                  <FormattedNumberInput
                    min={0}
                    disabled={!item.productId}
                    value={
                      item.productId
                        ? item.price === 0
                          ? ""
                          : item.price
                        : ""
                    }
                    onChange={(val) =>
                      updateItemField(index, "price", val)
                    }
                    className="h-7 text-xs font-bold text-right border-none shadow-none bg-transparent disabled:opacity-50"
                    placeholder="0"
                  />
                </td>

                <td className="p-1 border-r border-slate-200 bg-amber-50/20">
                  <FormattedNumberInput
                    min={0}
                    disabled={!item.productId}
                    value={
                      item.productId
                        ? item.subtotal === 0
                          ? ""
                          : item.subtotal
                        : ""
                    }
                    onChange={(val) =>
                      updateItemField(index, "subtotal", val)
                    }
                    className="h-7 text-xs font-bold text-right border-none shadow-none bg-transparent disabled:opacity-50 text-slate-800"
                    placeholder="0"
                  />
                </td>

                <td className="p-1 border-r border-slate-200">
                  <Input
                    disabled={!item.productId}
                    value={item.note || ""}
                    onChange={(e) =>
                      updateItemField(index, "note", e.target.value)
                    }
                    placeholder={item.productId ? "Opsional..." : ""}
                    className="h-7 text-xs border-none shadow-none focus-visible:ring-1 focus-visible:ring-[#00509e] rounded-sm bg-transparent disabled:opacity-50"
                  />
                </td>

                <td className="p-1 text-center">
                  {item.productId && (
                    <Button
                      variant="ghost"
                      onClick={() => removeItem(index)}
                      className="h-6 w-6 p-0 text-rose-500 hover:bg-rose-100 rounded-sm"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-auto pt-3 border-t border-slate-200 bg-slate-100/50 p-3 rounded-lg border flex flex-col md:flex-row justify-between items-start md:items-end gap-6 shrink-0">
        <div className="flex flex-col gap-3 w-full md:w-[480px]">
          <div className="bg-white border border-slate-300 p-2.5 rounded shadow-sm">
            <Label className="text-[10px] font-black text-slate-700 uppercase mb-2 block border-b border-slate-100 pb-1">
              Tindakan Histori Harga Beli
            </Label>
            <div className="flex gap-4 mb-1 mt-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  className="w-3.5 h-3.5 text-[#00509e]"
                  checked={priceHistoryAction === "MERGE"}
                  onChange={() => setPriceHistoryAction("MERGE")}
                />
                <span className="text-[11px] font-bold text-slate-700">
                  MERGE (Tambah/Perbarui)
                </span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  className="w-3.5 h-3.5 text-[#00509e]"
                  checked={priceHistoryAction === "REWRITE"}
                  onChange={() => setPriceHistoryAction("REWRITE")}
                />
                <span className="text-[11px] font-bold text-slate-700">
                  REWRITE (Timpa Seluruhnya)
                </span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  className="w-3.5 h-3.5 text-[#00509e]"
                  checked={priceHistoryAction === "IGNORE"}
                  onChange={() => setPriceHistoryAction("IGNORE")}
                />
                <span className="text-[11px] font-bold text-slate-700">
                  IGNORE (Abaikan)
                </span>
              </label>
            </div>
          </div>

          <div className="bg-white border border-slate-300 p-2.5 rounded shadow-sm">
            <Label className="text-[10px] font-black text-slate-700 uppercase mb-2 block border-b border-slate-100 pb-1">
              Metode Pelunasan Tagihan
            </Label>
            <div className="flex gap-4 mb-2 mt-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  className="w-3.5 h-3.5 text-amber-500"
                  checked={paymentType === "CREDIT"}
                  onChange={() => {
                    setPaymentType("CREDIT");
                    setPaymentAmount(0);
                  }}
                />
                <span className="text-[11px] font-bold text-slate-700">
                  HUTANG PENUH (Kredit)
                </span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  className="w-3.5 h-3.5 text-emerald-600"
                  checked={paymentType === "PAY_NOW"}
                  onChange={() => {
                    setPaymentType("PAY_NOW");
                    setPaymentAmount(grandTotal);
                  }}
                />
                <span className="text-[11px] font-bold text-slate-700">
                  BAYAR LUNAS / SEBAGIAN
                </span>
              </label>
            </div>

            {paymentType === "CREDIT" && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
                <Label className="text-[10px] font-bold text-rose-600 uppercase w-28">
                  Tgl Jatuh Tempo *
                </Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-7 text-xs font-bold w-[140px] border-rose-300 focus-visible:ring-rose-500"
                />
              </div>
            )}

            {paymentType === "PAY_NOW" && (
              <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <Select
                    value={paymentMethod}
                    onValueChange={(v) => {
                      if (v === "CASH" || v === "TRANSFER") {
                        setPaymentMethod(v);
                        setFinancialAccountId(
                          defaultFinancialAccount(financialAccounts, v),
                        );
                      }
                    }}
                  >
                    <SelectTrigger className="w-[100px] h-7 text-[10px] font-bold bg-slate-50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white z-50 border-slate-200 shadow-lg">
                      <SelectItem value="CASH" className="text-[10px]">
                        CASH
                      </SelectItem>
                      <SelectItem value="TRANSFER" className="text-[10px]">
                        TRANSFER
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <SearchableSelect
                    size="sm"
                    value={financialAccountId}
                    onChange={(val) => setFinancialAccountId(val || "")}
                    placeholder="Pilih Kas/Bank *"
                    options={financialAccounts.map((a) => ({
                      value: a.financialAccountId,
                      label: a.accountName,
                      sublabel: `Saldo: Rp ${a.currentBalance.toLocaleString("id-ID")}`,
                    }))}
                    className="flex-1 bg-[#fff8e1] border-amber-300 rounded-md"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase w-[100px]">
                    Nominal Bayar:
                  </Label>
                  <FormattedNumberInput
                    min={1}
                    value={paymentAmount || ""}
                    onChange={(val) =>
                      setPaymentAmount(val || 0)
                    }
                    className="h-7 text-xs font-bold flex-1 text-emerald-700 bg-emerald-50 border-emerald-300"
                  />
                </div>
                {paymentAmount < grandTotal && (
                  <div className="flex items-center gap-2 mt-1">
                    <Label className="text-[10px] font-bold text-rose-600 uppercase w-[100px] leading-tight">
                      Jatuh Tempo (Sisa Hutang) *
                    </Label>
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="h-7 text-xs font-bold w-[140px] border-rose-300 focus-visible:ring-rose-500"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end w-full md:w-[350px]">
          <div className="bg-white border border-slate-300 p-3 rounded-md shadow-sm w-full mb-3">
            <div className="flex justify-between items-center mb-1 text-xs">
              <span className="font-bold text-slate-500">
                Subtotal Barang ({validItemCount} Item)
              </span>
              <span className="font-bold text-slate-700">
                Rp {subtotalBarang.toLocaleString("id-ID")}
              </span>
            </div>
            <div className="flex justify-between items-center mb-2 text-xs border-b border-slate-100 pb-2">
              <span className="font-bold text-slate-500">
                Diskon Faktur Global (-)
              </span>
              <FormattedNumberInput
                min={0}
                value={discountAmount === 0 ? "" : discountAmount}
                onChange={(val) =>
                  setDiscountAmount(val || 0)
                }
                placeholder="0"
                className="h-6 w-28 text-right text-xs font-bold text-rose-600 border-slate-300"
              />
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                GRAND TOTAL
              </span>
              <span className="text-2xl font-black text-[#00509e] tracking-tight">
                Rp {grandTotal.toLocaleString("id-ID")}
              </span>
            </div>
          </div>

          <div className="flex gap-2 w-full justify-end">
            <Button
              variant="outline"
              onClick={() => handleSubmitCheck("DRAFT")}
              disabled={isSubmitting || paymentType === "PAY_NOW"}
              className="font-bold h-10 text-xs px-5 border-slate-300 text-slate-700 hover:bg-slate-100 w-1/2"
            >
              Simpan Draft
            </Button>
            <Button
              onClick={() => handleSubmitCheck("COMPLETED")}
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 text-xs px-6 shadow w-1/2"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}{" "}
              {editingInvoiceId ? "UPDATE & POST" : "POST STOK (Selesai)"}
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={isConfirmBalanceOpen}
        onOpenChange={setIsConfirmBalanceOpen}
      >
        <DialogOverlay className="bg-black/40 z-50" />
        <DialogContent className="max-w-md bg-white z-[60] p-6 shadow-2xl border-rose-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 font-black">
              <AlertTriangle className="w-5 h-5" /> Peringatan Saldo Kas/Bank
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-slate-700 font-medium">
            <p className="mb-2">
              Saldo pada{" "}
              <b>
                {
                  financialAccounts.find(
                    (a) => a.financialAccountId === financialAccountId,
                  )?.accountName
                }
              </b>{" "}
              saat ini adalah{" "}
              <b>
                Rp{" "}
                {financialAccounts
                  .find((a) => a.financialAccountId === financialAccountId)
                  ?.currentBalance.toLocaleString("id-ID")}
              </b>
              .
            </p>
            <p>
              Nominal pembayaran Anda (
              <b>Rp {paymentAmount.toLocaleString("id-ID")}</b>) melebihi saldo
              yang tersedia. Jika Anda melanjutkan, saldo akun ini akan menjadi{" "}
              <b>minus</b>.
            </p>
            <p className="mt-3 font-bold text-rose-600">
              Apakah Anda yakin ingin meneruskan transaksi ini?
            </p>
          </div>
          <DialogFooter className="mt-4 flex gap-2">
            <Button
              variant="outline"
              onClick={() => setIsConfirmBalanceOpen(false)}
              className="h-9 text-xs"
            >
              Batal
            </Button>
            <Button
              onClick={() => executeSubmit(submitStatusRef)}
              disabled={isSubmitting}
              className="h-9 text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-6"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}{" "}
              Ya, Teruskan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCatalogOpen} onOpenChange={setIsCatalogOpen}>
        <DialogOverlay className="bg-black/40 z-40" />
        <DialogContent className="max-w-xl max-h-[80vh] overflow-hidden flex flex-col p-4 bg-white z-50 shadow-2xl border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase text-slate-800">
              {catalogType === "MASTER"
                ? "Katalog Produk Supplier"
                : "Histori Pembelian Supplier"}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto p-1 space-y-3 mt-2 flex-1 custom-scrollbar">
            {catalogItems.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-4">
                Data tidak ditemukan.
              </p>
            )}
            {catalogType === "MASTER"
              ? (catalogItems as SupplierCatalogItem[]).map((p) => (
                  <div
                    key={p.productId}
                    className="p-2 border border-slate-100 bg-slate-50 rounded"
                  >
                    <p className="font-bold text-xs text-slate-800 mb-2">
                      {p.productName}
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {p.units.map((u) => (
                        <label
                          key={u.productUnitId}
                          className="flex items-center gap-2 p-2 border border-slate-200 rounded bg-white cursor-pointer hover:border-[#326dc8] transition-colors"
                        >
                          <Checkbox
                            checked={selectedUnitIds.includes(u.productUnitId)}
                            onCheckedChange={(c) =>
                              setSelectedUnitIds(
                                c
                                  ? [...selectedUnitIds, u.productUnitId]
                                  : selectedUnitIds.filter(
                                      (id) => id !== u.productUnitId,
                                    ),
                              )
                            }
                          />
                          <span className="text-[10px] font-bold">
                            {u.unitName}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))
              : (catalogItems as SupplierProductOption[]).map((p) => (
                  <label
                    key={p.productUnitId}
                    className="flex items-center justify-between p-2.5 border border-slate-200 rounded bg-white cursor-pointer hover:border-[#326dc8] transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Checkbox
                        checked={selectedUnitIds.includes(p.productUnitId)}
                        onCheckedChange={(c) =>
                          setSelectedUnitIds(
                            c
                              ? [...selectedUnitIds, p.productUnitId]
                              : selectedUnitIds.filter(
                                  (id) => id !== p.productUnitId,
                                ),
                          )
                        }
                      />
                      <span className="text-xs font-bold text-slate-800">
                        {p.productName}
                      </span>
                    </div>
                    <span className="text-[10px] font-extrabold text-[#326dc8] uppercase bg-blue-50 px-2 py-0.5 rounded">
                      {p.unitName}
                    </span>
                  </label>
                ))}
          </div>
          <DialogFooter className="mt-2 flex justify-between items-center w-full">
            <Button
              variant="outline"
              onClick={handleSelectAll}
              className="h-8 text-xs font-bold text-[#326dc8] border-[#326dc8] hover:bg-blue-50"
            >
              <CheckSquare className="w-3.5 h-3.5 mr-1" /> Pilih Semua
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsCatalogOpen(false)}
                className="h-8 text-xs border-slate-300"
              >
                Batal
              </Button>
              <Button
                onClick={saveCatalogSelection}
                className="h-8 text-xs bg-[#326dc8] hover:bg-blue-700 text-white font-bold px-5"
              >
                Masukkan Terpilih ({selectedUnitIds.length})
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
