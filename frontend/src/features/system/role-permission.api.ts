import { apiClient } from '@/lib/axios';

export interface PermissionDef {
  id: string;
  code: string;
  name: string;
  module: string;
  action: string;
}

export interface AdminPermissionData {
  roleId: string;
  roleCode: string;
  allPermissions: PermissionDef[];
  activePermissionIds: string[];
}

export const rolePermissionApi = {
  getAdmin: async () => {
    const res = await apiClient.get<{ success: boolean; data: AdminPermissionData }>('/role-permissions/admin');
    return res.data;
  },
  updateAdmin: async (data: { oldPermissionIds: string[]; newPermissionIds: string[] }) => {
    const res = await apiClient.put<{ success: boolean; message: string }>('/role-permissions/admin', data);
    return res;
  },
};