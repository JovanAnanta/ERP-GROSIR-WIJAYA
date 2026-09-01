import { apiClient } from "@/lib/axios";

export type FifoOriginType =
  | "PURCHASE_INVOICE"
  | "PURCHASE_RETURN"
  | "SALES_INVOICE"
  | "SALES_RETURN"
  | "INVENTORY_ADJUSTMENT"
  | "INVENTORY_TRANSFORMATION"
  | "INVENTORY_LOAN"
  | "INVENTORY_LOAN_RETURN"
  | "OPENING_BALANCE";

export interface FifoOriginSummary {
  type: FifoOriginType;
  id: string;
  number: string;
  status?: string;
  partyName?: string | null;
  date?: string;
  detailAvailable: boolean;
}

export interface FifoLayerCard {
  fifoLayerId: string;
  fifoLayerNumber: string;
  productId: string;
  productUnitId: string;
  productName: string;
  categoryName: string;
  brandName?: string | null;
  parentUnitName: string;
  originType: FifoOriginType;
  originId: string;
  originNumber: string;
  origin?: FifoOriginSummary | null;
  originalQty: number;
  consumedQty: number;
  remainingQty: number;
  originalDisplay: string;
  consumedDisplay: string;
  remainingDisplay: string;
  unitCost: number;
  unitCosts: Array<{
    productUnitId: string;
    unitName: string;
    unitCost: number;
  }>;
  originalCost: number;
  remainingCost: number;
  utilizationPercent: number;
  status: "ACTIVE" | "DEPLETED";
  createdAt: string;
  createdByName: string;
}

export interface FifoTimelineItem {
  fifoLayerTransactionId: string;
  direction: "IN" | "OUT";
  quantity: number;
  quantityDisplay: string;
  quantityBefore: number;
  quantityAfter: number;
  quantityBeforeDisplay: string;
  quantityAfterDisplay: string;
  unitCost: number;
  totalCost: number;
  createdAt: string;
  createdByName: string;
  movement: {
    inventoryMovementId: string;
    movementNumber: string;
    movementType: string;
    originType: FifoOriginType;
    originId: string;
    originNumber: string;
    movementDate: string;
    document?: FifoOriginSummary | null;
    transformationAllocations: Array<{
      role: "SOURCE" | "RESULT";
      allocatedQuantity: number;
      allocatedCost: number;
      lineNumber: number;
      sourceProductName: string;
      sourceUnitName: string;
      resultProductName: string;
      resultUnitName: string;
    }>;
  };
}

export interface FifoLayerDetail extends FifoLayerCard {
  totalOutQty: number;
  totalOutCost: number;
  returnedQty: number;
  returnedDisplay: string;
  timeline: FifoTimelineItem[];
  timelineMeta: PaginationMeta;
}

export interface PaginationMeta {
  currentPage: number;
  pageSize: number;
  totalData: number;
  totalPage: number;
}

export interface FifoFilters {
  page?: number;
  limit?: number;
  search?: string;
  productId?: string;
  categoryId?: string;
  brandId?: string;
  supplierId?: string;
  originType?: string;
  status?: "ACTIVE" | "DEPLETED" | "ALL";
  dateFrom?: string;
  dateTo?: string;
  sort?: "OLDEST" | "NEWEST";
}

export interface FifoFilterOptions {
  products: Array<{ productId: string; productName: string }>;
  categories: Array<{ categoryId: string; categoryName: string }>;
  brands: Array<{ brandId: string; brandName: string }>;
  suppliers: Array<{ supplierId: string; supplierName: string }>;
  originTypes: FifoOriginType[];
}

const cleanParams = (filters: FifoFilters) =>
  Object.fromEntries(
    Object.entries(filters).filter(
      ([, value]) => value !== "" && value !== undefined,
    ),
  );

export const fifoApi = {
  filters: async (): Promise<FifoFilterOptions> => {
    const response = await apiClient.get<{ data: FifoFilterOptions }>(
      "/fifo/lookups/filters",
    );
    return response.data.data;
  },
  list: async (tab: "COST" | "HISTORY", filters: FifoFilters) => {
    const endpoint = tab === "COST" ? "/fifo/cost-analysis" : "/fifo/layers";
    const response = await apiClient.get<{
      data: FifoLayerCard[];
      meta: PaginationMeta;
    }>(endpoint, {
      params: cleanParams(filters),
    });
    return response.data;
  },
  detail: async (
    id: string,
    page = 1,
    limit = 50,
  ): Promise<FifoLayerDetail> => {
    const response = await apiClient.get<{ data: FifoLayerDetail }>(
      `/fifo/layers/${id}`,
      {
        params: { page, limit },
      },
    );
    return response.data.data;
  },
};
