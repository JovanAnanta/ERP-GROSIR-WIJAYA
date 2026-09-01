import { apiClient } from '@/lib/axios';

export type InventoryStatus = 'DRAFT' | 'APPROVED' | 'CANCELLED';
export interface ProductStockOption { productUnitId: string; productName: string; unitName: string; actualQty: number; availableQty: number; packedQty: number; warehouseQty: number; suggestedUnitCost: number | null; stockDisplay: string }
export interface TransformationProduct { productUnitId: string; productName: string; categoryName: string; unitName: string; actualQty: number; availableQty: number; suggestedUnitCost: number | null; canBeSource: boolean; canBeResult: boolean }
export interface TransformationPayload { transformationDate: string; note?: string; items: Array<{ sourceProductUnitId: string; sourceQuantity: number; resultProductUnitId: string; resultQuantity: number; appliedUnitCost?: number; note?: string }> }
export interface TransformationCard { transformationId: string; transformationNumber: string; transformationDate: string; note?: string | null; createdAt: string; createdByUser?: { fullName: string }; _count: { details: number } }
export interface TransformationDetail extends TransformationCard { details: Array<{ transformationDetailId: string; lineNumber: number; sourceProductUnitId: string; sourceProductName: string; sourceUnitName: string; sourceQuantity: number; resultProductUnitId: string; resultProductName: string; resultUnitName: string; resultQuantity: number; sourceCostTotal: number; suggestedUnitCost: number; appliedUnitCost: number; resultCostTotal: number; valuationVariance: number; note?: string | null }> }
export interface StockHistoryItem { productUnitId: string; productName: string; unitName: string; actualQty: number; availableQty: number; packedQty: number; warehouseQty: number; committedQty: number; minimumQty: number; minimumDisplay: string; isLowStock: boolean; actualDisplay: string; warehouseDisplay: string; packedDisplay: string; availableDisplay: string; shortageDisplay: string }
export interface StockFilterOptions { categories: Array<{ categoryId: string; categoryName: string }>; brands: Array<{ brandId: string; brandName: string }>; suppliers: SupplierOption[] }
export interface StockHistoryFilters { search?: string; categoryId?: string; brandId?: string; supplierId?: string }
export interface InventoryDateFilters { dateFrom?: string; dateTo?: string }
export interface SupplierOption { supplierId: string; supplierName: string }
export interface PaginationMeta { currentPage: number; pageSize: number; totalData: number; totalPage: number }
export interface InventoryCard { adjustmentId?: string; stockOpnameId?: string; adjustmentNumber?: string; stockOpnameNumber?: string; adjustmentDate?: string; opnameDate?: string; reason?: string; note?: string; status: InventoryStatus; sourceType?: string; supplierId?: string | null; supplier?: { supplierName: string } | null; createdAt: string; _count: { details: number }; createdByUser?: { fullName: string }; adjustment?: { adjustmentId: string; adjustmentNumber: string } | null }
export interface InventoryDetail extends InventoryCard { details: Array<Record<string, unknown> & { productUnitId: string; productName: string; unitName: string }> }
export interface AdjustmentPayload { adjustmentDate: string; reason: string; note?: string; status: 'DRAFT' | 'APPROVED'; items: Array<{ productUnitId: string; direction: 'IN' | 'OUT'; quantity: number; unitCost?: number; note?: string }> }
export interface OpnamePayload { opnameDate: string; supplierId?: string; note?: string; status: 'DRAFT' | 'APPROVED'; items: Array<{ productUnitId: string; warehouseQty: number; packedQty: number; unitCost?: number; note?: string }> }

