import { apiClient } from "@/lib/axios";

export type InventoryStatus = "DRAFT" | "APPROVED" | "CANCELLED";
export interface ProductStockOption {
  productUnitId: string;
  productName: string;
  unitName: string;
  actualQty: number;
  availableQty: number;
  packedQty: number;
  warehouseQty: number;
  suggestedUnitCost: number | null;
  stockDisplay: string;
}
export interface TransformationProduct {
  productUnitId: string;
  productName: string;
  categoryName: string;
  unitName: string;
  actualQty: number;
  availableQty: number;
  suggestedUnitCost: number | null;
  canBeSource: boolean;
  canBeResult: boolean;
}
export interface TransformationPayload {
  transformationDate: string;
  note?: string;
  items: Array<{
    sourceProductUnitId: string;
    sourceQuantity: number;
    resultProductUnitId: string;
    resultQuantity: number;
    appliedUnitCost?: number;
    note?: string;
  }>;
}
export interface TransformationCard {
  transformationId: string;
  transformationNumber: string;
  transformationDate: string;
  note?: string | null;
  createdAt: string;
  createdByUser?: { fullName: string };
  _count: { details: number };
}
export interface TransformationDetail extends TransformationCard {
  details: Array<{
    transformationDetailId: string;
    lineNumber: number;
    sourceProductUnitId: string;
    sourceProductName: string;
    sourceUnitName: string;
    sourceQuantity: number;
    resultProductUnitId: string;
    resultProductName: string;
    resultUnitName: string;
    resultQuantity: number;
    sourceCostTotal: number;
    suggestedUnitCost: number;
    appliedUnitCost: number;
    resultCostTotal: number;
    valuationVariance: number;
    note?: string | null;
  }>;
}
export interface StockHistoryItem {
  productUnitId: string;
  productName: string;
  unitName: string;
  actualQty: number;
  availableQty: number;
  packedQty: number;
  warehouseQty: number;
  committedQty: number;
  minimumQty: number;
  minimumDisplay: string;
  isLowStock: boolean;
  actualDisplay: string;
  warehouseDisplay: string;
  packedDisplay: string;
  availableDisplay: string;
  shortageDisplay: string;
}
export interface StockFilterOptions {
  categories: Array<{ categoryId: string; categoryName: string }>;
  brands: Array<{ brandId: string; brandName: string }>;
  suppliers: SupplierOption[];
}
export interface StockHistoryFilters {
  search?: string;
  categoryId?: string;
  brandId?: string;
  supplierId?: string;
}
export interface InventoryDateFilters {
  dateFrom?: string;
  dateTo?: string;
}
export interface SupplierOption {
  supplierId: string;
  supplierName: string;
}
export interface PaginationMeta {
  currentPage: number;
  pageSize: number;
  totalData: number;
  totalPage: number;
}
export interface InventoryCard {
  adjustmentId?: string;
  stockOpnameId?: string;
  adjustmentNumber?: string;
  stockOpnameNumber?: string;
  adjustmentDate?: string;
  opnameDate?: string;
  reason?: string;
  note?: string;
  status: InventoryStatus;
  sourceType?: string;
  supplierId?: string | null;
  supplier?: { supplierName: string } | null;
  createdAt: string;
  _count: { details: number };
  createdByUser?: { fullName: string };
  adjustment?: { adjustmentId: string; adjustmentNumber: string } | null;
}
export interface InventoryDetail extends InventoryCard {
  details: Array<
    Record<string, unknown> & {
      productUnitId: string;
      productName: string;
      unitName: string;
    }
  >;
}
export interface AdjustmentPayload {
  adjustmentDate: string;
  reason: string;
  note?: string;
  status: "DRAFT" | "APPROVED";
  items: Array<{
    productUnitId: string;
    direction: "IN" | "OUT";
    quantity: number;
    unitCost?: number;
    note?: string;
  }>;
}
export interface OpnamePayload {
  opnameDate: string;
  supplierId?: string;
  note?: string;
  status: "DRAFT" | "APPROVED";
  items: Array<{
    productUnitId: string;
    warehouseQty: number;
    packedQty: number;
    unitCost?: number;
    note?: string;
  }>;
}
export type InventoryLoanDirection = "OUTGOING" | "INCOMING";
export type InventoryLoanStatus =
  "DRAFT" | "OUTSTANDING" | "CLOSED" | "WRITTEN_OFF" | "CANCELLED";
