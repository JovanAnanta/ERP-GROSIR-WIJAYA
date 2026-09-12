import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PERMISSIONS } from '../../common/authorization/permission-catalog.js';
import { PrismaService } from '../../database/prisma.service.js';
import { DashboardRangeQueryDto } from './dto/dashboard.dto.js';

const DAY_MS = 86_400_000;
const ZERO = new Prisma.Decimal(0);

type Range = { from: Date; to: Date; previousFrom: Date; previousTo: Date };
type UserContext = {
  roleId: bigint;
  role: { roleCode: string };
};

type LowStockRow = {
  productId: bigint;
  productName: string;
  availableQty: Prisma.Decimal;
  minimumQty: Prisma.Decimal;
};
type OutstandingRow = {
  outstanding: Prisma.Decimal;
  overdue: Prisma.Decimal;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private range(query: DashboardRangeQueryDto): Range {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const to = query.dateTo ? new Date(`${query.dateTo}T00:00:00`) : today;
    const from = query.dateFrom
      ? new Date(`${query.dateFrom}T00:00:00`)
      : new Date(to.getTime() - 29 * DAY_MS);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to)
      throw new HttpException(
        'Rentang tanggal dashboard tidak valid.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const days = Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
    if (days > 1827)
      throw new HttpException(
        'Rentang dashboard maksimal lima tahun.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const previousTo = new Date(from.getTime() - DAY_MS);
    const previousFrom = new Date(previousTo.getTime() - (days - 1) * DAY_MS);
    return { from, to, previousFrom, previousTo };
  }

  private async refresh(from: Date, to: Date) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('DASHBOARD_SUMMARY_REFRESH'))`;
      const dirty = await tx.dashboardDirtyDate.findMany({
        where: { summaryDate: { gte: from, lte: to } },
        orderBy: { summaryDate: 'asc' },
        take: 120,
        select: { summaryDate: true },
      });
      for (const item of dirty)
        await tx.$executeRaw`SELECT dashboard_refresh_date(${item.summaryDate}::date)`;
      return dirty.length === 120;
    });
  }

  private async access(user: UserContext) {
    const full = ['SUPER_OWNER', 'OWNER'].includes(user.role.roleCode);
    if (full)
      return { sales: true, purchase: true, inventory: true, finance: true };
    const rows = await this.prisma.rolePermission.findMany({
      where: {
        roleId: user.roleId,
        permission: {
          permissionCode: {
            in: [
              PERMISSIONS.SALES_VIEW,
              PERMISSIONS.PURCHASE_VIEW,
              PERMISSIONS.INVENTORY_VIEW,
              PERMISSIONS.FINANCIAL_VIEW,
            ],
          },
          isActive: true,
        },
      },
      select: { permission: { select: { permissionCode: true } } },
    });
    const codes = new Set(rows.map((row) => row.permission.permissionCode));
    return {
      sales: codes.has(PERMISSIONS.SALES_VIEW),
      purchase: codes.has(PERMISSIONS.PURCHASE_VIEW),
      inventory: codes.has(PERMISSIONS.INVENTORY_VIEW),
      finance: codes.has(PERMISSIONS.FINANCIAL_VIEW),
    };
  }

  private async salesKpi(from: Date, to: Date) {
    const aggregate = await this.prisma.dashboardDailySummary.aggregate({
      where: { summaryDate: { gte: from, lte: to } },
      _sum: {
        invoiceCount: true,
        grossSales: true,
        discountTotal: true,
        salesReturnTotal: true,
        netSales: true,
        costOfGoodsSold: true,
        grossProfit: true,
      },
    });
    const sum = aggregate._sum;
    const invoiceCount = sum.invoiceCount ?? 0;
    const netSales = sum.netSales ?? ZERO;
    const grossProfit = sum.grossProfit ?? ZERO;
    return {
      invoiceCount,
      grossSales: Number(sum.grossSales ?? ZERO),
      discountTotal: Number(sum.discountTotal ?? ZERO),
      salesReturnTotal: Number(sum.salesReturnTotal ?? ZERO),
      netSales: Number(netSales),
      costOfGoodsSold: Number(sum.costOfGoodsSold ?? ZERO),
      grossProfit: Number(grossProfit),
      grossMargin: netSales.equals(0)
        ? 0
        : Number(grossProfit.div(netSales).mul(100).toDecimalPlaces(2)),
      averageOrder: invoiceCount ? Number(netSales.div(invoiceCount)) : 0,
    };
  }

  private change(current: number, previous: number) {
    if (previous === 0) return current === 0 ? 0 : null;
    return Number(
      (((current - previous) / Math.abs(previous)) * 100).toFixed(2),
    );
  }

  private async outstandingSnapshot(type: 'CUSTOMER' | 'SUPPLIER') {
    const table =
      type === 'CUSTOMER'
        ? Prisma.raw('sales_invoice')
        : Prisma.raw('purchase_invoice');
    return this.prisma.$queryRaw<OutstandingRow[]>(Prisma.sql`
      SELECT
        COALESCE(SUM(outstanding_amount), 0) AS outstanding,
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN outstanding_amount ELSE 0 END), 0) AS overdue
      FROM ${table}
      WHERE status = 'COMPLETED' AND outstanding_amount > 0
    `);
  }

  async overview(user: UserContext, query: DashboardRangeQueryDto) {
    const range = this.range(query);
    const permissions = await this.access(user);
    const pending = permissions.sales
      ? await this.refresh(range.previousFrom, range.to)
      : false;
    const [
      currentSales,
      previousSales,
      accounts,
      receivable,
      payable,
      stock,
      pendingSalesInvoices,
      pendingPurchaseInvoices,
    ] = await Promise.all([
      permissions.sales ? this.salesKpi(range.from, range.to) : null,
      permissions.sales
        ? this.salesKpi(range.previousFrom, range.previousTo)
        : null,
      permissions.finance
        ? this.prisma.financialAccount.findMany({
            where: { isActive: true },
            orderBy: [{ accountType: 'asc' }, { accountName: 'asc' }],
            select: {
              financialAccountId: true,
              accountName: true,
              accountType: true,
              currentBalance: true,
              isDefault: true,
            },
          })
        : [],
      permissions.finance ? this.outstandingSnapshot('CUSTOMER') : null,
      permissions.finance ? this.outstandingSnapshot('SUPPLIER') : null,
      permissions.inventory ? this.stockSnapshot(5) : null,
      permissions.sales
        ? this.prisma.salesInvoice.count({
            where: { status: { in: ['DRAFT', 'READY'] } },
          })
        : 0,
      permissions.purchase
        ? this.prisma.purchaseInvoice.count({
            where: { status: 'DRAFT' },
          })
        : 0,
    ]);
    return {
      range,
      access: permissions,
      refreshPending: pending,
      sales:
        currentSales && previousSales
          ? {
              ...currentSales,
              comparison: {
                netSales: this.change(
                  currentSales.netSales,
                  previousSales.netSales,
                ),
                grossProfit: this.change(
                  currentSales.grossProfit,
                  previousSales.grossProfit,
                ),
                invoiceCount: this.change(
                  currentSales.invoiceCount,
                  previousSales.invoiceCount,
                ),
              },
            }
          : null,
      finance: permissions.finance
        ? {
            accounts: accounts.map((account) => ({
              ...account,
              financialAccountId: account.financialAccountId.toString(),
              currentBalance: Number(account.currentBalance),
            })),
            totalBalance: accounts.reduce(
              (total, account) => total + Number(account.currentBalance),
              0,
            ),
            receivable: Number(receivable?.[0]?.outstanding ?? ZERO),
            overdueReceivable: Number(receivable?.[0]?.overdue ?? ZERO),
            payable: Number(payable?.[0]?.outstanding ?? ZERO),
            overduePayable: Number(payable?.[0]?.overdue ?? ZERO),
          }
        : null,
      inventory: stock,
      pendingDocuments: {
        salesInvoices: pendingSalesInvoices,
        purchaseInvoices: pendingPurchaseInvoices,
      },
      alerts: await this.alerts(permissions),
    };
  }

  async sales(query: DashboardRangeQueryDto) {
    const range = this.range(query);
    const refreshPending = await this.refresh(range.from, range.to);
    const [trend, grouped, channels] = await Promise.all([
      this.prisma.dashboardDailySummary.findMany({
        where: { summaryDate: { gte: range.from, lte: range.to } },
        orderBy: { summaryDate: 'asc' },
      }),
      this.prisma.dashboardProductDailySummary.groupBy({
        by: ['productId'],
        where: { summaryDate: { gte: range.from, lte: range.to } },
        _sum: {
          soldQuantity: true,
          bonusQuantity: true,
          returnedQuantity: true,
          netSales: true,
          costOfGoodsSold: true,
          grossProfit: true,
        },
        orderBy: { _sum: { netSales: 'desc' } },
        take: query.topLimit,
      }),
      this.prisma.salesInvoice.groupBy({
        by: ['salesChannel'],
        where: {
          status: 'COMPLETED',
          invoiceDate: { gte: range.from, lte: range.to },
        },
        _count: { _all: true },
        _sum: { invoiceTotal: true },
      }),
    ]);
    const products = await this.prisma.product.findMany({
      where: { productId: { in: grouped.map((row) => row.productId) } },
      select: {
        productId: true,
        productName: true,
        category: { select: { categoryName: true } },
        brand: { select: { brandName: true } },
      },
    });
    const productMap = new Map(products.map((item) => [item.productId, item]));
    return {
      range,
      refreshPending,
      kpi: await this.salesKpi(range.from, range.to),
      trend: trend.map((row) => ({
        date: row.summaryDate,
        netSales: Number(row.netSales),
        grossProfit: Number(row.grossProfit),
        costOfGoodsSold: Number(row.costOfGoodsSold),
        invoiceCount: row.invoiceCount,
      })),
      topProducts: grouped.map((row) => ({
        productId: row.productId.toString(),
        productName: productMap.get(row.productId)?.productName ?? 'Produk',
        categoryName: productMap.get(row.productId)?.category.categoryName,
        brandName: productMap.get(row.productId)?.brand?.brandName,
        soldQuantity: Number(row._sum.soldQuantity ?? ZERO),
        bonusQuantity: Number(row._sum.bonusQuantity ?? ZERO),
        returnedQuantity: Number(row._sum.returnedQuantity ?? ZERO),
        netSales: Number(row._sum.netSales ?? ZERO),
        costOfGoodsSold: Number(row._sum.costOfGoodsSold ?? ZERO),
        grossProfit: Number(row._sum.grossProfit ?? ZERO),
      })),
      channels: channels.map((row) => ({
        channel: row.salesChannel,
        transactionCount: row._count._all,
        netSales: Number(row._sum.invoiceTotal ?? ZERO),
      })),
    };
  }

  private async stockSnapshot(limit: number) {
    const [rows, value] = await Promise.all([
      this.prisma.$queryRaw<LowStockRow[]>(Prisma.sql`
        SELECT p.product_id AS "productId", p.product_name AS "productName",
          COALESCE(s.available_qty, 0) AS "availableQty",
          p.minimum_inventory_qty AS "minimumQty"
        FROM product p
        JOIN product_unit pu ON pu.product_id = p.product_id AND pu.is_parent = true AND pu.is_active = true
        LEFT JOIN inventory_stock s ON s.product_unit_id = pu.product_unit_id
        WHERE p.is_active = true AND COALESCE(s.available_qty, 0) <= p.minimum_inventory_qty
        ORDER BY COALESCE(s.available_qty, 0) - p.minimum_inventory_qty ASC, p.product_name ASC
        LIMIT ${limit}
      `),
      this.prisma.fifoLayer.aggregate({
        where: { remainingQty: { gt: ZERO } },
        _sum: { remainingCost: true },
      }),
    ]);
    const [totalProducts, outOfStock, lowStock] = await Promise.all([
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count FROM product p
        JOIN product_unit pu ON pu.product_id = p.product_id AND pu.is_parent = true AND pu.is_active = true
        LEFT JOIN inventory_stock s ON s.product_unit_id = pu.product_unit_id
        WHERE p.is_active = true AND COALESCE(s.available_qty, 0) <= 0
      `),
      this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count FROM product p
        JOIN product_unit pu ON pu.product_id = p.product_id AND pu.is_parent = true AND pu.is_active = true
        LEFT JOIN inventory_stock s ON s.product_unit_id = pu.product_unit_id
        WHERE p.is_active = true AND COALESCE(s.available_qty, 0) <= p.minimum_inventory_qty
      `),
    ]);
    return {
      totalProducts,
      outOfStock: Number(outOfStock[0]?.count ?? 0n),
      lowStock: Number(lowStock[0]?.count ?? 0n),
      inventoryValue: Number(value._sum.remainingCost ?? ZERO),
      lowStockProducts: rows.map((row) => ({
        productId: row.productId.toString(),
        productName: row.productName,
        availableQty: Number(row.availableQty),
        minimumQty: Number(row.minimumQty),
      })),
    };
  }

  async inventory(query: DashboardRangeQueryDto) {
    const range = this.range(query);
    const snapshot = await this.stockSnapshot(query.topLimit);
    const movements = await this.prisma.inventoryMovement.groupBy({
      by: ['originType', 'direction'],
      where: {
        movementDate: {
          gte: range.from,
          lt: new Date(range.to.getTime() + DAY_MS),
        },
      },
      _count: { _all: true },
    });
    return {
      range,
      ...snapshot,
      movements: movements.map((row) => ({
        originType: row.originType,
        direction: row.direction,
        movementCount: row._count._all,
      })),
    };
  }

  async finance(query: DashboardRangeQueryDto) {
    const range = this.range(query);
    const [daily, accounts, profitLoss, customer, supplier] = await Promise.all(
      [
        this.prisma.financialDailySummary.groupBy({
          by: ['summaryDate'],
          where: { summaryDate: { gte: range.from, lte: range.to } },
          _sum: { totalIn: true, totalOut: true, transactionCount: true },
          orderBy: { summaryDate: 'asc' },
        }),
        this.prisma.financialAccount.findMany({
          where: { isActive: true },
          orderBy: [{ accountType: 'asc' }, { accountName: 'asc' }],
        }),
        this.prisma.journalAccountDailySummary.groupBy({
          by: ['chartAccountId'],
          where: {
            summaryDate: { gte: range.from, lte: range.to },
            chartAccount: {
              accountType: { in: ['REVENUE', 'COGS', 'EXPENSE'] },
            },
          },
          _sum: { totalDebit: true, totalCredit: true },
        }),
        this.outstandingSnapshot('CUSTOMER'),
        this.outstandingSnapshot('SUPPLIER'),
      ],
    );
    const charts = await this.prisma.chartOfAccount.findMany({
      where: {
        chartAccountId: { in: profitLoss.map((row) => row.chartAccountId) },
      },
    });
    const chartMap = new Map(
      charts.map((chart) => [chart.chartAccountId, chart]),
    );
    const totals = profitLoss.reduce(
      (result, row) => {
        const chart = chartMap.get(row.chartAccountId);
        const debit = Number(row._sum.totalDebit ?? ZERO);
        const credit = Number(row._sum.totalCredit ?? ZERO);
        if (chart?.accountType === 'REVENUE') result.revenue += credit - debit;
        if (chart?.accountType === 'COGS') result.cogs += debit - credit;
        if (chart?.accountType === 'EXPENSE') result.expenses += debit - credit;
        return result;
      },
      { revenue: 0, cogs: 0, expenses: 0 },
    );
    return {
      range,
      cashFlow: daily.map((row) => ({
        date: row.summaryDate,
        cashIn: Number(row._sum.totalIn ?? ZERO),
        cashOut: Number(row._sum.totalOut ?? ZERO),
        transactionCount: row._sum.transactionCount ?? 0,
      })),
      accounts: accounts.map((account) => ({
        financialAccountId: account.financialAccountId.toString(),
        accountName: account.accountName,
        accountType: account.accountType,
        currentBalance: Number(account.currentBalance),
        isDefault: account.isDefault,
      })),
      profitLoss: {
        ...totals,
        grossProfit: totals.revenue - totals.cogs,
        netProfit: totals.revenue - totals.cogs - totals.expenses,
      },
      receivable: {
        outstanding: Number(customer[0]?.outstanding ?? ZERO),
        overdue: Number(customer[0]?.overdue ?? ZERO),
      },
      payable: {
        outstanding: Number(supplier[0]?.outstanding ?? ZERO),
        overdue: Number(supplier[0]?.overdue ?? ZERO),
      },
    };
  }

  async partners(user: UserContext, query: DashboardRangeQueryDto) {
    const range = this.range(query);
    const access = await this.access(user);
    const [customerCount, supplierCount, customers, suppliers] =
      await Promise.all([
        access.sales
          ? this.prisma.customer.count({ where: { isActive: true } })
          : 0,
        access.purchase
          ? this.prisma.supplier.count({ where: { isActive: true } })
          : 0,
        access.sales
          ? this.prisma.customerFinancialSummary.findMany({
              where: { outstandingAmount: { gt: ZERO } },
              orderBy: { outstandingAmount: 'desc' },
              take: query.topLimit,
              include: {
                customer: {
                  select: { customerId: true, customerName: true },
                },
              },
            })
          : [],
        access.purchase
          ? this.prisma.supplierFinancialSummary.findMany({
              where: { outstandingAmount: { gt: ZERO } },
              orderBy: { outstandingAmount: 'desc' },
              take: query.topLimit,
              include: {
                supplier: {
                  select: { supplierId: true, supplierName: true },
                },
              },
            })
          : [],
      ]);
    return {
      range,
      access: { sales: access.sales, purchase: access.purchase },
      customers: {
        activeCount: customerCount,
        outstanding: customers.map((item) => ({
          customerId: item.customerId.toString(),
          customerName: item.customer.customerName,
          outstandingAmount: Number(item.outstandingAmount),
          lastPaymentDate: item.lastPaymentDate,
        })),
      },
      suppliers: {
        activeCount: supplierCount,
        outstanding: suppliers.map((item) => ({
          supplierId: item.supplierId.toString(),
          supplierName: item.supplier.supplierName,
          outstandingAmount: Number(item.outstandingAmount),
          lastPaymentDate: item.lastPaymentDate,
        })),
      },
    };
  }

  private async alerts(access: {
    sales: boolean;
    purchase: boolean;
    inventory: boolean;
    finance: boolean;
  }) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const [low, customerDue, supplierDue, lateOrders] = await Promise.all([
      access.inventory ? this.stockSnapshot(5) : null,
      access.sales
        ? this.prisma.salesInvoice.findMany({
            where: {
              status: 'COMPLETED',
              outstandingAmount: { gt: ZERO },
              dueDate: { lt: now },
            },
            orderBy: { dueDate: 'asc' },
            take: 5,
            select: {
              salesInvoiceId: true,
              salesInvoiceNumber: true,
              customerName: true,
              dueDate: true,
              outstandingAmount: true,
            },
          })
        : [],
      access.purchase
        ? this.prisma.purchaseInvoice.findMany({
            where: {
              status: 'COMPLETED',
              outstandingAmount: { gt: ZERO },
              dueDate: { lt: now },
            },
            orderBy: { dueDate: 'asc' },
            take: 5,
            select: {
              purchaseInvoiceId: true,
              purchaseInvoiceNumber: true,
              dueDate: true,
              outstandingAmount: true,
              supplier: { select: { supplierName: true } },
            },
          })
        : [],
      access.purchase
        ? this.prisma.purchaseOrder.findMany({
            where: {
              status: { in: ['DRAFT', 'READY'] },
              expectedDate: { lt: now },
            },
            orderBy: { expectedDate: 'asc' },
            take: 5,
            select: {
              purchaseOrderId: true,
              purchaseOrderNumber: true,
              expectedDate: true,
              supplier: { select: { supplierName: true } },
            },
          })
        : [],
    ]);
    return {
      lowStock: low?.lowStockProducts ?? [],
      overdueReceivables: customerDue.map((item) => ({
        id: item.salesInvoiceId.toString(),
        number: item.salesInvoiceNumber,
        partyName: item.customerName,
        dueDate: item.dueDate,
        amount: Number(item.outstandingAmount),
      })),
      overduePayables: supplierDue.map((item) => ({
        id: item.purchaseInvoiceId.toString(),
        number: item.purchaseInvoiceNumber,
        partyName: item.supplier.supplierName,
        dueDate: item.dueDate,
        amount: Number(item.outstandingAmount),
      })),
      latePurchaseOrders: lateOrders.map((item) => ({
        id: item.purchaseOrderId.toString(),
        number: item.purchaseOrderNumber,
        partyName: item.supplier.supplierName,
        expectedDate: item.expectedDate,
      })),
    };
  }
}
