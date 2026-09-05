import { apiClient } from "@/lib/axios";

export type SalesStatus = "DRAFT" | "READY" | "COMPLETED" | "CANCELLED";
export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID";
export type SalesChannel =
  "MANUAL" | "SRC" | "WHATSAPP" | "MARKETPLACE" | "LAINNYA";

export interface PaginationMeta {
  currentPage: number;
  pageSize: number;
  totalData: number;
  totalPage: number;
}

export interface SalesCustomerOption {
  customerId: string;
  customerName: string;
  phone?: string | null;
  outstandingAmount: number;
}

export interface SalesProductUnit {
  productUnitId: string;
  unitName: string;
  conversionFactor: number;
  isParent: boolean;
  availableQty: number;
  actualQty: number;
  packedQty: number;
  suggestedPrice: number;
  hasSuggestedPrice?: boolean;
  priceSource: "CUSTOMER" | "GUEST";
}

export interface SalesProductOption {
  productId: string;
  productName: string;
  units: SalesProductUnit[];
}

export interface SalesFinancialAccount {
  financialAccountId: string;
  accountName: string;
  accountType: string;
  currentBalance: number;
}

export interface WhatsappImportRow {
  sourceText: string;
  productId: string;
  productName: string;
  productUnitId: string;
  quantity: number | null;
  unitPrice: number | null;
  reviewReasons: string[];
}

export interface SalesDetailLine {
  salesOrderDetailId?: string | null;
  salesInvoiceDetailId?: string;
  productUnitId: string;
  productName: string;
  unitName: string;
  quantity: number;
  fulfilledQuantity?: number;
  remainingQuantity?: number;
  fulfilledBonusQuantity?: number;
  remainingBonusQuantity?: number;
  unitPrice: number;
  discountAmount: number;
  bonusQuantity: number;
  subtotal: number;
  note?: string | null;
  invoices?: Array<{
    salesInvoiceId: string;
    salesInvoiceNumber: string;
    status: SalesStatus;
  }>;
}

export interface SalesOrderDocument {
  salesOrderId: string;
  salesOrderNumber: string;
  customerId?: string | null;
  customerName: string;
  orderDate: string;
  status: SalesStatus;
  salesChannel: SalesChannel;
  itemDiscountTotal: number;
  discountAmount: number;
  orderTotal: number;
  note?: string | null;
  createdAt: string;
  createdByName?: string;
  details: SalesDetailLine[];
}

export interface SalesPayment {
  salesPaymentId: string;
  paymentNumber: string;
  paymentDate: string;
  paymentMethod: string;
  financialAccountId: string;
  accountName: string;
  paymentAmount: number;
  referenceNumber?: string | null;
  note?: string | null;
  createdByName: string;
  holdingStatus?: "HELD" | "APPLIED" | "REFUNDED" | "TRANSFERRED" | null;
}

export interface SalesInvoiceDocument {
  salesInvoiceId: string;
  salesInvoiceNumber: string;
  salesOrderId?: string | null;
  salesOrderNumber?: string | null;
  customerId?: string | null;
  customerName: string;
  partyType: "CUSTOMER" | "GUEST";
  salesChannel: SalesChannel;
  paymentType: "CASH" | "CREDIT";
  invoiceDate: string;
  dueDate?: string | null;
  invoiceTotal: number;
  itemDiscountTotal: number;
  discountAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  statusPayment: PaymentStatus;
  status: SalesStatus;
  note?: string | null;
  createdAt: string;
  createdByName?: string;
  details?: SalesDetailLine[];
  payments?: SalesPayment[];
}

export interface CustomerOutstandingSummary {
  customerId: string;
  customerName: string;
  phone?: string | null;
  outstandingAmount: number;
  lastPaymentDate?: string | null;
  unpaidInvoiceCount: number;
  oldestDueDate?: string | null;
}

