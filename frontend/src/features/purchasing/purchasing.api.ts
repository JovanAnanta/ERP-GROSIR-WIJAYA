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
  accountType: string;
  currentBalance: number;
}

export interface PurchasePaginationMeta {
  currentPage: number;
  pageSize: number;
  totalData: number;
  totalPage: number;
}

export interface PurchaseOrderListItem {
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  supplierId: string;
  supplierName: string;
  orderDate: string;
  expectedDate?: string | null;
  status: 'DRAFT' | 'READY' | 'COMPLETED' | 'CANCELLED';
  note?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  createdBy: string;
  updatedBy?: string | null;
  createdByName: string;
  updatedByName?: string | null;
  totalItem: number;
  totalQuantity: number;
  details: PurchaseOrderDetailItem[];
}

export interface PurchaseOrderDetailItem {
  purchaseOrderDetailId: string;
  productId: string;
  productUnitId: string;
  productName: string;
  unitName: string;
  quantity: number;
  note?: string | null;
}

export interface PurchaseOrderFullDetail extends PurchaseOrderListItem {
  supplierPhone?: string | null;
  supplierEmail?: string | null;
  supplierAddress?: string | null;
  supplierPicName?: string | null;
  purchaseInvoices: Array<{
    purchaseInvoiceId: string;
    purchaseInvoiceNumber: string;
    status: 'DRAFT' | 'COMPLETED' | 'CANCELLED';
    createdAt: string;
  }>;
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
  returnSummary?: { total: number; pending: number; overdue: number };
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

export type PurchaseReturnStatus = 'DRAFT' | 'READY' | 'COMPLETED' | 'CANCELLED';
export type PurchaseReturnResolutionType = 'REPLACEMENT' | 'CURRENT_INVOICE_DEDUCTION' | 'NEXT_INVOICE_DEDUCTION' | 'CASHBACK';

export interface PurchaseReturnContextItem {
  purchaseInvoiceDetailId: string;
  originalProductUnitId: string;
  productName: string;
  purchasedQty: number;
  purchasedUnitName: string;
  returnedBaseQty: number;
  maxBaseQty: number;
  fifoBaseUnitCost: number;
  units: Array<{
    productUnitId: string;
    unitName: string;
    conversionFactor: number;
    defaultReturnUnitCost: number;
  }>;
}

export interface PurchaseReturnContext {
  purchaseInvoiceId: string;
  purchaseInvoiceNumber: string;
  supplierId: string;
  supplierName: string;
  invoiceDate: string;
  outstandingAmount: number;
  items: PurchaseReturnContextItem[];
}

export interface PurchaseReturnDetail {
  purchaseReturnId: string;
  purchaseReturnNumber: string;
  purchaseInvoiceId: string;
  purchaseInvoiceNumber?: string;
  supplierId: string;
  supplierName?: string;
  status: PurchaseReturnStatus;
  resolutionType: PurchaseReturnResolutionType;
  returnDate: string;
  expectedResolutionDate?: string | null;
  returnTotal: number;
  inventoryCostTotal: number;
  financialAccountId?: string | null;
  financialAccountName?: string | null;
  appliedPurchaseInvoiceId?: string | null;
  appliedPurchaseInvoiceNumber?: string | null;
  reason: string;
  note?: string | null;
  createdAt: string;
  details: Array<{
    purchaseReturnDetailId: string;
    purchaseInvoiceDetailId: string;
    productUnitId: string;
    productName?: string;
    unitName?: string;
    quantity: number;
    baseQuantity: number;
    unitCost: number;
    fifoUnitCost: number;
    inventoryCostSubtotal: number;
    subtotal: number;
  }>;
}

export interface SavePurchaseReturnPayload {
  purchaseInvoiceId: string;
  returnDate: string;
  expectedResolutionDate?: string;
  resolutionType: PurchaseReturnResolutionType;
  status: 'DRAFT' | 'READY';
  reason: string;
  note?: string;
  items: Array<{
    purchaseInvoiceDetailId: string;
    productUnitId: string;
    quantity: number;
    unitCost: number;
  }>;
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
  getOrders: async (tab: 'ACTIVE' | 'HISTORY', page = 1, limit = 20) => {
    const params = new URLSearchParams({
      tab,
      page: String(page),
      limit: String(limit),
    });
    const res = await apiClient.get<{
      data: PurchaseOrderListItem[];
      meta: PurchasePaginationMeta;
    }>(`/purchasing/orders?${params.toString()}`);
    return { data: res.data.data, meta: res.data.meta };
  },
  getOrderDetail: async (id: string) => {
    const res = await apiClient.get<{ data: PurchaseOrderFullDetail }>(
      `/purchasing/orders/${id}`,
    );
    return res.data.data;
  },
  getInvoices: async (supplierId: string, tab: 'ACTIVE' | 'COMPLETED', page = 1, limit = 20) => {
    const params = new URLSearchParams();
    params.append('supplierId', supplierId);
    params.append('tab', tab);
    params.append('page', String(page));
    params.append('limit', String(limit));
    const res = await apiClient.get<{
      data: PurchaseInvoiceListItem[];
      meta: PurchasePaginationMeta;
    }>(`/purchasing/list/invoices?${params.toString()}`);
    return { data: res.data.data, meta: res.data.meta };
  },
  getInvoiceDetail: async (id: string) => {
    const res = await apiClient.get<{ data: PurchaseInvoiceFullDetail }>(`/purchasing/list/invoices/${id}`);
    return res.data.data;
  },
  getPurchaseReturnContext: async (invoiceId: string) => {
    const res = await apiClient.get<{ data: PurchaseReturnContext }>(`/purchasing/invoices/${invoiceId}/return-context`);
    return res.data.data;
  },
  getInvoiceReturns: async (invoiceId: string) => {
    const res = await apiClient.get<{ data: PurchaseReturnDetail[] }>(`/purchasing/invoices/${invoiceId}/returns`);
    return res.data.data;
  },
  getPurchaseReturn: async (returnId: string) => {
    const res = await apiClient.get<{ data: PurchaseReturnDetail }>(`/purchasing/returns/${returnId}`);
    return res.data.data;
  },
  createPurchaseReturn: async (data: SavePurchaseReturnPayload) => {
    const res = await apiClient.post<{ data: PurchaseReturnDetail }>('/purchasing/returns', data);
    return res.data.data;
  },
  updatePurchaseReturn: async (returnId: string, data: SavePurchaseReturnPayload) => {
    const res = await apiClient.put<{ data: PurchaseReturnDetail }>(`/purchasing/returns/${returnId}`, data);
    return res.data.data;
  },
  markPurchaseReturnReady: async (returnId: string) => {
    const res = await apiClient.post<{ data: PurchaseReturnDetail }>(`/purchasing/returns/${returnId}/ready`);
    return res.data.data;
  },
  completePurchaseReturn: async (returnId: string, data: { financialAccountId?: string; paymentMethod?: 'CASH' | 'TRANSFER'; appliedPurchaseInvoiceId?: string }) => {
    const res = await apiClient.post<{ data: PurchaseReturnDetail }>(`/purchasing/returns/${returnId}/complete`, data);
    return res.data.data;
  },
  cancelPurchaseReturn: async (returnId: string) => {
    await apiClient.post(`/purchasing/returns/${returnId}/cancel`);
  },
  getPurchaseReturnCompletionOptions: async (returnId: string) => {
    const res = await apiClient.get<{ data: Array<{ purchaseInvoiceId: string; purchaseInvoiceNumber: string; invoiceDate: string; invoiceTotal: number }> }>(`/purchasing/returns/${returnId}/completion-options`);
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
