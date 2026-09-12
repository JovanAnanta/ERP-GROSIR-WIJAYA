import { apiClient } from "@/lib/axios";

export interface InventoryOpeningCatalogProduct {
  productId: string;
  productName: string;
  categoryName: string;
  brandName?: string | null;
  parentProductUnitId?: string | null;
  parentUnitName?: string | null;
  currentStock: number;
  hasHistory: boolean;
  units: Array<{
    productUnitId: string;
    unitName: string;
    conversionFactor: number;
    isParent: boolean;
    guestSuggestedPrice?: number | null;
  }>;
}

export interface InventoryOpeningLine {
  lineNumber: number;
  productId: string;
  selectedProductUnitId: string;
  inputQuantity: number;
  inputUnitCost: number;
  guestSuggestedPrice?: number;
}

export interface InventoryOpeningDraft {
  inventoryOpeningBalanceId: string;
  openingBalanceNumber: string;
  openingBalanceDate: string;
  status: "DRAFT" | "COMPLETED" | "CANCELLED";
  note?: string | null;
  details: Array<InventoryOpeningLine & {
    inventoryOpeningBalanceDetailId: string;
    parentProductUnitId: string;
    parentQuantity: number;
    parentUnitCost: number;
    totalCost: number;
  }>;
}

export const openingBalanceApi = {
  createCustomer: async (payload: Record<string, unknown>) =>
    (await apiClient.post("/opening-balances/customers", payload)).data,
  createSupplier: async (payload: Record<string, unknown>) =>
    (await apiClient.post("/opening-balances/suppliers", payload)).data,
  inventoryCatalog: async (params: { page: number; limit: number | "ALL"; search?: string; scope?: "ELIGIBLE" | "HISTORY" }) =>
    (await apiClient.get("/opening-balances/inventory/catalog", { params })).data as {
      data: InventoryOpeningCatalogProduct[];
      meta: { currentPage: number; pageSize: number; totalData: number; totalPage: number };
    },
  inventoryDraft: async () =>
    (await apiClient.get("/opening-balances/inventory/draft")).data.data as InventoryOpeningDraft | null,
  saveInventoryDraft: async (payload: { openingBalanceDate: string; note?: string; lines: InventoryOpeningLine[] }) =>
    (await apiClient.post("/opening-balances/inventory/draft", payload)).data.data as InventoryOpeningDraft,
  completeInventory: async (id: string) =>
    (await apiClient.post(`/opening-balances/inventory/${id}/complete`)).data,
};
