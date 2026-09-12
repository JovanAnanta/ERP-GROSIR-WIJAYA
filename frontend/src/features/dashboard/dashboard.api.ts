import { apiClient } from "@/lib/axios";

export type DashboardFilters = {
  dateFrom?: string;
  dateTo?: string;
  topLimit?: number;
};

export type DashboardAccess = {
  sales: boolean;
  purchase: boolean;
  inventory: boolean;
  finance: boolean;
};

export type DashboardRange = {
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
};

export type DashboardSalesKpi = {
  invoiceCount: number;
  grossSales: number;
  discountTotal: number;
  salesReturnTotal: number;
  netSales: number;
  costOfGoodsSold: number;
  grossProfit: number;
  grossMargin: number;
  averageOrder: number;
  comparison?: {
    netSales: number | null;
    grossProfit: number | null;
    invoiceCount: number | null;
  };
};

export type DashboardAccount = {
  financialAccountId: string;
  accountName: string;
  accountType: string;
  currentBalance: number;
  isDefault: boolean;
};

export type LowStockProduct = {
  productId: string;
  productName: string;
  availableQty: number;
  minimumQty: number;
};

export type DashboardOverview = {
  range: DashboardRange;
  access: DashboardAccess;
  refreshPending: boolean;
  sales: DashboardSalesKpi | null;
  finance: null | {
    accounts: DashboardAccount[];
    totalBalance: number;
    receivable: number;
    overdueReceivable: number;
    payable: number;
    overduePayable: number;
  };
  inventory: null | {
    totalProducts: number;
    outOfStock: number;
    lowStock: number;
    inventoryValue: number;
    lowStockProducts: LowStockProduct[];
  };
  pendingDocuments: {
    salesInvoices: number;
    purchaseInvoices: number;
  };
  alerts: {
    lowStock: LowStockProduct[];
    overdueReceivables: AlertDocument[];
    overduePayables: AlertDocument[];
    latePurchaseOrders: Array<AlertDocument & { expectedDate?: string | null }>;
  };
};

export type AlertDocument = {
  id: string;
  number: string;
  partyName?: string | null;
  dueDate?: string | null;
  amount?: number;
};

export type DashboardSales = {
  range: DashboardRange;
  refreshPending: boolean;
  kpi: DashboardSalesKpi;
  trend: Array<{
    date: string;
    netSales: number;
    grossProfit: number;
    costOfGoodsSold: number;
    invoiceCount: number;
  }>;
  topProducts: Array<{
    productId: string;
    productName: string;
    categoryName?: string;
    brandName?: string | null;
    soldQuantity: number;
    bonusQuantity: number;
    returnedQuantity: number;
    netSales: number;
    costOfGoodsSold: number;
    grossProfit: number;
  }>;
  channels: Array<{
    channel: string;
    transactionCount: number;
    netSales: number;
  }>;
};

export type DashboardInventory = {
  range: DashboardRange;
  totalProducts: number;
  outOfStock: number;
  lowStock: number;
  inventoryValue: number;
  lowStockProducts: LowStockProduct[];
  movements: Array<{
    originType: string;
    direction: string;
    movementCount: number;
  }>;
};

export type DashboardFinance = {
  range: DashboardRange;
  cashFlow: Array<{
    date: string;
    cashIn: number;
    cashOut: number;
    transactionCount: number;
  }>;
  accounts: DashboardAccount[];
  profitLoss: {
    revenue: number;
    cogs: number;
    expenses: number;
    grossProfit: number;
    netProfit: number;
  };
  receivable: { outstanding: number; overdue: number };
  payable: { outstanding: number; overdue: number };
};

export type DashboardPartners = {
  range: DashboardRange;
  access: { sales: boolean; purchase: boolean };
  customers: {
    activeCount: number;
    outstanding: Array<{
      customerId: string;
      customerName: string;
      outstandingAmount: number;
      lastPaymentDate?: string | null;
    }>;
  };
  suppliers: {
    activeCount: number;
    outstanding: Array<{
      supplierId: string;
      supplierName: string;
      outstandingAmount: number;
      lastPaymentDate?: string | null;
    }>;
  };
};

const params = (filters: DashboardFilters) => ({ params: filters });

function unwrap(value: unknown): unknown {
  let current = value;
  while (
    current &&
    typeof current === "object" &&
    "success" in current &&
    "data" in current
  ) {
    current = (current as { data: unknown }).data;
  }
  return current;
}

function requireObject<T extends object>(value: unknown, label: string): T {
  const result = unwrap(value);
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`Response ${label} tidak valid.`);
  }
  return result as T;
}

export const dashboardApi = {
  async overview(filters: DashboardFilters) {
    const response = await apiClient.get<unknown, unknown>(
      "/dashboard/overview",
      params(filters),
    );
    return requireObject<DashboardOverview>(response, "ringkasan dashboard");
  },
  async sales(filters: DashboardFilters) {
    const response = await apiClient.get<unknown, unknown>(
      "/dashboard/sales",
      params(filters),
    );
    return requireObject<DashboardSales>(response, "dashboard penjualan");
  },
  async inventory(filters: DashboardFilters) {
    const response = await apiClient.get<unknown, unknown>(
      "/dashboard/inventory",
      params(filters),
    );
    return requireObject<DashboardInventory>(response, "dashboard persediaan");
  },
  async finance(filters: DashboardFilters) {
    const response = await apiClient.get<unknown, unknown>(
      "/dashboard/finance",
      params(filters),
    );
    return requireObject<DashboardFinance>(response, "dashboard keuangan");
  },
  async partners(filters: DashboardFilters) {
    const response = await apiClient.get<unknown, unknown>(
      "/dashboard/partners",
      params(filters),
    );
    return requireObject<DashboardPartners>(
      response,
      "dashboard pelanggan dan supplier",
    );
  },
};
