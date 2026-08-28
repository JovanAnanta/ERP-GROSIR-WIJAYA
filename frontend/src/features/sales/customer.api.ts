import { apiClient } from '@/lib/axios';

export interface Customer {
  customerId: string;
  customerName: string;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  outstandingAr: number;
  updatedAt: string | null;
}

export interface CustomerQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';
  hasOutstandingAr?: 'YES' | 'NO' | 'ALL';
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface CustomerMeta {
  currentPage: number;
  pageSize: number;
  totalData: number;
  totalPage: number;
}

export interface CustomerResponse {
  success: boolean;
  data: Customer[];
  meta: CustomerMeta;
}

export interface CreateCustomerPayload {
  customerName: string;
  phone?: string;
  address?: string;
  forceSave?: boolean;
}

export interface UpdateCustomerPayload extends CreateCustomerPayload {
  updatedAt: string;
}

export const customerApi = {
  getAll: async (params: CustomerQueryParams) => {
    const res = await apiClient.get<CustomerResponse>('/customers', { params });
    return res.data;
  },
  create: async (data: CreateCustomerPayload) => {
    const res = await apiClient.post<{ success: boolean; message: string }>('/customers', data);
    return res.data;
  },
  update: async (id: string, data: UpdateCustomerPayload) => {
    const res = await apiClient.put<{ success: boolean; message: string }>(`/customers/${id}`, data);
    return res.data;
  },
  inactivate: async (id: string) => {
    const res = await apiClient.post<{ success: boolean; message: string }>(`/customers/${id}/inactivate`);
    return res.data;
  },
  reactivate: async (id: string) => {
    const res = await apiClient.post<{ success: boolean; message: string }>(`/customers/${id}/reactivate`);
    return res.data;
  },
};