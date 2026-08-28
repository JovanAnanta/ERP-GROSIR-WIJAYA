import { apiClient } from '@/lib/axios';

export interface PurchaseOrderItemPayload {
  productUnitId: string;
  quantity: number;
  note?: string;
}

export interface CreatePurchaseOrderPayload {
  supplierId: string;
  expectedDate?: string;
  note?: string;
  status: 'DRAFT' | 'READY';
  items: PurchaseOrderItemPayload[]; 
}

export interface PurchaseInvoiceItemPayload {
  productUnitId: string;
  purchasedQty: number;
  price: number;
  note?: string;
}

export interface PurchasePaymentPayload {
  financialAccountId: string;
  paymentAmount: number;
  paymentMethod: 'CASH' | 'TRANSFER';
  referenceNumber?: string;
}

export interface CreatePurchaseInvoicePayload {
  supplierId: string;
  purchaseOrderId?: string;
  invoiceDate: string;
  dueDate?: string;
  invoiceTotal: number;
  discountAmount: number;
  note?: string;
  status: 'DRAFT' | 'COMPLETED';
  priceHistoryAction: 'MERGE' | 'REWRITE' | 'IGNORE';
  items: PurchaseInvoiceItemPayload[];
  payments?: PurchasePaymentPayload[];
}

// =========================================================================
// EXPORTED INTERFACES (SUPPLIER, PO, PI, & FINANCIAL LOOKUPS)
// =========================================================================
export interface SupplierDropdownOption {
  supplierId: string;
  supplierName: string;
}

export interface SupplierProductOption {
  productId: string;
  productUnitId: string;
  productName: string;
  unitName: string;
  suggestedCost: number; 
}

export interface SupplierCatalogItem {
  productId: string;
  productName: string;
  units: {
    productUnitId: string;
    unitName: string;
  }[];
}

export interface ProductLookupOption {
  productId: string;
  productName: string;
  units: {
    productUnitId: string;
    unitName: string;
    availableQty: number;
  }[];
}

export interface ReadyPOItemOption {
  productId: string;
  productUnitId: string;
  productName: string;
  unitName: string;
  quantity: number;
}

export interface ReadyPOOption {
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  supplierId: string;
  supplierName: string;
  items: ReadyPOItemOption[];
}

export interface FinancialAccountOption {
  financialAccountId: string;
  accountName: string;
  currentBalance: number;
}

// DASHBOARD LIST & SUMMARY INTERFACES
export interface SupplierFinancialSummaryCard {
  supplierId: string;
  supplierName: string;
  outstandingAmount: number;
  overdueAmount: number;
  lastPaymentDate?: string;
  activeInvoiceCount: number;
}

export interface PurchaseInvoiceListItem {
  purchaseInvoiceId: string;
  purchaseInvoiceNumber: string;
  purchaseOrderId?: string;
  supplierId: string;
  supplierName: string;
  invoiceDate: string;
  dueDate?: string;
  invoiceTotal: number;
  paidAmount: number;
  outstandingAmount: number;
  statusPayment: 'PAID' | 'PARTIAL' | 'UNPAID';
  status: 'DRAFT' | 'COMPLETED' | 'CANCELLED';
  note?: string;
  createdAt: string;
}

export interface PurchaseInvoiceDetailItem {
  purchaseInvoiceDetailId: string;
  productUnitId: string;
  productName: string;
  unitName: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
  note?: string;
}

export interface PurchaseInvoiceDetailPayment {
  purchasePaymentId: string;
  accountName: string;
  paymentAmount: number;
  paymentMethod: 'CASH' | 'TRANSFER';
  paymentDate: string;
  referenceNumber?: string;
  note?: string;
}

export interface PurchaseInvoiceFullDetail extends PurchaseInvoiceListItem {
  purchaseOrderNumber?: string;
  discountAmount: number;
  details: PurchaseInvoiceDetailItem[];
  payments: PurchaseInvoiceDetailPayment[];
}

export interface AddPaymentPayload {
  financialAccountId: string;
  paymentAmount: number;
  paymentMethod: 'CASH' | 'TRANSFER';
  paymentDate: string;
  referenceNumber?: string;
  note?: string;
}

export const purchasingApi = {
  createOrder: async (data: CreatePurchaseOrderPayload) => {
    const res = await apiClient.post<{ success: boolean; message: string }>('/purchasing/orders', data);
    return res.data;
  },
  updateOrder: async (poId: string, data: CreatePurchaseOrderPayload) => {
    const res = await apiClient.put<{ success: boolean; message: string }>(`/purchasing/orders/${poId}`, data);
    return res.data;
  },
  createInvoice: async (data: CreatePurchaseInvoicePayload) => {
    const res = await apiClient.post<{ success: boolean; message: string }>('/purchasing/invoices', data);
    return res.data;
  },
  updateInvoice: async (invoiceId: string, data: CreatePurchaseInvoicePayload) => {
    const res = await apiClient.put<{ success: boolean; message: string }>(`/purchasing/invoices/${invoiceId}`, data);
    return res.data;
  },
  addInvoicePayment: async (invoiceId: string, data: AddPaymentPayload) => {
    const res = await apiClient.post<{ success: boolean; message: string }>(`/purchasing/invoices/${invoiceId}/payments`, data);
    return res.data;
  },

  // LIST & DASHBOARD
  getSupplierSummaries: async () => {
    const res = await apiClient.get<{ data: SupplierFinancialSummaryCard[] }>('/purchasing/list/supplier-summaries');
    return res.data.data;
  },
  getInvoices: async (supplierId?: string, tab?: 'ACTIVE' | 'COMPLETED') => {
    const params = new URLSearchParams();
    if (supplierId) params.append('supplierId', supplierId);
    if (tab) params.append('tab', tab);
    const res = await apiClient.get<{ data: PurchaseInvoiceListItem[] }>(`/purchasing/list/invoices?${params.toString()}`);
    return res.data.data;
  },
  getInvoiceDetail: async (id: string) => {
    const res = await apiClient.get<{ data: PurchaseInvoiceFullDetail }>(`/purchasing/list/invoices/${id}`);
    return res.data.data;
  },

  // LOOKUPS
  getSuppliers: async () => {
    const res = await apiClient.get<{ data: SupplierDropdownOption[] }>('/purchasing/lookups/suppliers'); 
    return res.data.data;
  },
  getProducts: async () => {
    const res = await apiClient.get<{ data: ProductLookupOption[] }>('/purchasing/lookups/products'); 
    return res.data.data;
  },
  getSupplierCatalog: async (supplierId: string) => {
    const res = await apiClient.get<{ data: SupplierCatalogItem[] }>(`/purchasing/lookups/supplier-catalog/${supplierId}`);
    return res.data.data;
  },
  getSupplierHistory: async (supplierId: string) => {
    const res = await apiClient.get<{ data: SupplierProductOption[] }>(`/purchasing/lookups/supplier-history/${supplierId}`);
    return res.data.data;
  },
  getReadyOrders: async () => {
    const res = await apiClient.get<{ data: ReadyPOOption[] }>(`/purchasing/lookups/ready-orders`);
    return res.data.data;
  },
  getFinancialAccounts: async () => {
    const res = await apiClient.get<{ data: FinancialAccountOption[] }>('/purchasing/lookups/financial-accounts');
    return res.data.data;
  }
};