export const PERMISSIONS = {
  DASHBOARD_VIEW: 'DASHBOARD_VIEW',

  MASTER_VIEW: 'MASTER_VIEW',
  MASTER_CREATE: 'MASTER_CREATE',
  MASTER_UPDATE: 'MASTER_UPDATE',
  MASTER_EXPORT: 'MASTER_EXPORT',

  PURCHASE_VIEW: 'PURCHASE_VIEW',
  PURCHASE_CREATE: 'PURCHASE_CREATE',
  PURCHASE_UPDATE: 'PURCHASE_UPDATE',
  PURCHASE_APPROVE: 'PURCHASE_APPROVE',
  PURCHASE_EXPORT: 'PURCHASE_EXPORT',

  SALES_VIEW: 'SALES_VIEW',
  SALES_CREATE: 'SALES_CREATE',
  SALES_UPDATE: 'SALES_UPDATE',
  SALES_APPROVE: 'SALES_APPROVE',
  SALES_EXPORT: 'SALES_EXPORT',

  PRICING_VIEW: 'PRICING_VIEW',
  PRICING_UPDATE: 'PRICING_UPDATE',
  PRICING_EXPORT: 'PRICING_EXPORT',

  INVENTORY_VIEW: 'INVENTORY_VIEW',
  INVENTORY_CREATE: 'INVENTORY_CREATE',
  INVENTORY_UPDATE: 'INVENTORY_UPDATE',
  INVENTORY_APPROVE: 'INVENTORY_APPROVE',

  FIFO_VIEW: 'FIFO_VIEW',
  FINANCIAL_VIEW: 'FINANCIAL_VIEW',
  REPORT_VIEW: 'REPORT_VIEW',
  REPORT_EXPORT: 'REPORT_EXPORT',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface PermissionDefinition {
  code: PermissionCode;
  name: string;
  module: string;
  action: 'VIEW' | 'CREATE' | 'UPDATE' | 'APPROVE' | 'EXPORT';
}

export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  {
    code: PERMISSIONS.DASHBOARD_VIEW,
    name: 'Lihat Dashboard',
    module: 'DASHBOARD',
    action: 'VIEW',
  },
  {
    code: PERMISSIONS.MASTER_VIEW,
    name: 'Lihat Master Data',
    module: 'MASTER',
    action: 'VIEW',
  },
  {
    code: PERMISSIONS.MASTER_CREATE,
    name: 'Tambah Master Data',
    module: 'MASTER',
    action: 'CREATE',
  },
  {
    code: PERMISSIONS.MASTER_UPDATE,
    name: 'Ubah dan Aktif/Nonaktif Master Data',
    module: 'MASTER',
    action: 'UPDATE',
  },
  {
    code: PERMISSIONS.MASTER_EXPORT,
    name: 'Export Master Data',
    module: 'MASTER',
    action: 'EXPORT',
  },
  {
    code: PERMISSIONS.PURCHASE_VIEW,
    name: 'Lihat Purchasing',
    module: 'PURCHASE',
    action: 'VIEW',
  },
  {
    code: PERMISSIONS.PURCHASE_CREATE,
    name: 'Buat Transaksi Purchasing',
    module: 'PURCHASE',
    action: 'CREATE',
  },
  {
    code: PERMISSIONS.PURCHASE_UPDATE,
    name: 'Ubah dan Bayar Transaksi Purchasing',
    module: 'PURCHASE',
    action: 'UPDATE',
  },
  {
    code: PERMISSIONS.PURCHASE_APPROVE,
    name: 'Proses Status dan Penyelesaian Purchasing',
    module: 'PURCHASE',
    action: 'APPROVE',
  },
  {
    code: PERMISSIONS.PURCHASE_EXPORT,
    name: 'Export Purchasing',
    module: 'PURCHASE',
    action: 'EXPORT',
  },
  {
    code: PERMISSIONS.SALES_VIEW,
    name: 'Lihat Sales dan Customer',
    module: 'SALES',
    action: 'VIEW',
  },
  {
    code: PERMISSIONS.SALES_CREATE,
    name: 'Buat Sales dan Customer',
    module: 'SALES',
    action: 'CREATE',
  },
  {
    code: PERMISSIONS.SALES_UPDATE,
    name: 'Ubah Sales dan Customer',
    module: 'SALES',
    action: 'UPDATE',
  },
  {
    code: PERMISSIONS.SALES_APPROVE,
    name: 'Approve Sales',
    module: 'SALES',
    action: 'APPROVE',
  },
  {
    code: PERMISSIONS.SALES_EXPORT,
    name: 'Export Sales',
    module: 'SALES',
    action: 'EXPORT',
  },
  {
    code: PERMISSIONS.PRICING_VIEW,
    name: 'Lihat Pricing',
    module: 'PRICING',
    action: 'VIEW',
  },
  {
    code: PERMISSIONS.PRICING_UPDATE,
    name: 'Ubah Pricing',
    module: 'PRICING',
    action: 'UPDATE',
  },
  {
    code: PERMISSIONS.PRICING_EXPORT,
    name: 'Publish dan Export Pricing',
    module: 'PRICING',
    action: 'EXPORT',
  },
  {
    code: PERMISSIONS.INVENTORY_VIEW,
    name: 'Lihat Inventory',
    module: 'INVENTORY',
    action: 'VIEW',
  },
  {
    code: PERMISSIONS.INVENTORY_CREATE,
    name: 'Buat Transaksi Inventory',
    module: 'INVENTORY',
    action: 'CREATE',
  },
  {
    code: PERMISSIONS.INVENTORY_UPDATE,
    name: 'Ubah Inventory',
    module: 'INVENTORY',
    action: 'UPDATE',
  },
  {
    code: PERMISSIONS.INVENTORY_APPROVE,
    name: 'Approve Inventory',
    module: 'INVENTORY',
    action: 'APPROVE',
  },
  {
    code: PERMISSIONS.FIFO_VIEW,
    name: 'Lihat FIFO',
    module: 'FIFO',
    action: 'VIEW',
  },
  {
    code: PERMISSIONS.FINANCIAL_VIEW,
    name: 'Lihat Financial',
    module: 'FINANCIAL',
    action: 'VIEW',
  },
  {
    code: PERMISSIONS.REPORT_VIEW,
    name: 'Lihat Report',
    module: 'REPORT',
    action: 'VIEW',
  },
  {
    code: PERMISSIONS.REPORT_EXPORT,
    name: 'Export Report',
    module: 'REPORT',
    action: 'EXPORT',
  },
] as const;

export const CONFIGURABLE_PERMISSION_CODES = new Set<string>(
  PERMISSION_CATALOG.map((permission) => permission.code),
);