export interface SalesReturnContext {
  salesInvoiceId: string;
  salesInvoiceNumber: string;
  customerName: string;
  customerId?: string | null;
  partyType: "CUSTOMER" | "GUEST";
  outstandingAmount: number;
  returns: Array<{
    salesReturnId: string;
    salesReturnNumber: string;
    status: "DRAFT" | "COMPLETED" | "CANCELLED";
    resolutionType: "REFUND" | "REPLACEMENT";
    returnDate: string;
    returnTotal: number;
  }>;
  details: Array<{
    salesInvoiceDetailId: string;
    productName: string;
    unitName: string;
    soldQuantity: number;
    soldBonusQuantity: number;
    returnableQuantity: number;
    returnableBonusQuantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
}

export interface SalesReturnPayload {
  returnDate: string;
  status: "DRAFT" | "COMPLETED";
  resolutionType: "REFUND" | "REPLACEMENT";
  financialAccountId?: string;
  refundPaymentMethod?: string;
  note?: string;
  items: Array<{ salesInvoiceDetailId: string; quantity: number; bonusQuantity: number; reason?: string; note?: string }>;
  replacementInvoice?: SalesInvoicePayload;
}

export interface SalesItemPayload {
  productUnitId: string;
  salesOrderDetailId?: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  bonusQuantity: number;
  note?: string;
}

export interface SalesPaymentPayload {
  financialAccountId: string;
  paymentAmount: number;
  paymentMethod: string;
  otherPaymentMethod?: string;
  paymentDate: string;
  referenceNumber?: string;
  note?: string;
}

export interface ProcessSalesInvoicePayload {
  targetStatus?: "DRAFT" | "READY" | "COMPLETED";
  dueDate?: string;
  payment?: SalesPaymentPayload;
}

export interface SalesOrderPayload {
  customerId?: string;
  customerName?: string;
  orderDate: string;
  status: "DRAFT" | "READY";
  salesChannel: SalesChannel;
  discountAmount: number;
  note?: string;
  items: SalesItemPayload[];
}

export interface SalesInvoicePayload {
  salesOrderId?: string;
  customerId?: string;
  partyType: "CUSTOMER" | "GUEST";
  customerName?: string;
  salesChannel: SalesChannel;
  paymentType: "CASH" | "CREDIT";
  invoiceDate: string;
  dueDate?: string;
  discountAmount: number;
  status: "DRAFT" | "READY" | "COMPLETED";
  snapshotMode: "MERGE" | "REWRITE" | "IGNORE";
  note?: string;
  items: SalesItemPayload[];
  orderItems?: SalesItemPayload[];
  payments?: SalesPaymentPayload[];
}

type ListResponse<T> = { data: T[]; meta: PaginationMeta };
type ControllerResponse<T> = { success: boolean; data: T };
type WrappedResponse<T> = { success: boolean; data: ControllerResponse<T> };
type WrappedListResponse<T> = {
  success: boolean;
  data: { success: boolean; data: T[]; meta: PaginationMeta };
};

function requireArray<T>(value: unknown, context: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`Response ${context} tidak valid.`);
  }
  return value as T[];
}

