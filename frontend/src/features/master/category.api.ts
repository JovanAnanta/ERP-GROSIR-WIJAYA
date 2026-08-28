import { apiClient } from '@/lib/axios';

export interface Category {
  categoryId: string;
  categoryName: string;
  isActive: boolean;
  totalProduct: number;
  updatedAt: string | null;
}

export interface CategoryQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface CategoryMeta {
  currentPage: number;
  pageSize: number;
  totalData: number;
  totalPage: number;
}

export interface CategoryResponse {
  success: boolean;
  data: Category[];
  meta: CategoryMeta;
}

export interface CreateCategoryPayload {
  categoryName: string;
  forceSave?: boolean;
}

// PERBAIKAN LINTER: Gunakan "type" alias, bukan "interface" kosong
export type UpdateCategoryPayload = CreateCategoryPayload;

export const categoryApi = {
  getAll: async (params: CategoryQueryParams) => {
    const res = await apiClient.get<CategoryResponse>('/categories', { params });
    return res.data;
  },
  create: async (data: CreateCategoryPayload) => {
    const res = await apiClient.post<{ success: boolean; message: string }>('/categories', data);
    return res.data;
  },
  update: async (id: string, data: UpdateCategoryPayload) => {
    const res = await apiClient.put<{ success: boolean; message: string }>(`/categories/${id}`, data);
    return res.data;
  },
  inactivate: async (id: string) => {
    const res = await apiClient.post<{ success: boolean; message: string }>(`/categories/${id}/inactivate`);
    return res.data;
  },
  reactivate: async (id: string) => {
    const res = await apiClient.post<{ success: boolean; message: string }>(`/categories/${id}/reactivate`);
    return res.data;
  },
};