export interface InventoryLoanLookup {
  productUnitId: string;
  productName: string;
  unitName: string;
  actualQty: number;
  availableQty: number;
  suggestedUnitCost?: number | null;
}
export interface InventoryLoanLookups {
  products: InventoryLoanLookup[];
  customers: Array<{ customerId: string; customerName: string }>;
  suppliers: Array<{ supplierId: string; supplierName: string }>;
}
export interface InventoryLoanDetailLine {
  inventoryLoanDetailId: string;
  productUnitId: string;
  quantity: number;
  provisionalUnitCost: number;
  provisionalTotalCost: number;
  returnedQuantity: number;
  convertedQuantity: number;
  writtenOffQuantity: number;
  recoveredQuantity: number;
  note?: string | null;
  productUnit: { product: { productName: string }; unit: { unitName: string } };
}
export interface InventoryLoanCard {
  inventoryLoanId: string;
  loanNumber: string;
  direction: InventoryLoanDirection;
  status: InventoryLoanStatus;
  loanDate: string;
  dueDate?: string | null;
  note?: string | null;
  customer?: { customerId: string; customerName: string } | null;
  supplier?: { supplierId: string; supplierName: string } | null;
  _count?: { details: number; resolutions: number };
}
export interface InventoryLoanResolutionRecord {
  inventoryLoanResolutionId: string;
  resolutionNumber: string;
  resolutionDate: string;
  status: string;
  salesInvoice?: {
    salesInvoiceId: string;
    salesInvoiceNumber: string;
    status: string;
  } | null;
  purchaseInvoice?: {
    purchaseInvoiceId: string;
    purchaseInvoiceNumber: string;
    status: string;
  } | null;
  details: Array<{
    inventoryLoanResolutionDetailId: string;
    inventoryLoanDetailId: string;
    recoveredWriteOffDetailId?: string | null;
    resolutionType: string;
    sourceQuantity: number;
    obligationTotalCost: number;
    replacementQuantity?: number | null;
    replacementProductUnit?: {
      product: { productName: string };
      unit: { unitName: string };
    } | null;
    recoveries?: Array<{ sourceQuantity: number }>;
  }>;
}
export interface InventoryLoanDetail extends InventoryLoanCard {
  customerId?: string | null;
  supplierId?: string | null;
  details: InventoryLoanDetailLine[];
  resolutions: InventoryLoanResolutionRecord[];
}
export interface InventoryLoanPayload {
  direction: InventoryLoanDirection;
  customerId?: string;
  supplierId?: string;
  loanDate: string;
  dueDate?: string;
  note?: string;
  items: Array<{
    productUnitId: string;
    quantity: number;
    provisionalUnitCost: number;
    note?: string;
  }>;
}
export interface InventoryLoanResolutionPayload {
  resolutionDate: string;
  invoiceDueDate?: string;
  note?: string;
  items: Array<{
    inventoryLoanDetailId: string;
    resolutionType:
      | "SAME_PRODUCT_RETURN"
      | "REPLACEMENT_PRODUCT"
      | "INVOICE_CONVERSION"
      | "WRITE_OFF";
    sourceQuantity: number;
    replacementProductUnitId?: string;
    replacementQuantity?: number;
    invoiceUnitPrice?: number;
    note?: string;
  }>;
}

