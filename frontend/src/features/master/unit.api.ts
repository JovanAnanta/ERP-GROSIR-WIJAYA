import { apiClient } from '@/lib/axios';

export interface Unit {
  unitId: string;
  unitName: string;
  isActive: boolean;
  totalProduct: number;
  updatedAt: string | null;
}

export interface UnitQueryParams {
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface UnitResponse {
  success: boolean;
  data: Unit[];
  totalData: number;
}

export interface CreateUnitPayload {
  unitName: string;
  forceSave?: boolean;
}

export type UpdateUnitPayload = CreateUnitPayload;

export const unitApi = {
  getAll: async (params: UnitQueryParams) => {
    const res = await apiClient.get<UnitResponse>('/units', { params });
    return res.data;
  },
  create: async (data: CreateUnitPayload) => {
    const res = await apiClient.post<{ success: boolean; message: string }>('/units', data);
    return res.data;
  },
  update: async (id: string, data: UpdateUnitPayload) => {
    const res = await apiClient.put<{ success: boolean; message: string }>(`/units/${id}`, data);
    return res.data;
  },
  inactivate: async (id: string) => {
    const res = await apiClient.post<{ success: boolean; message: string }>(`/units/${id}/inactivate`);
    return res.data;
  },
  reactivate: async (id: string) => {
    const res = await apiClient.post<{ success: boolean; message: string }>(`/units/${id}/reactivate`);
    return res.data;
  },
};