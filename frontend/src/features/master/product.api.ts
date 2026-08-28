import { apiClient } from '@/lib/axios';

export interface ProductUnit {
  productUnitId?: string;
  unitId?: string;
  unitName: string;
  conversionFactor: number;
  displayOrder: number;
  isParent: boolean;
  isActive: boolean;
}

export interface Product {
  productId: string;
  productName: string;
  categoryName: string;
  brandName: string | null;
  isActive: boolean;
  minimumInventoryQty: number;
  units: ProductUnit[];
  updatedAt: string | null;
}

export interface ProductQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';
  categoryId?: string;
  brandId?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface ProductMeta {
  currentPage: number;
  pageSize: number;
  totalData: number;
  totalPage: number;
}

export interface ProductResponse {
  success: boolean;
  data: Product[];
  meta: ProductMeta;
}

// Menyesuaikan dengan DTO Backend yang cerdas
export interface ProductUnitPayload {
  unitId?: string;
  newUnitName?: string;
  conversionFactor: number;
  displayOrder: number;
  isParent: boolean;
  isActive: boolean;
}

export interface CreateProductPayload {
  productName: string;
  categoryId?: string;
  newCategoryName?: string;
  brandId?: string;
  newBrandName?: string;
  minimumInventoryQty: number;
  units: ProductUnitPayload[];
}

export interface UpdateProductPayload {
  productName: string;
  categoryId?: string;
  newCategoryName?: string;
  brandId?: string;
  newBrandName?: string;
  minimumInventoryQty: number;
}

export interface ProductLookupOptions {
  categories: string[];
  brands: string[];
}

export interface ImportUnitPayload {
  unitName: string;
  conversionFactor: number;
  isParent: boolean;
}

export interface ImportProductItemPayload {
  productName: string;
  categoryName: string;
  brandName?: string;
  minimumInventoryQty: number;
  units: ImportUnitPayload[];
}

export interface ImportProductsPayload {
  products: ImportProductItemPayload[];
}

export const productApi = {
  getAll: async (params: ProductQueryParams) => {
    const res = await apiClient.get<ProductResponse>('/products', { params });
    return res.data;
  },
  
  getLookupOptions: async () => {
    const res = await apiClient.get<{ success: boolean; data: ProductLookupOptions }>('/products/options/lookup');
    return res.data.data;
  },

  create: async (data: CreateProductPayload) => {
    const res = await apiClient.post<{ success: boolean; message: string; data: { productId: string } }>('/products', data);
    return res.data;
  },
  update: async (id: string, data: UpdateProductPayload) => {
    const res = await apiClient.put<{ success: boolean; message: string }>(`/products/${id}`, data);
    return res.data;
  },
  inactivate: async (id: string) => {
    const res = await apiClient.post<{ success: boolean; message: string }>(`/products/${id}/inactivate`);
    return res.data;
  },
  reactivate: async (id: string) => {
    const res = await apiClient.post<{ success: boolean; message: string }>(`/products/${id}/reactivate`);
    return res.data;
  },
  massImport: async (data: ImportProductsPayload) => {
    const res = await apiClient.post<{ success: boolean; message: string; data: { createdCount: number; updatedCount: number } }>('/products/import', data);
    return res.data;
  }
};