export const salesApi = {
  importWhatsapp: async (text: string, customerId?: string) =>
    (
      await apiClient.post<never, { data: { rows: WhatsappImportRow[] } }>(
        "/sales/import/whatsapp",
        { text, customerId },
      )
    ).data,
  customers: async () =>
    requireArray<SalesCustomerOption>(
      (
        await apiClient.get<unknown, WrappedResponse<SalesCustomerOption[]>>(
          "/sales/lookups/customers",
        )
      ).data.data,
      "customer Sales",
    ),
  products: async (customerId?: string) =>
    requireArray<SalesProductOption>(
      (
        await apiClient.get<unknown, WrappedResponse<SalesProductOption[]>>(
          "/sales/lookups/products",
          { params: customerId ? { customerId } : undefined },
        )
      ).data.data,
      "produk Sales",
    ),
  accounts: async () =>
    requireArray<SalesFinancialAccount>(
      (
        await apiClient.get<unknown, WrappedResponse<SalesFinancialAccount[]>>(
          "/sales/lookups/financial-accounts",
        )
      ).data.data,
      "akun keuangan Sales",
    ),
  readyOrders: async () =>
    requireArray<SalesOrderDocument>(
      (
        await apiClient.get<unknown, WrappedResponse<SalesOrderDocument[]>>(
          "/sales/lookups/orders",
        )
      ).data.data,
      "Sales Order siap konversi",
    ),
  listOrders: async (
    tab: "ACTIVE" | "HISTORY",
    page: number,
    limit: number,
    search: string,
  ) => {
    const response = await apiClient.get<
      unknown,
      WrappedListResponse<SalesOrderDocument>
    >("/sales/orders", {
      params: { tab, page, limit, search: search || undefined },
    });
    return {
      data: requireArray<SalesOrderDocument>(
        response.data.data,
        "daftar Sales Order",
      ),
      meta: response.data.meta,
    } satisfies ListResponse<SalesOrderDocument>;
  },
  listInvoices: async (
    tab: "ACTIVE" | "HISTORY",
    page: number,
    limit: number,
    search: string,
  ) => {
    const response = await apiClient.get<
      unknown,
      WrappedListResponse<SalesInvoiceDocument>
    >("/sales/invoices", {
      params: { tab, page, limit, search: search || undefined },
    });
    return {
      data: requireArray<SalesInvoiceDocument>(
        response.data.data,
        "daftar Sales Invoice",
      ),
      meta: response.data.meta,
    } satisfies ListResponse<SalesInvoiceDocument>;
  },
  order: async (id: string) =>
    (
      await apiClient.get<unknown, WrappedResponse<SalesOrderDocument>>(
        `/sales/orders/${id}`,
      )
    ).data.data,
  invoice: async (id: string) =>
    (
      await apiClient.get<unknown, WrappedResponse<SalesInvoiceDocument>>(
        `/sales/invoices/${id}`,
      )
    ).data.data,
  createOrder: async (payload: SalesOrderPayload) =>
    apiClient.post("/sales/orders", payload),
  updateOrder: async (id: string, payload: SalesOrderPayload) =>
    apiClient.put(`/sales/orders/${id}`, payload),
  cancelOrder: async (id: string) =>
    apiClient.post(`/sales/orders/${id}/cancel`),
  createInvoice: async (payload: SalesInvoicePayload) =>
    apiClient.post("/sales/invoices", payload),
  updateInvoice: async (id: string, payload: SalesInvoicePayload) =>
    apiClient.put(`/sales/invoices/${id}`, payload),
  completeInvoice: async (id: string) =>
    apiClient.post(`/sales/invoices/${id}/complete`),
  changeInvoiceStatus: async (
    id: string,
    targetStatus: "DRAFT" | "READY" | "COMPLETED",
    dueDate?: string,
  ) =>
    apiClient.post(`/sales/invoices/${id}/status`, {
      targetStatus,
      dueDate,
    }),
  processInvoice: async (id: string, payload: ProcessSalesInvoicePayload) =>
    apiClient.post(`/sales/invoices/${id}/process`, payload),
  cancelInvoice: async (id: string) =>
    apiClient.post(`/sales/invoices/${id}/cancel`),
  receivePayment: async (id: string, payload: SalesPaymentPayload) =>
    apiClient.post(`/sales/invoices/${id}/payments`, payload),
  customerOutstanding: async (page: number, limit: number, search: string) => {
    const response = await apiClient.get<unknown, { data: CustomerOutstandingSummary[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(
      "/sales/customer-financial",
      { params: { page, limit, search: search || undefined } },
    );
    const envelope = response as unknown as {
      data?: CustomerOutstandingSummary[] | { data?: CustomerOutstandingSummary[]; meta?: { page: number; limit: number; total: number; totalPages: number } };
      meta?: { page: number; limit: number; total: number; totalPages: number };
    };
    const nested = !Array.isArray(envelope.data) ? envelope.data : undefined;
    return {
      data: Array.isArray(envelope.data) ? envelope.data : (nested?.data ?? []),
      meta: envelope.meta ?? nested?.meta ?? { page, limit, total: 0, totalPages: 1 },
    };
  },
  customerOutstandingInvoices: async (customerId: string) => {
    const response = await apiClient.get<unknown, unknown>(
      `/sales/customer-financial/${customerId}/invoices`,
    );
    // Depending on whether the global response wrapper is enabled, the same
    // endpoint can arrive as data, data.data, or as the payload itself.
    let payload: unknown = response;
    for (let depth = 0; depth < 3; depth += 1) {
      if (
        payload &&
        typeof payload === "object" &&
        "customer" in payload &&
        "invoices" in payload
      ) break;
      if (payload && typeof payload === "object" && "data" in payload) {
        payload = (payload as { data?: unknown }).data;
      }
    }
    const detail = payload as {
      customer?: CustomerOutstandingSummary;
      invoices?: SalesInvoiceDocument[];
    } | null;
    if (!detail?.customer || !Array.isArray(detail.invoices)) {
      throw new Error("Response detail piutang customer tidak valid.");
    }
    return { customer: detail.customer, invoices: detail.invoices };
  },
  returnContext: async (invoiceId: string) =>
    (
      await apiClient.get<unknown, WrappedResponse<SalesReturnContext>>(
        `/sales/invoices/${invoiceId}/return-context`,
      )
    ).data.data,
  createReturn: async (invoiceId: string, payload: SalesReturnPayload) =>
    apiClient.post<unknown, { success: boolean; message: string; data: { salesReturnId: string; salesReturnNumber: string } }>(`/sales/invoices/${invoiceId}/returns`, payload),
};