export const inventoryApi = {
  transformationProducts: async (): Promise<TransformationProduct[]> => {
    const response = await apiClient.get<{ data: TransformationProduct[] }>('/inventory/lookups/transformation-products');
    return response.data.data;
  },
  listTransformations: async (page = 1, limit = 20, filters?: { search?: string; dateFrom?: string; dateTo?: string }): Promise<{ data: TransformationCard[]; meta: PaginationMeta }> => {
    const response = await apiClient.get<{ data: TransformationCard[]; meta: PaginationMeta }>('/inventory/transformations', {
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
    const response = await apiClient.get<{ data: TransformationDetail }>(`/inventory/transformations/${id}`);
    return response.data.data;
  },
  createTransformation: async (payload: TransformationPayload): Promise<TransformationDetail> => {
    const response = await apiClient.post<{ data: TransformationDetail }>('/inventory/transformations', payload);
    return response.data.data;
  },
  stockFilters: async (): Promise<StockFilterOptions> => {
    const response = await apiClient.get<{ data: StockFilterOptions }>('/inventory/lookups/stock-filters');
    return response.data.data;
  },
  stockHistory: async (page = 1, limit = 20, filters?: StockHistoryFilters): Promise<{ data: StockHistoryItem[]; meta: PaginationMeta }> => {
    const response = await apiClient.get<{ data: StockHistoryItem[]; meta: PaginationMeta }>('/inventory/movement-history', { params: { page, limit, ...filters } });
    return response.data;
  },
  products: async (): Promise<ProductStockOption[]> => {
    const response = await apiClient.get<{ data: ProductStockOption[] }>('/inventory/lookups/products');
    return response.data.data;
  },
  suppliers: async (): Promise<SupplierOption[]> => {
    const response = await apiClient.get<{ data: SupplierOption[] }>('/inventory/lookups/suppliers');
    return response.data.data;
  },
  supplierCatalog: async (supplierId: string): Promise<ProductStockOption[]> => {
    const response = await apiClient.get<{ data: ProductStockOption[] }>(`/inventory/lookups/supplier-catalog/${supplierId}`);
    return response.data.data;
  },
  list: async (kind: 'adjustments' | 'opnames', tab: 'ACTIVE' | 'HISTORY', page = 1, limit = 20, filters?: InventoryDateFilters): Promise<{ data: InventoryCard[]; meta: PaginationMeta }> => {
    const response = await apiClient.get<{ data: InventoryCard[]; meta: PaginationMeta }>(`/inventory/${kind}`, { params: { tab, page, limit, ...filters } });
    return { data: response.data.data, meta: response.data.meta };
  },
  detail: async (kind: 'adjustments' | 'opnames', id: string): Promise<InventoryDetail> => {
    const response = await apiClient.get<{ data: InventoryDetail }>(`/inventory/${kind}/${id}`);
    return response.data.data;
  },
  saveAdjustment: async (payload: AdjustmentPayload, id?: string): Promise<InventoryDetail> => {
    const response = await (id ? apiClient.put<{ data: InventoryDetail }>(`/inventory/adjustments/${id}`, payload) : apiClient.post<{ data: InventoryDetail }>('/inventory/adjustments', payload));
    return response.data.data;
  },
  saveOpname: async (payload: OpnamePayload, id?: string): Promise<InventoryDetail> => {
    const response = await (id ? apiClient.put<{ data: InventoryDetail }>(`/inventory/opnames/${id}`, payload) : apiClient.post<{ data: InventoryDetail }>('/inventory/opnames', payload));
    return response.data.data;
  },
  approve: async (kind: 'adjustments' | 'opnames', id: string) => apiClient.post(`/inventory/${kind}/${id}/approve`),
  cancel: async (kind: 'adjustments' | 'opnames', id: string) => apiClient.post(`/inventory/${kind}/${id}/cancel`),
  conflicts: async (id: string): Promise<Array<{ productUnitId: string; productName: string; snapshotQty: number; currentQty: number }>> => {
    const response = await apiClient.get<{ data: Array<{ productUnitId: string; productName: string; snapshotQty: number; currentQty: number }> }>(`/inventory/opnames/${id}/conflicts`);
    return response.data.data;
  },
  refreshSnapshots: async (id: string) => apiClient.post(`/inventory/opnames/${id}/refresh-snapshots`),
};
