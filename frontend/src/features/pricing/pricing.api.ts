import { apiClient } from '@/lib/axios';

export interface PriceData {
  productUnitId: string;
  productName: string;
  categoryName: string;
  brandName: string | null;
  unitName: string;
  suggestedPrice?: number; 
  suggestedCost?: number;  
  updatedAt: string | null;
}

export interface PriceQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  brandId?: string;
}

export interface PriceMeta {
  currentPage: number;
  pageSize: number;
  totalData: number;
  totalPage: number;
}

export interface PriceResponse {
  success: boolean;
  data: PriceData[];
  meta: PriceMeta;
}

export interface UpdatePriceItem {
  productUnitId: string;
  price: number;
}

export interface UpdatePricePayload {
  updates: UpdatePriceItem[];
}

export interface CustomerDropdownOption {
  customerId: string;
  customerName: string;
}

export interface SupplierDropdownOption {
  supplierId: string;
  supplierName: string;
}

// =======================================================
// INTERFACE: Brochure Engine
// =======================================================
export interface BrochureUnit {
  unitName: string;
  price: number;
}

export interface BrochureProduct {
  productId: string;
  productName: string;
  categoryName: string;
  brandName: string | null;
  units: BrochureUnit[];
}

export interface StoreInfo {
  companyName: string;
  address: string;
  phone: string;
  logoBase64: string | null;
}

export interface BrochureResponseData {
  storeInfo: StoreInfo | null;
  brochure: {
    rokok: BrochureProduct[];
    minuman: BrochureProduct[];
    acak: BrochureProduct[];
    bulkRepack: BrochureProduct[];
  };
}

// =======================================================
// API CLIENT
// =======================================================
export const pricingApi = {
  getGuestPrices: async (params: PriceQueryParams) => {
    const res = await apiClient.get<PriceResponse>('/pricing/guest', { params });
    return res.data;
  },
  updateGuestPrices: async (data: UpdatePricePayload) => {
    const res = await apiClient.put<{ success: boolean; message: string }>('/pricing/guest', data);
    return res.data;
  },

  getCustomers: async () => {
    const res = await apiClient.get<{ data: CustomerDropdownOption[] }>('/customers', { params: { limit: 1000, status: 'ACTIVE' } });
    return res.data.data;
  },
  getSuppliers: async () => {
    const res = await apiClient.get<{ data: SupplierDropdownOption[] }>('/suppliers', { params: { limit: 1000, status: 'ACTIVE' } });
    return res.data.data;
  },

  getBrochureData: async () => {
    const res = await apiClient.get<{ success: boolean; data: BrochureResponseData }>('/pricing/brochure');
    return res.data.data;
  }
};
