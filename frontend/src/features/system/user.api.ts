import { apiClient } from '@/lib/axios';

export interface UserData {
  userId: string;
  username: string;
  fullName: string;
  roleId: string;
  isActive: boolean;
  lastLoginAt: string | null;
  updatedAt: string;
  role: { roleName: string };
}

export const userApi = {
  getAll: async () => {
    const res = await apiClient.get<{ success: boolean; data: UserData[] }>('/users');
    return res.data;
  },
  create: async (data: Record<string, string>) => {
    const res = await apiClient.post<{ success: boolean; message: string }>('/users', data);
    return res;
  },
  update: async (id: string, data: Record<string, string | boolean>) => {
    const res = await apiClient.put<{ success: boolean; message: string }>(`/users/${id}`, data);
    return res;
  },
  disable: async (id: string) => {
    const res = await apiClient.post<{ success: boolean; message: string }>(`/users/${id}/disable`);
    return res;
  },
  resetPassword: async (id: string, data: Record<string, string>) => {
    const res = await apiClient.post<{ success: boolean; message: string }>(`/users/${id}/reset-password`, data);
    return res;
  },
  forceLogout: async (id: string) => {
    const res = await apiClient.post<{ success: boolean; message: string }>(`/users/${id}/force-logout`);
    return res;
  },
  unlockSession: async (id: string) => {
    const res = await apiClient.post<{ success: boolean; message: string }>(`/users/${id}/unlock-session`);
    return res;
  },
};