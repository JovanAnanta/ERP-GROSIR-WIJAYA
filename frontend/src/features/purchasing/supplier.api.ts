import { apiClient } from '@/lib/axios';

export interface Supplier {
  supplierId: string;
  supplierName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  picName: string | null;
  isActive: boolean;
  outstandingAp: number;
  updatedAt: string | null;
}

export interface SupplierQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';
  hasOutstandingAp?: 'YES' | 'NO' | 'ALL';
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface SupplierMeta {
  currentPage: number;
  pageSize: number;
  totalData: number;
  totalPage: number;
}

export interface SupplierResponse {
  success: boolean;
  data: Supplier[];
  meta: SupplierMeta;
}

export interface CreateSupplierPayload {
  supplierName: string;
  phone?: string;
  email?: string;
  address?: string;
  picName?: string;
  forceSave?: boolean;
}

export interface UpdateSupplierPayload extends CreateSupplierPayload {
  updatedAt: string;
}

export const supplierApi = {
  getAll: async (params: SupplierQueryParams) => {
    const res = await apiClient.get<SupplierResponse>('/suppliers', { params });
    return res.data;
  },
  create: async (data: CreateSupplierPayload) => {
    const res = await apiClient.post<{ success: boolean; message: string }>('/suppliers', data);
    return res.data;
  },
  update: async (id: string, data: UpdateSupplierPayload) => {
    const res = await apiClient.put<{ success: boolean; message: string }>(`/suppliers/${id}`, data);
    return res.data;
  },
  inactivate: async (id: string) => {
    const res = await apiClient.post<{ success: boolean; message: string }>(`/suppliers/${id}/inactivate`);
    return res.data;
  },
  reactivate: async (id: string) => {
    const res = await apiClient.post<{ success: boolean; message: string }>(`/suppliers/${id}/reactivate`);
    return res.data;
  },
};