export const inventoryApi = {
  loanLookups: async (): Promise<InventoryLoanLookups> =>
    (
      await apiClient.get<{ data: InventoryLoanLookups }>(
        "/inventory/loans/lookups",
      )
    ).data.data,
  loanList: async (
    tab: "ACTIVE" | "HISTORY",
    page = 1,
    limit = 20,
    filters?: {
      direction?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ): Promise<{ data: InventoryLoanCard[]; meta: PaginationMeta }> =>
    (
      await apiClient.get("/inventory/loans", {
        params: { tab, page, limit, ...filters },
      })
    ).data,
  loanDetail: async (id: string): Promise<InventoryLoanDetail> =>
    (
      await apiClient.get<{ data: InventoryLoanDetail }>(
        `/inventory/loans/${id}`,
      )
    ).data.data,
  saveLoan: async (
    payload: InventoryLoanPayload,
    id?: string,
  ): Promise<InventoryLoanDetail> =>
    (
      await (id
        ? apiClient.put<{ data: InventoryLoanDetail }>(
            `/inventory/loans/${id}`,
            payload,
          )
        : apiClient.post<{ data: InventoryLoanDetail }>(
            "/inventory/loans",
            payload,
          ))
    ).data.data,
  activateLoan: async (id: string): Promise<InventoryLoanDetail> =>
    (
      await apiClient.post<{ data: InventoryLoanDetail }>(
        `/inventory/loans/${id}/activate`,
      )
    ).data.data,
  cancelLoan: async (id: string): Promise<InventoryLoanDetail> =>
    (
      await apiClient.post<{ data: InventoryLoanDetail }>(
        `/inventory/loans/${id}/cancel`,
      )
    ).data.data,
  resolveLoan: async (
    id: string,
    payload: InventoryLoanResolutionPayload,
  ): Promise<InventoryLoanDetail> =>
    (
      await apiClient.post<{ data: InventoryLoanDetail }>(
        `/inventory/loans/${id}/resolutions`,
        payload,
      )
    ).data.data,
  transformationProducts: async (): Promise<TransformationProduct[]> => {
    const response = await apiClient.get<{ data: TransformationProduct[] }>(
      "/inventory/lookups/transformation-products",
    );
    return response.data.data;
  },
  listTransformations: async (
    page = 1,
    limit = 20,
    filters?: { search?: string; dateFrom?: string; dateTo?: string },
  ): Promise<{ data: TransformationCard[]; meta: PaginationMeta }> => {
    const response = await apiClient.get<{
      data: TransformationCard[];
      meta: PaginationMeta;
    }>("/inventory/transformations", {
      params: {
        page,
        limit,
        search: filters?.search || undefined,
        dateFrom: filters?.dateFrom || undefined,
        dateTo: filters?.dateTo || undefined,
      },
    });
    return response.data;
  },
  transformationDetail: async (id: string): Promise<TransformationDetail> => {
    const response = await apiClient.get<{ data: TransformationDetail }>(
      `/inventory/transformations/${id}`,
    );
    return response.data.data;
  },
  createTransformation: async (
    payload: TransformationPayload,
  ): Promise<TransformationDetail> => {
    const response = await apiClient.post<{ data: TransformationDetail }>(
      "/inventory/transformations",
      payload,
    );
    return response.data.data;
  },
  stockFilters: async (): Promise<StockFilterOptions> => {
    const response = await apiClient.get<{ data: StockFilterOptions }>(
      "/inventory/lookups/stock-filters",
    );
    return response.data.data;
  },
  stockHistory: async (
    page = 1,
    limit = 20,
    filters?: StockHistoryFilters,
  ): Promise<{ data: StockHistoryItem[]; meta: PaginationMeta }> => {
    const response = await apiClient.get<{
      data: StockHistoryItem[];
      meta: PaginationMeta;
    }>("/inventory/movement-history", { params: { page, limit, ...filters } });
    return response.data;
  },
  products: async (): Promise<ProductStockOption[]> => {
    const response = await apiClient.get<{ data: ProductStockOption[] }>(
      "/inventory/lookups/products",
    );
    return response.data.data;
  },
  suppliers: async (): Promise<SupplierOption[]> => {
    const response = await apiClient.get<{ data: SupplierOption[] }>(
      "/inventory/lookups/suppliers",
    );
    return response.data.data;
  },
  supplierCatalog: async (
    supplierId: string,
  ): Promise<ProductStockOption[]> => {
    const response = await apiClient.get<{ data: ProductStockOption[] }>(
      `/inventory/lookups/supplier-catalog/${supplierId}`,
    );
    return response.data.data;
  },
  list: async (
    kind: "adjustments" | "opnames",
    tab: "ACTIVE" | "HISTORY",
    page = 1,
    limit = 20,
    filters?: InventoryDateFilters,
  ): Promise<{ data: InventoryCard[]; meta: PaginationMeta }> => {
    const response = await apiClient.get<{
      data: InventoryCard[];
      meta: PaginationMeta;
    }>(`/inventory/${kind}`, { params: { tab, page, limit, ...filters } });
    return { data: response.data.data, meta: response.data.meta };
  },
  detail: async (
    kind: "adjustments" | "opnames",
    id: string,
  ): Promise<InventoryDetail> => {
    const response = await apiClient.get<{ data: InventoryDetail }>(
      `/inventory/${kind}/${id}`,
    );
    return response.data.data;
  },
  saveAdjustment: async (
    payload: AdjustmentPayload,
    id?: string,
  ): Promise<InventoryDetail> => {
    const response = await (id
      ? apiClient.put<{ data: InventoryDetail }>(
          `/inventory/adjustments/${id}`,
          payload,
        )
      : apiClient.post<{ data: InventoryDetail }>(
          "/inventory/adjustments",
          payload,
        ));
    return response.data.data;
  },
  saveOpname: async (
    payload: OpnamePayload,
    id?: string,
  ): Promise<InventoryDetail> => {
    const response = await (id
      ? apiClient.put<{ data: InventoryDetail }>(
          `/inventory/opnames/${id}`,
          payload,
        )
      : apiClient.post<{ data: InventoryDetail }>(
          "/inventory/opnames",
          payload,
        ));
    return response.data.data;
  },
  approve: async (kind: "adjustments" | "opnames", id: string) =>
    apiClient.post(`/inventory/${kind}/${id}/approve`),
  cancel: async (kind: "adjustments" | "opnames", id: string) =>
    apiClient.post(`/inventory/${kind}/${id}/cancel`),
  conflicts: async (
    id: string,
  ): Promise<
    Array<{
      productUnitId: string;
      productName: string;
      snapshotQty: number;
      currentQty: number;
    }>
  > => {
    const response = await apiClient.get<{
      data: Array<{
        productUnitId: string;
        productName: string;
        snapshotQty: number;
        currentQty: number;
      }>;
    }>(`/inventory/opnames/${id}/conflicts`);
    return response.data.data;
  },
  refreshSnapshots: async (id: string) =>
    apiClient.post(`/inventory/opnames/${id}/refresh-snapshots`),
};
