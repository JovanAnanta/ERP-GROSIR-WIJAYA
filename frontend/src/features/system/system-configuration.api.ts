import { apiClient } from '@/lib/axios';

export interface SystemConfigData {
  companyName: string;
  address: string;
  phone: string;
  logoBase64: string | null;
  receiptHeader1: string | null;
  receiptHeader2: string | null;
  receiptHeader3: string | null;
  receiptFooter1: string | null;
  receiptFooter2: string | null;
  receiptFooter3: string | null;
  updatedAt?: string;
  // Fixed Configurations
  currency: string;
  timezone: string;
  dateFormat: string;
  quantityDecimal: number;
  priceDecimal: number;
  language: string;
}

export const systemConfigApi = {
  get: async () => {
    const res = await apiClient.get<{ success: boolean; data: SystemConfigData }>('/system-configuration');
    return res.data;
  },
  update: async (data: Partial<SystemConfigData>) => {
    const res = await apiClient.put<{ success: boolean; message: string }>('/system-configuration', data);
    return res;
  },
};