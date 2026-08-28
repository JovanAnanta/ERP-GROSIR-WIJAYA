import { apiClient } from '@/lib/axios';

export interface Brand {
  brandId: string;
  brandName: string;
  isActive: boolean;
  totalProduct: number;
  updatedAt: string | null;
}

export interface BrandQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface BrandMeta {
  currentPage: number;
  pageSize: number;
  totalData: number;
  totalPage: number;
}

export interface BrandResponse {
  success: boolean;
  data: Brand[];
  meta: BrandMeta;
}

export interface CreateBrandPayload {
  brandName: string;
  forceSave?: boolean;
}

export type UpdateBrandPayload = CreateBrandPayload;

export const brandApi = {
  getAll: async (params: BrandQueryParams) => {
    const res = await apiClient.get<BrandResponse>('/brands', { params });
    return res.data;
  },
  create: async (data: CreateBrandPayload) => {
    const res = await apiClient.post<{ success: boolean; message: string }>('/brands', data);
    return res.data;
  },
  update: async (id: string, data: UpdateBrandPayload) => {
    const res = await apiClient.put<{ success: boolean; message: string }>(`/brands/${id}`, data);
    return res.data;
  },
  inactivate: async (id: string) => {
    const res = await apiClient.post<{ success: boolean; message: string }>(`/brands/${id}/inactivate`);
    return res.data;
  },
  reactivate: async (id: string) => {
    const res = await apiClient.post<{ success: boolean; message: string }>(`/brands/${id}/reactivate`);
    return res.data;
  },
};