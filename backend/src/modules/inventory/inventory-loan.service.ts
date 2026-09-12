import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { consumeFifoLayers } from '../../common/inventory/fifo-consumption.utils.js';
import {
  INVENTORY_MOVEMENT_TYPES,
  INVENTORY_ORIGIN_TYPES,
} from '../../common/inventory/inventory-origin.js';
import {
  ACTIVITY_TYPES,
  AUDIT_OPERATIONS,
  changedFields,
  createAuditTransactionId,
  writeActivityLog,
  writeAuditLog,
} from '../../common/logging/business-logger.js';
import {
  generateFifoLayerNumber,
  recordInitialFifoIn,
} from '../purchasing/fifo-ledger.utils.js';
import { generateInventoryMovementNumber } from './inventory-movement-number.utils.js';
import { inventoryLoanOutstanding } from './inventory-loan.rules.js';
import { SalesService } from '../sales/sales.service.js';
import { PurchaseInvoiceService } from '../purchasing/purchase-invoice.service.js';
import {
  CompleteInventoryLoanResolutionDto,
  InventoryLoanListQueryDto,
  SaveInventoryLoanDto,
} from './dto/inventory-loan.dto.js';

const ZERO = new Prisma.Decimal(0);
type LoanAllocationSlice = {
  inventoryLoanFifoAllocationId: bigint;
  fifoLayerId: bigint;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
};
type LoanAuditContext = {
  transactionId: string;
  userId: bigint;
  entityNumber: string;
  source: string;
  ipAddress?: string;
};
const loanInclude = {
  customer: { select: { customerId: true, customerName: true } },
  supplier: { select: { supplierId: true, supplierName: true } },
  createdByUser: { select: { fullName: true } },
  details: {
    include: { productUnit: { include: { product: true, unit: true } } },
    orderBy: { inventoryLoanDetailId: 'asc' as const },
  },
  resolutions: {
    include: {
      salesInvoice: {
        select: {
          salesInvoiceId: true,
          salesInvoiceNumber: true,
          status: true,
        },
      },
      purchaseInvoice: {
        select: {
          purchaseInvoiceId: true,
          purchaseInvoiceNumber: true,
          status: true,
        },
      },
      details: {
        include: {
          replacementProductUnit: { include: { product: true, unit: true } },
          recoveries: { select: { sourceQuantity: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.InventoryLoanInclude;

@Injectable()
export class InventoryLoanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
    private readonly purchaseInvoices: PurchaseInvoiceService,
  ) {}

  private dateStamp(date: Date) {
    return `${String(date.getDate()).padStart(2, '0')}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getFullYear()).slice(-2)}`;
  }

  private async number(
    tx: Prisma.TransactionClient,
    prefix: 'IL-OUT' | 'IL-IN' | 'ILR',
    date: Date,
  ) {
    const start = `${prefix}-${this.dateStamp(date)}-`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`INVENTORY_LOAN_NUMBER:${start}`}))`;
    const table =
      prefix === 'ILR' ? 'inventory_loan_resolution' : 'inventory_loan';
    const column = prefix === 'ILR' ? 'resolution_number' : 'loan_number';
    const rows = await tx.$queryRawUnsafe<Array<{ value: string }>>(
      `SELECT ${column} AS value FROM ${table} WHERE ${column} LIKE $1 ORDER BY ${column} DESC LIMIT 1`,
      `${start}%`,
    );
    const next = rows[0] ? Number(rows[0].value.slice(start.length)) + 1 : 1;
    return `${start}${String(next).padStart(7, '0')}`;
  }

  private serialize<T>(value: T): T {
    const serialized: unknown = JSON.parse(
      JSON.stringify(value, (_key: string, current: unknown) =>
        typeof current === 'bigint'
          ? current.toString()
          : current instanceof Prisma.Decimal
            ? Number(current)
            : current,
      ),
    );
    return serialized as T;
  }

  async lookups() {
    const [products, customers, suppliers] = await Promise.all([
      this.prisma.productUnit.findMany({
        where: { isParent: true, isActive: true, product: { isActive: true } },
        include: {
          product: true,
          unit: true,
          inventoryStocks: true,
          fifoLayers: {
            where: { remainingQty: { gt: 0 } },
            orderBy: [{ createdAt: 'desc' }, { fifoLayerId: 'desc' }],
            take: 1,
          },
        },
        orderBy: { product: { productName: 'asc' } },
      }),
      this.prisma.customer.findMany({
        where: { isActive: true },
        select: { customerId: true, customerName: true },
        orderBy: { customerName: 'asc' },
      }),
      this.prisma.supplier.findMany({
        where: { isActive: true },
        select: { supplierId: true, supplierName: true },
        orderBy: { supplierName: 'asc' },
      }),
    ]);
    const data = products.map((row) => ({
      productUnitId: row.productUnitId.toString(),
      productName: row.product.productName,
      unitName: row.unit.unitName,
      actualQty: Number(row.inventoryStocks[0]?.actualQty ?? 0),
      availableQty: Number(row.inventoryStocks[0]?.availableQty ?? 0),
      suggestedUnitCost: row.fifoLayers[0]
        ? Number(
            row.fifoLayers[0].remainingQty.greaterThan(0)
              ? row.fifoLayers[0].remainingCost.div(
                  row.fifoLayers[0].remainingQty,
                )
              : row.fifoLayers[0].unitCost,
          )
        : null,
    }));
    return this.serialize({ products: data, customers, suppliers });
  }

  async list(query: InventoryLoanListQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const history = query.tab === 'HISTORY';
    const where: Prisma.InventoryLoanWhereInput = {
      status: history
        ? { in: ['CLOSED', 'WRITTEN_OFF', 'CANCELLED'] }
        : { in: ['DRAFT', 'OUTSTANDING'] },
      direction: query.direction,
      loanDate:
        query.dateFrom || query.dateTo
          ? {
              gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
              lte: query.dateTo
                ? new Date(`${query.dateTo}T23:59:59.999`)
                : undefined,
            }
          : undefined,
      OR: query.search
        ? [
            { loanNumber: { contains: query.search, mode: 'insensitive' } },
            {
              customer: {
                customerName: { contains: query.search, mode: 'insensitive' },
              },
            },
            {
              supplier: {
                supplierName: { contains: query.search, mode: 'insensitive' },
              },
            },
          ]
        : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.inventoryLoan.findMany({
        where,
        include: {
          customer: true,
          supplier: true,
          createdByUser: { select: { fullName: true } },
          _count: { select: { details: true, resolutions: true } },
        },
        orderBy: [{ dueDate: history ? 'desc' : 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.inventoryLoan.count({ where }),
    ]);
    return this.serialize({
      data: rows,
      meta: {
        currentPage: page,
        pageSize: limit,
        totalData: total,
        totalPage: Math.ceil(total / limit),
      },
    });
  }

  async detail(id: string) {
    const row = await this.prisma.inventoryLoan.findUnique({
      where: { inventoryLoanId: BigInt(id) },
      include: loanInclude,
    });
    if (!row)
      throw new HttpException(
        'Inventory Loan tidak ditemukan.',
        HttpStatus.NOT_FOUND,
      );
    return this.serialize(row);
  }

  private async validateMaster(
    tx: Prisma.TransactionClient,
    dto: SaveInventoryLoanDto,
  ) {
    if (dto.direction === 'OUTGOING' && (!dto.customerId || dto.supplierId))
      throw new HttpException(
        'Loan keluar wajib memilih customer dan tidak boleh memilih supplier.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    if (dto.direction === 'INCOMING' && (!dto.supplierId || dto.customerId))
      throw new HttpException(
        'Loan masuk wajib memilih supplier dan tidak boleh memilih customer.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const partner =
      dto.direction === 'OUTGOING'
        ? await tx.customer.findFirst({
            where: { customerId: BigInt(dto.customerId!), isActive: true },
          })
        : await tx.supplier.findFirst({
            where: { supplierId: BigInt(dto.supplierId!), isActive: true },
          });
    if (!partner)
      throw new HttpException(
        'Customer atau supplier tidak aktif/tidak ditemukan.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const ids = [...new Set(dto.items.map((x) => x.productUnitId))].map(BigInt);
    if (ids.length !== dto.items.length)
      throw new HttpException(
        'Produk yang sama tidak boleh ditulis dua kali.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const count = await tx.productUnit.count({
      where: {
        productUnitId: { in: ids },
        isParent: true,
        isActive: true,
        product: { isActive: true },
      },
    });
    if (count !== ids.length)
      throw new HttpException(
        'Semua produk Loan harus memakai unit utama yang aktif.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
  }

  private detailData(dto: SaveInventoryLoanDto) {
    return dto.items.map((item) => {
      const qty = new Prisma.Decimal(item.quantity);
      const cost = new Prisma.Decimal(item.provisionalUnitCost).toDecimalPlaces(
        2,
      );
      return {
        productUnitId: BigInt(item.productUnitId),
        quantity: qty,
        provisionalUnitCost: cost,
        provisionalTotalCost: qty.mul(cost).toDecimalPlaces(2),
        note: item.note,
      };
    });
  }

  async create(userId: bigint, dto: SaveInventoryLoanDto, ip?: string) {
    const createdId = await this.prisma.$transaction(async (tx) => {
      await this.validateMaster(tx, dto);
      const date = new Date(dto.loanDate);
      const row = await tx.inventoryLoan.create({
        data: {
          loanNumber: await this.number(
            tx,
            dto.direction === 'OUTGOING' ? 'IL-OUT' : 'IL-IN',
            date,
          ),
          direction: dto.direction,
          customerId: dto.customerId ? BigInt(dto.customerId) : null,
          supplierId: dto.supplierId ? BigInt(dto.supplierId) : null,
          loanDate: date,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          note: dto.note,
          createdBy: userId,
          details: { create: this.detailData(dto) },
        },
      });
      await writeActivityLog(tx, {
        userId,
        activityType: ACTIVITY_TYPES.CREATE,
        module: 'INVENTORY',
        entityType: 'INVENTORY_LOAN',
        entityId: row.inventoryLoanId,
        entityNumber: row.loanNumber,
        description: `Membuat draft Inventory Loan ${row.loanNumber}`,
      });
      await writeAuditLog(tx, {
        userId,
        transactionId: createAuditTransactionId(),
        module: 'INVENTORY',
        operation: AUDIT_OPERATIONS.CREATE,
        entityType: 'INVENTORY_LOAN',
        entityId: row.inventoryLoanId,
        entityNumber: row.loanNumber,
        source: 'InventoryLoanService.create',
        changedFields: changedFields(null, row),
        ipAddress: ip,
      });
      return row.inventoryLoanId;
    });
    return this.detail(createdId.toString());
  }

  async update(
    userId: bigint,
    id: string,
    dto: SaveInventoryLoanDto,
    ip?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const key = BigInt(id);
      await tx.$queryRaw`SELECT inventory_loan_id FROM inventory_loan WHERE inventory_loan_id=${key} FOR UPDATE`;
      const before = await tx.inventoryLoan.findUnique({
        where: { inventoryLoanId: key },
      });
      if (!before)
        throw new HttpException('Inventory Loan tidak ditemukan.', 404);
      if (before.status !== 'DRAFT')
        throw new HttpException(
          'Hanya Inventory Loan DRAFT yang dapat diedit.',
          409,
        );
      await this.validateMaster(tx, dto);
      await tx.inventoryLoanDetail.deleteMany({
        where: { inventoryLoanId: key },
      });
      const row = await tx.inventoryLoan.update({
        where: { inventoryLoanId: key },
        data: {
          direction: dto.direction,
          customerId: dto.customerId ? BigInt(dto.customerId) : null,
          supplierId: dto.supplierId ? BigInt(dto.supplierId) : null,
          loanDate: new Date(dto.loanDate),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          note: dto.note,
          updatedBy: userId,
          details: { create: this.detailData(dto) },
        },
      });
      await writeActivityLog(tx, {
        userId,
        activityType: ACTIVITY_TYPES.UPDATE,
        module: 'INVENTORY',
        entityType: 'INVENTORY_LOAN',
        entityId: key,
        entityNumber: row.loanNumber,
        description: `Memperbarui draft Inventory Loan ${row.loanNumber}`,
      });
      await writeAuditLog(tx, {
        userId,
        transactionId: createAuditTransactionId(),
        module: 'INVENTORY',
        operation: AUDIT_OPERATIONS.UPDATE,
        entityType: 'INVENTORY_LOAN',
        entityId: key,
        entityNumber: row.loanNumber,
        source: 'InventoryLoanService.update',
        changedFields: changedFields(before, row),
        ipAddress: ip,
      });
    });
    return this.detail(id);
  }

  private async changeStock(
    tx: Prisma.TransactionClient,
    productUnitId: bigint,
    delta: Prisma.Decimal,
    audit?: LoanAuditContext,
  ) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`INVENTORY_STOCK:${productUnitId.toString()}`}))`;
    const unit = await tx.productUnit.findUnique({
      where: { productUnitId },
      select: { productId: true },
    });
    if (!unit) throw new HttpException('Produk tidak ditemukan.', 422);
    const stock = await tx.inventoryStock.upsert({
      where: { productUnitId },
      create: {
        productId: unit.productId,
        productUnitId,
        actualQty: ZERO,
        availableQty: ZERO,
      },
      update: {},
    });
    if (
      stock.actualQty.add(delta).lessThan(0) ||
      stock.availableQty.add(delta).lessThan(0)
    )
      throw new HttpException(
        'Stok tidak mencukupi. Seluruh transaksi dibatalkan.',
        409,
      );
    const updated = await tx.inventoryStock.update({
      where: { productUnitId },
      data: {
        actualQty: { increment: delta },
        availableQty: { increment: delta },
      },
    });
    if (audit) {
      await writeAuditLog(tx, {
        userId: audit.userId,
        transactionId: audit.transactionId,
        module: 'INVENTORY',
        operation: AUDIT_OPERATIONS.UPDATE,
        entityType: 'INVENTORY_STOCK',
        entityId: updated.inventoryStockId,
        entityNumber: audit.entityNumber,
        source: audit.source,
        changedFields: changedFields(stock, updated, [
          'actualQty',
          'availableQty',
        ]),
        ipAddress: audit.ipAddress,
      });
    }
    return updated;
  }

  async activate(userId: bigint, id: string, ip?: string) {
    await this.prisma.$transaction(
      async (tx) => {
        const key = BigInt(id);
        await tx.$queryRaw`SELECT inventory_loan_id FROM inventory_loan WHERE inventory_loan_id=${key} FOR UPDATE`;
        const loan = await tx.inventoryLoan.findUnique({
          where: { inventoryLoanId: key },
          include: { details: true },
        });
        if (!loan)
          throw new HttpException('Inventory Loan tidak ditemukan.', 404);
        if (loan.status !== 'DRAFT')
          throw new HttpException(
            'Hanya Inventory Loan DRAFT yang dapat diaktifkan.',
            409,
          );
        const now = new Date();
        const transactionId = createAuditTransactionId();
        const audit: LoanAuditContext = {
          transactionId,
          userId,
          entityNumber: loan.loanNumber,
          source: 'InventoryLoanService.activate',
          ipAddress: ip,
        };
        for (const detail of loan.details) {
          const direction = loan.direction === 'OUTGOING' ? 'OUT' : 'IN';
          const movement = await tx.inventoryMovement.create({
            data: {
              movementNumber: await generateInventoryMovementNumber(
                tx,
                direction,
                now,
              ),
              productUnitId: detail.productUnitId,
              direction,
              quantity: detail.quantity,
              movementType:
                loan.direction === 'OUTGOING'
                  ? INVENTORY_MOVEMENT_TYPES.INVENTORY_LOAN_OUT
                  : 'INVENTORY_LOAN_IN',
              originType: INVENTORY_ORIGIN_TYPES.INVENTORY_LOAN,
              originId: loan.inventoryLoanId,
              originNumber: loan.loanNumber,
              movementDate: now,
              createdBy: userId,
            },
          });
          await writeAuditLog(tx, {
            ...audit,
            module: 'INVENTORY',
            operation: AUDIT_OPERATIONS.CREATE,
            entityType: 'INVENTORY_MOVEMENT',
            entityId: movement.inventoryMovementId,
            changedFields: changedFields(null, movement),
          });
          if (loan.direction === 'OUTGOING') {
            await consumeFifoLayers(tx, {
              productUnitId: detail.productUnitId,
              quantity: detail.quantity,
              inventoryMovementId: movement.inventoryMovementId,
              createdBy: userId,
              insufficientMessage:
                'Stok FIFO tidak cukup untuk mengaktifkan Loan.',
              audit,
            });
            const consumed = await tx.fifoLayerTransaction.findMany({
              where: { inventoryMovementId: movement.inventoryMovementId },
            });
            await tx.inventoryLoanFifoAllocation.createMany({
              data: consumed.map((item) => ({
                inventoryLoanDetailId: detail.inventoryLoanDetailId,
                fifoLayerId: item.fifoLayerId,
                allocatedQuantity: item.quantity,
                remainingAllocationQuantity: item.quantity,
                unitCost: item.unitCost,
                totalCost: item.totalCost,
              })),
            });
            await this.changeStock(
              tx,
              detail.productUnitId,
              detail.quantity.neg(),
              audit,
            );
          } else {
            const layer = await tx.fifoLayer.create({
              data: {
                fifoLayerNumber: await generateFifoLayerNumber(tx, now),
                productUnitId: detail.productUnitId,
                originType: 'INVENTORY_LOAN',
                originInventoryMovementId: movement.inventoryMovementId,
                originId: loan.inventoryLoanId,
                originalQty: detail.quantity,
                remainingQty: detail.quantity,
                unitCost: detail.provisionalUnitCost,
                originalCost: detail.provisionalTotalCost,
                remainingCost: detail.provisionalTotalCost,
                createdBy: userId,
              },
            });
            const fifoTransaction = await recordInitialFifoIn(tx, {
              fifoLayerId: layer.fifoLayerId,
              inventoryMovementId: movement.inventoryMovementId,
              quantity: detail.quantity,
              unitCost: detail.provisionalUnitCost,
              totalCost: detail.provisionalTotalCost,
              createdBy: userId,
            });
            await writeAuditLog(tx, {
              ...audit,
              module: 'FIFO',
              operation: AUDIT_OPERATIONS.CREATE,
              entityType: 'FIFO_LAYER',
              entityId: layer.fifoLayerId,
              changedFields: changedFields(null, layer),
            });
            await writeAuditLog(tx, {
              ...audit,
              module: 'FIFO',
              operation: AUDIT_OPERATIONS.CREATE,
              entityType: 'FIFO_LAYER_TRANSACTION',
              entityId: fifoTransaction.fifoLayerTransactionId,
              changedFields: changedFields(null, fifoTransaction),
            });
            await tx.inventoryLoanFifoAllocation.create({
              data: {
                inventoryLoanDetailId: detail.inventoryLoanDetailId,
                fifoLayerId: layer.fifoLayerId,
                allocatedQuantity: detail.quantity,
                remainingAllocationQuantity: detail.quantity,
                unitCost: detail.provisionalUnitCost,
                totalCost: detail.provisionalTotalCost,
              },
            });
            await this.changeStock(
              tx,
              detail.productUnitId,
              detail.quantity,
              audit,
            );
          }
        }
        await tx.inventoryLoan.update({
          where: { inventoryLoanId: key },
          data: {
            status: 'OUTSTANDING',
            activatedAt: now,
            activatedBy: userId,
            updatedBy: userId,
          },
        });
        await writeActivityLog(tx, {
          userId,
          activityType: ACTIVITY_TYPES.UPDATE,
          module: 'INVENTORY',
          entityType: 'INVENTORY_LOAN',
          entityId: key,
          entityNumber: loan.loanNumber,
          description: `Mengaktifkan Inventory Loan ${loan.loanNumber}`,
        });
        await writeAuditLog(tx, {
          userId,
          transactionId,
          module: 'INVENTORY',
          operation: AUDIT_OPERATIONS.UPDATE,
          entityType: 'INVENTORY_LOAN',
          entityId: key,
          entityNumber: loan.loanNumber,
          source: 'InventoryLoanService.activate',
          changedFields: changedFields(
            { status: loan.status },
            { status: 'OUTSTANDING' },
          ),
          ipAddress: ip,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.detail(id);
  }

  async cancel(userId: bigint, id: string, ip?: string) {
    await this.prisma.$transaction(
      async (tx) => {
        const key = BigInt(id);
        await tx.$queryRaw`SELECT inventory_loan_id FROM inventory_loan WHERE inventory_loan_id=${key} FOR UPDATE`;
        const before = await tx.inventoryLoan.findUnique({
          where: { inventoryLoanId: key },
        });
        if (!before)
          throw new HttpException('Inventory Loan tidak ditemukan.', 404);
        if (before.status !== 'DRAFT')
          throw new HttpException(
            'Hanya Inventory Loan DRAFT yang dapat dibatalkan.',
            409,
          );
        const row = await tx.inventoryLoan.update({
          where: { inventoryLoanId: key },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelledBy: userId,
            updatedBy: userId,
          },
        });
        await writeActivityLog(tx, {
          userId,
          activityType: ACTIVITY_TYPES.UPDATE,
          module: 'INVENTORY',
          entityType: 'INVENTORY_LOAN',
          entityId: key,
          entityNumber: row.loanNumber,
          description: `Membatalkan Inventory Loan ${row.loanNumber}`,
        });
        await writeAuditLog(tx, {
          userId,
          transactionId: createAuditTransactionId(),
          module: 'INVENTORY',
          operation: AUDIT_OPERATIONS.UPDATE,
          entityType: 'INVENTORY_LOAN',
          entityId: key,
          entityNumber: row.loanNumber,
          source: 'InventoryLoanService.cancel',
          changedFields: changedFields(
            { status: before.status },
            { status: row.status },
          ),
          ipAddress: ip,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.detail(id);
  }

  private async createInboundLayer(
    tx: Prisma.TransactionClient,
    userId: bigint,
    loan: { inventoryLoanId: bigint; loanNumber: string },
    detailId: bigint,
    productUnitId: bigint,
    qty: Prisma.Decimal,
    total: Prisma.Decimal,
    date: Date,
    audit: LoanAuditContext,
    isRecovery: boolean,
  ) {
    const cost = total.div(qty).toDecimalPlaces(2);
    const movement = await tx.inventoryMovement.create({
      data: {
        movementNumber: await generateInventoryMovementNumber(tx, 'IN', date),
        productUnitId,
        direction: 'IN',
        quantity: qty,
        movementType: isRecovery
          ? INVENTORY_MOVEMENT_TYPES.INVENTORY_LOAN_RECOVERY_IN
          : INVENTORY_MOVEMENT_TYPES.INVENTORY_LOAN_RETURN_IN,
        originType: isRecovery
          ? INVENTORY_ORIGIN_TYPES.INVENTORY_LOAN_RECOVERY
          : INVENTORY_ORIGIN_TYPES.INVENTORY_LOAN_RETURN,
        originId: loan.inventoryLoanId,
        originNumber: loan.loanNumber,
        movementDate: date,
        createdBy: userId,
      },
    });
    const layer = await tx.fifoLayer.create({
      data: {
        fifoLayerNumber: await generateFifoLayerNumber(tx, date),
        productUnitId,
        originType: isRecovery
          ? 'INVENTORY_LOAN_RECOVERY'
          : 'INVENTORY_LOAN_RETURN',
        originInventoryMovementId: movement.inventoryMovementId,
        originId: loan.inventoryLoanId,
        originalQty: qty,
        remainingQty: qty,
        unitCost: cost,
        originalCost: total,
        remainingCost: total,
        createdBy: userId,
      },
    });
    const fifoTransaction = await recordInitialFifoIn(tx, {
      fifoLayerId: layer.fifoLayerId,
      inventoryMovementId: movement.inventoryMovementId,
      quantity: qty,
      unitCost: cost,
      totalCost: total,
      createdBy: userId,
    });
    await writeAuditLog(tx, {
      ...audit,
      module: 'INVENTORY',
      operation: AUDIT_OPERATIONS.CREATE,
      entityType: 'INVENTORY_MOVEMENT',
      entityId: movement.inventoryMovementId,
      changedFields: changedFields(null, movement),
    });
    await writeAuditLog(tx, {
      ...audit,
      module: 'FIFO',
      operation: AUDIT_OPERATIONS.CREATE,
      entityType: 'FIFO_LAYER',
      entityId: layer.fifoLayerId,
      changedFields: changedFields(null, layer),
    });
    await writeAuditLog(tx, {
      ...audit,
      module: 'FIFO',
      operation: AUDIT_OPERATIONS.CREATE,
      entityType: 'FIFO_LAYER_TRANSACTION',
      entityId: fifoTransaction.fifoLayerTransactionId,
      changedFields: changedFields(null, fifoTransaction),
    });
    await this.changeStock(tx, productUnitId, qty, audit);
    return { movement, layer, cost };
  }

  private async allocateLoanObligation(
    tx: Prisma.TransactionClient,
    resolutionDetailId: bigint,
    loanDetailId: bigint,
    quantity: Prisma.Decimal,
  ) {
    const allocations = await tx.inventoryLoanFifoAllocation.findMany({
      where: {
        inventoryLoanDetailId: loanDetailId,
        remainingAllocationQuantity: { gt: 0 },
      },
      orderBy: { inventoryLoanFifoAllocationId: 'asc' },
    });
    let remaining = quantity;
    for (const allocation of allocations) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const take = Prisma.Decimal.min(
        remaining,
        allocation.remainingAllocationQuantity,
      );
      await tx.inventoryLoanFifoAllocation.update({
        where: {
          inventoryLoanFifoAllocationId:
            allocation.inventoryLoanFifoAllocationId,
        },
        data: { remainingAllocationQuantity: { decrement: take } },
      });
      await tx.inventoryLoanResolutionAllocation.create({
        data: {
          inventoryLoanResolutionDetailId: resolutionDetailId,
          inventoryLoanFifoAllocationId:
            allocation.inventoryLoanFifoAllocationId,
          fifoLayerId: allocation.fifoLayerId,
          role: 'LOAN_OBLIGATION',
          quantity: take,
          unitCost: allocation.unitCost,
          totalCost: take.mul(allocation.unitCost).toDecimalPlaces(2),
        },
      });
      remaining = remaining.sub(take);
    }
    if (remaining.greaterThan(0)) {
      throw new HttpException(
        'Alokasi FIFO Loan tidak mencukupi. Seluruh penyelesaian dibatalkan.',
        HttpStatus.CONFLICT,
      );
    }
  }

  private async planRecoveredWriteOffAllocation(
    tx: Prisma.TransactionClient,
    writeOffDetailId: bigint,
    quantity: Prisma.Decimal,
  ): Promise<LoanAllocationSlice[]> {
    const original = await tx.inventoryLoanResolutionAllocation.findMany({
      where: {
        inventoryLoanResolutionDetailId: writeOffDetailId,
        role: 'LOAN_OBLIGATION',
        inventoryLoanFifoAllocationId: { not: null },
      },
      orderBy: { inventoryLoanResolutionAllocationId: 'asc' },
    });
    const recoveryDetails = await tx.inventoryLoanResolutionDetail.findMany({
      where: { recoveredWriteOffDetailId: writeOffDetailId },
      select: { inventoryLoanResolutionDetailId: true },
    });
    const used = recoveryDetails.length
      ? await tx.inventoryLoanResolutionAllocation.groupBy({
          by: ['inventoryLoanFifoAllocationId'],
          where: {
            inventoryLoanResolutionDetailId: {
              in: recoveryDetails.map(
                (item) => item.inventoryLoanResolutionDetailId,
              ),
            },
            role: 'LOAN_OBLIGATION',
            inventoryLoanFifoAllocationId: { not: null },
          },
          _sum: { quantity: true },
        })
      : [];
    const usedByAllocation = new Map(
      used.map((item) => [
        item.inventoryLoanFifoAllocationId!.toString(),
        item._sum.quantity ?? ZERO,
      ]),
    );
    const slices: LoanAllocationSlice[] = [];
    let remaining = quantity;
    for (const allocation of original) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const allocationId = allocation.inventoryLoanFifoAllocationId!;
      const available = Prisma.Decimal.max(
        ZERO,
        allocation.quantity.sub(
          usedByAllocation.get(allocationId.toString()) ?? ZERO,
        ),
      );
      const take = Prisma.Decimal.min(remaining, available);
      if (take.lessThanOrEqualTo(0)) continue;
      slices.push({
        inventoryLoanFifoAllocationId: allocationId,
        fifoLayerId: allocation.fifoLayerId,
        quantity: take,
        unitCost: allocation.unitCost,
        totalCost: take.mul(allocation.unitCost).toDecimalPlaces(2),
      });
      remaining = remaining.sub(take);
    }
    if (remaining.greaterThan(0))
      throw new HttpException(
        'Alokasi FIFO pemulihan kerugian tidak mencukupi.',
        HttpStatus.CONFLICT,
      );
    return slices;
  }

  private async saveLoanAllocationSlices(
    tx: Prisma.TransactionClient,
    resolutionDetailId: bigint,
    slices: LoanAllocationSlice[],
  ) {
    if (!slices.length) return;
    await tx.inventoryLoanResolutionAllocation.createMany({
      data: slices.map((slice) => ({
        inventoryLoanResolutionDetailId: resolutionDetailId,
        inventoryLoanFifoAllocationId: slice.inventoryLoanFifoAllocationId,
        fifoLayerId: slice.fifoLayerId,
        role: 'LOAN_OBLIGATION',
        quantity: slice.quantity,
        unitCost: slice.unitCost,
        totalCost: slice.totalCost,
      })),
    });
  }

  private async lockFifoProduct(
    tx: Prisma.TransactionClient,
    productUnitId: bigint,
  ) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`FIFO_CONSUME:${productUnitId.toString()}`}))`;
    await tx.$queryRaw`SELECT fifo_layer_id FROM fifo_layer WHERE product_unit_id=${productUnitId} FOR UPDATE`;
  }

  private async consumeIncomingLoanLayers(
    tx: Prisma.TransactionClient,
    loanDetailId: bigint,
    productUnitId: bigint,
    quantity: Prisma.Decimal,
    inventoryMovementId: bigint,
    userId: bigint,
    recoverySlices?: LoanAllocationSlice[],
    audit?: LoanAuditContext,
  ) {
    await this.lockFifoProduct(tx, productUnitId);
    const allocations = await tx.inventoryLoanFifoAllocation.findMany({
      where: {
        inventoryLoanDetailId: loanDetailId,
        ...(recoverySlices
          ? {
              inventoryLoanFifoAllocationId: {
                in: recoverySlices.map(
                  (slice) => slice.inventoryLoanFifoAllocationId,
                ),
              },
            }
          : { remainingAllocationQuantity: { gt: 0 } }),
      },
      include: { fifoLayer: true },
      orderBy: { inventoryLoanFifoAllocationId: 'asc' },
    });
    const recoveryByAllocation = new Map(
      (recoverySlices ?? []).map((slice) => [
        slice.inventoryLoanFifoAllocationId.toString(),
        slice.quantity,
      ]),
    );
    const available = allocations.reduce(
      (sum, item) =>
        sum.add(
          Prisma.Decimal.min(
            recoverySlices
              ? (recoveryByAllocation.get(
                  item.inventoryLoanFifoAllocationId.toString(),
                ) ?? ZERO)
              : item.remainingAllocationQuantity,
            item.fifoLayer.remainingQty,
          ),
        ),
      ZERO,
    );
    if (available.lessThan(quantity)) {
      throw new HttpException(
        'Barang Loan ini sudah terpakai sehingga layer aslinya tidak cukup untuk dikembalikan. Gunakan konversi PI atau barang pengganti.',
        HttpStatus.CONFLICT,
      );
    }
    let remaining = quantity;
    let total = ZERO;
    for (const item of allocations) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const layerAvailable = Prisma.Decimal.min(
        recoverySlices
          ? (recoveryByAllocation.get(
              item.inventoryLoanFifoAllocationId.toString(),
            ) ?? ZERO)
          : item.remainingAllocationQuantity,
        item.fifoLayer.remainingQty,
      );
      const take = Prisma.Decimal.min(remaining, layerAvailable);
      if (take.lessThanOrEqualTo(0)) continue;
      const unitCost = item.fifoLayer.remainingQty.greaterThan(0)
        ? item.fifoLayer.remainingCost.div(item.fifoLayer.remainingQty)
        : item.fifoLayer.unitCost;
      const cost = take.mul(unitCost).toDecimalPlaces(2);
      const after = item.fifoLayer.remainingQty.sub(take);
      const updatedLayer = await tx.fifoLayer.update({
        where: { fifoLayerId: item.fifoLayerId },
        data: {
          remainingQty: after,
          remainingCost: Prisma.Decimal.max(
            ZERO,
            item.fifoLayer.remainingCost.sub(cost),
          ),
        },
      });
      const fifoTransaction = await tx.fifoLayerTransaction.create({
        data: {
          fifoLayerId: item.fifoLayerId,
          inventoryMovementId,
          quantity: take,
          direction: 'OUT',
          unitCost,
          totalCost: cost,
          quantityBefore: item.fifoLayer.remainingQty,
          quantityAfter: after,
          createdBy: userId,
        },
      });
      if (audit) {
        await writeAuditLog(tx, {
          ...audit,
          module: 'FIFO',
          operation: AUDIT_OPERATIONS.UPDATE,
          entityType: 'FIFO_LAYER',
          entityId: item.fifoLayerId,
          changedFields: changedFields(item.fifoLayer, updatedLayer, [
            'remainingQty',
            'remainingCost',
          ]),
        });
        await writeAuditLog(tx, {
          ...audit,
          module: 'FIFO',
          operation: AUDIT_OPERATIONS.CREATE,
          entityType: 'FIFO_LAYER_TRANSACTION',
          entityId: fifoTransaction.fifoLayerTransactionId,
          changedFields: changedFields(null, fifoTransaction),
        });
      }
      total = total.add(cost);
      remaining = remaining.sub(take);
    }
    return total.toDecimalPlaces(2);
  }

  private async revalueIncomingLoanCost(
    tx: Prisma.TransactionClient,
    loanDetailId: bigint,
    productUnitId: bigint,
    quantity: Prisma.Decimal,
    previousUnitCost: Prisma.Decimal,
    finalUnitCost: Prisma.Decimal,
    recoverySlices?: LoanAllocationSlice[],
    audit?: LoanAuditContext,
  ) {
    const difference = finalUnitCost.sub(previousUnitCost);
    if (difference.equals(0)) {
      return { inventory: ZERO, consumed: ZERO };
    }
    await this.lockFifoProduct(tx, productUnitId);
    const allocations = await tx.inventoryLoanFifoAllocation.findMany({
      where: {
        inventoryLoanDetailId: loanDetailId,
        ...(recoverySlices
          ? {
              inventoryLoanFifoAllocationId: {
                in: recoverySlices.map(
                  (slice) => slice.inventoryLoanFifoAllocationId,
                ),
              },
            }
          : { remainingAllocationQuantity: { gt: 0 } }),
      },
      include: { fifoLayer: true },
      orderBy: { inventoryLoanFifoAllocationId: 'asc' },
    });
    const recoveryByAllocation = new Map(
      (recoverySlices ?? []).map((slice) => [
        slice.inventoryLoanFifoAllocationId.toString(),
        slice.quantity,
      ]),
    );
    let remaining = quantity;
    let inventory = ZERO;
    let consumed = ZERO;
    for (const allocation of allocations) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const take = Prisma.Decimal.min(
        remaining,
        recoverySlices
          ? (recoveryByAllocation.get(
              allocation.inventoryLoanFifoAllocationId.toString(),
            ) ?? ZERO)
          : allocation.remainingAllocationQuantity,
      );
      const remainingPart = Prisma.Decimal.min(
        take,
        allocation.fifoLayer.remainingQty,
      );
      const consumedPart = take.sub(remainingPart);
      const inventoryPart = remainingPart.mul(difference).toDecimalPlaces(2);
      const consumedPartCost = consumedPart.mul(difference).toDecimalPlaces(2);
      const originalCostDelta = take.mul(difference).toDecimalPlaces(2);
      const nextOriginalCost =
        allocation.fifoLayer.originalCost.add(originalCostDelta);
      const nextRemainingCost =
        allocation.fifoLayer.remainingCost.add(inventoryPart);
      if (nextOriginalCost.lessThan(0) || nextRemainingCost.lessThan(0)) {
        throw new HttpException(
          'Modal final menghasilkan nilai FIFO negatif. Periksa harga PI.',
          422,
        );
      }
      const updatedLayer = await tx.fifoLayer.update({
        where: { fifoLayerId: allocation.fifoLayerId },
        data: {
          originalCost: nextOriginalCost,
          remainingCost: nextRemainingCost,
          unitCost: nextOriginalCost
            .div(allocation.fifoLayer.originalQty)
            .toDecimalPlaces(2),
        },
      });
      if (audit) {
        await writeAuditLog(tx, {
          ...audit,
          module: 'FIFO',
          operation: AUDIT_OPERATIONS.UPDATE,
          entityType: 'FIFO_LAYER_REVALUATION',
          entityId: allocation.fifoLayerId,
          changedFields: changedFields(allocation.fifoLayer, updatedLayer, [
            'unitCost',
            'originalCost',
            'remainingCost',
          ]),
        });
      }
      inventory = inventory.add(inventoryPart);
      consumed = consumed.add(consumedPartCost);
      remaining = remaining.sub(take);
    }
    if (remaining.greaterThan(0))
      throw new HttpException('Alokasi modal Loan tidak mencukupi.', 409);
    return {
      inventory: inventory.toDecimalPlaces(2),
      consumed: consumed.toDecimalPlaces(2),
    };
  }

  async resolve(
    userId: bigint,
    id: string,
    dto: CompleteInventoryLoanResolutionDto,
    ip?: string,
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        const key = BigInt(id);
        await tx.$queryRaw`SELECT inventory_loan_id FROM inventory_loan WHERE inventory_loan_id=${key} FOR UPDATE`;
        const loan = await tx.inventoryLoan.findUnique({
          where: { inventoryLoanId: key },
          include: { details: true },
        });
        if (!loan || !['OUTSTANDING', 'WRITTEN_OFF'].includes(loan.status))
          throw new HttpException(
            'Inventory Loan tidak aktif atau tidak ditemukan.',
            409,
          );
        const transactionId = createAuditTransactionId();
        const audit: LoanAuditContext = {
          transactionId,
          userId,
          entityNumber: loan.loanNumber,
          source: 'InventoryLoanService.resolve',
          ipAddress: ip,
        };
        const detailMap = new Map(
          loan.details.map((x) => [x.inventoryLoanDetailId.toString(), x]),
        );
        const requestedByDetail = new Map<string, Prisma.Decimal>();
        for (const item of dto.items) {
          if (item.recoveredWriteOffDetailId) continue;
          requestedByDetail.set(
            item.inventoryLoanDetailId,
            (requestedByDetail.get(item.inventoryLoanDetailId) ?? ZERO).add(
              item.sourceQuantity,
            ),
          );
        }
        const recoveryIds = [
          ...new Set(
            dto.items
              .map((item) => item.recoveredWriteOffDetailId)
              .filter((value): value is string => Boolean(value)),
          ),
        ];
        const writeOffs = recoveryIds.length
          ? await tx.inventoryLoanResolutionDetail.findMany({
              where: {
                inventoryLoanResolutionDetailId: {
                  in: recoveryIds.map(BigInt),
                },
                resolutionType: 'WRITE_OFF',
                inventoryLoanDetail: { inventoryLoanId: key },
              },
              include: { recoveries: { select: { sourceQuantity: true } } },
            })
          : [];
        const writeOffMap = new Map(
          writeOffs.map((row) => [
            row.inventoryLoanResolutionDetailId.toString(),
            row,
          ]),
        );
        const requestedRecovery = new Map<string, Prisma.Decimal>();
        for (const item of dto.items) {
          if (!item.recoveredWriteOffDetailId) continue;
          const writeOff = writeOffMap.get(item.recoveredWriteOffDetailId);
          if (
            !writeOff ||
            writeOff.inventoryLoanDetailId.toString() !==
              item.inventoryLoanDetailId
          )
            throw new HttpException(
              'Referensi pemulihan kerugian tidak valid.',
              422,
            );
          requestedRecovery.set(
            item.recoveredWriteOffDetailId,
            (requestedRecovery.get(item.recoveredWriteOffDetailId) ?? ZERO).add(
              item.sourceQuantity,
            ),
          );
        }
        for (const [writeOffId, requested] of requestedRecovery) {
          const writeOff = writeOffMap.get(writeOffId)!;
          const recovered = writeOff.recoveries.reduce(
            (sum, row) => sum.add(row.sourceQuantity),
            ZERO,
          );
          if (requested.greaterThan(writeOff.sourceQuantity.sub(recovered)))
            throw new HttpException(
              'Jumlah pemulihan melebihi sisa kerugian.',
              422,
            );
        }
        for (const [detailId, requested] of requestedByDetail) {
          const source = detailMap.get(detailId);
          if (!source) throw new HttpException('Detail Loan tidak valid.', 422);
          const outstanding = inventoryLoanOutstanding(source);
          if (requested.greaterThan(outstanding))
            throw new HttpException(
              'Total penyelesaian produk melebihi sisa Loan.',
              422,
            );
        }
        const date = new Date(dto.resolutionDate);
        const prepared = [] as Array<{
          input: CompleteInventoryLoanResolutionDto['items'][number];
          source: (typeof loan.details)[number];
          qty: Prisma.Decimal;
          total: Prisma.Decimal;
        }>;
        for (const input of dto.items) {
          const source = detailMap.get(input.inventoryLoanDetailId);
          if (!source) throw new HttpException('Detail Loan tidak valid.', 422);
          const qty = new Prisma.Decimal(input.sourceQuantity);
          if (
            input.recoveredWriteOffDetailId &&
            input.resolutionType === 'WRITE_OFF'
          )
            throw new HttpException(
              'Pemulihan kerugian harus berupa barang atau invoice.',
              422,
            );
          const outstanding = inventoryLoanOutstanding(source);
          if (!input.recoveredWriteOffDetailId && qty.greaterThan(outstanding))
            throw new HttpException(
              'Jumlah penyelesaian melebihi sisa Loan.',
              422,
            );
          if (
            input.resolutionType === 'REPLACEMENT_PRODUCT' &&
            (!input.replacementProductUnitId || !input.replacementQuantity)
          )
            throw new HttpException(
              'Produk dan jumlah barang pengganti wajib diisi.',
              422,
            );
          prepared.push({
            input,
            source,
            qty,
            total: qty.mul(source.provisionalUnitCost).toDecimalPlaces(2),
          });
        }
        const resolution = await tx.inventoryLoanResolution.create({
          data: {
            resolutionNumber: await this.number(tx, 'ILR', date),
            inventoryLoanId: key,
            resolutionDate: date,
            status: 'COMPLETED',
            note: dto.note,
            createdBy: userId,
            completedAt: new Date(),
            completedBy: userId,
          },
        });
        const invoiceLines = prepared.filter(
          (x) => x.input.resolutionType === 'INVOICE_CONVERSION',
        );
        let salesInvoiceId: bigint | undefined;
        let purchaseInvoiceId: bigint | undefined;
        if (invoiceLines.length && loan.direction === 'OUTGOING') {
          const invoiceDueDate = dto.invoiceDueDate
            ? new Date(dto.invoiceDueDate)
            : loan.dueDate;
          if (!invoiceDueDate)
            throw new HttpException(
              'Tanggal jatuh tempo wajib diisi karena SI hasil Inventory Loan langsung menjadi piutang customer.',
              HttpStatus.UNPROCESSABLE_ENTITY,
            );
          const invoice =
            await this.sales.createCompletedInventoryLoanInvoiceTx(
              tx,
              userId,
              resolution.inventoryLoanResolutionId,
              {
                customerId: loan.customerId!.toString(),
                partyType: 'CUSTOMER',
                salesChannel: 'MANUAL',
                paymentType: 'CREDIT',
                invoiceDate: date.toISOString(),
                dueDate: invoiceDueDate.toISOString(),
                discountAmount: 0,
                status: 'COMPLETED',
                snapshotMode: 'IGNORE',
                note: `Konversi Inventory Loan ${loan.loanNumber}${dto.note ? ` — ${dto.note}` : ''}`,
                items: invoiceLines.map((x) => ({
                  productUnitId: x.source.productUnitId.toString(),
                  quantity: Number(x.qty),
                  unitPrice: Number(
                    x.input.invoiceUnitPrice ?? x.source.provisionalUnitCost,
                  ),
                  discountAmount: 0,
                  bonusQuantity: 0,
                  note: x.input.note,
                })),
              },
            );
          salesInvoiceId = BigInt(invoice.salesInvoiceId);
        }
        if (invoiceLines.length && loan.direction === 'INCOMING') {
          const invoiceDueDate = dto.invoiceDueDate
            ? new Date(dto.invoiceDueDate)
            : loan.dueDate;
          if (!invoiceDueDate)
            throw new HttpException(
              'Tanggal jatuh tempo wajib diisi karena PI hasil Inventory Loan langsung menjadi hutang supplier.',
              HttpStatus.UNPROCESSABLE_ENTITY,
            );
          const total = invoiceLines
            .reduce(
              (sum, x) =>
                sum.add(
                  x.qty.mul(
                    x.input.invoiceUnitPrice ?? x.source.provisionalUnitCost,
                  ),
                ),
              ZERO,
            )
            .toDecimalPlaces(2);
          const invoice =
            await this.purchaseInvoices.createCompletedInventoryLoanInvoiceTx(
              tx,
              userId,
              resolution.inventoryLoanResolutionId,
              {
                supplierId: loan.supplierId!.toString(),
                invoiceDate: date.toISOString(),
                dueDate: invoiceDueDate.toISOString(),
                invoiceTotal: Number(total),
                discountAmount: 0,
                status: 'COMPLETED',
                priceHistoryAction: 'IGNORE',
                payments: [],
                note: `Konversi Inventory Loan ${loan.loanNumber}${dto.note ? ` — ${dto.note}` : ''}`,
                items: invoiceLines.map((x) => ({
                  productUnitId: x.source.productUnitId.toString(),
                  purchasedQty: Number(x.qty),
                  price: Number(
                    x.input.invoiceUnitPrice ?? x.source.provisionalUnitCost,
                  ),
                  note: x.input.note,
                })),
              },
            );
          purchaseInvoiceId = invoice.purchaseInvoiceId;
        }
        await tx.inventoryLoanResolution.update({
          where: {
            inventoryLoanResolutionId: resolution.inventoryLoanResolutionId,
          },
          data: { salesInvoiceId, purchaseInvoiceId },
        });
        for (const row of prepared) {
          const recoverySlices = row.input.recoveredWriteOffDetailId
            ? await this.planRecoveredWriteOffAllocation(
                tx,
                BigInt(row.input.recoveredWriteOffDetailId),
                row.qty,
              )
            : undefined;
          const replacementId =
            row.input.resolutionType === 'SAME_PRODUCT_RETURN'
              ? row.source.productUnitId
              : row.input.replacementProductUnitId
                ? BigInt(row.input.replacementProductUnitId)
                : null;
          let movementId: bigint | undefined;
          let replacementLayerId: bigint | undefined;
          let replacementCost: Prisma.Decimal | undefined;
          let actualCost: Prisma.Decimal | undefined;
          let inventoryRevaluation = ZERO;
          let consumedCostAdjustment = ZERO;
          if (
            loan.direction === 'INCOMING' &&
            row.input.resolutionType === 'INVOICE_CONVERSION'
          ) {
            const revaluation = await this.revalueIncomingLoanCost(
              tx,
              row.source.inventoryLoanDetailId,
              row.source.productUnitId,
              row.qty,
              row.source.provisionalUnitCost,
              new Prisma.Decimal(
                row.input.invoiceUnitPrice ?? row.source.provisionalUnitCost,
              ),
              recoverySlices,
              audit,
            );
            inventoryRevaluation = revaluation.inventory;
            consumedCostAdjustment = revaluation.consumed;
          }
          if (replacementId) {
            const valid = await tx.productUnit.findFirst({
              where: {
                productUnitId: replacementId,
                isParent: true,
                isActive: true,
              },
            });
            if (!valid)
              throw new HttpException(
                'Barang pengganti harus memakai unit utama aktif.',
                422,
              );
            const replacementQty =
              row.input.resolutionType === 'SAME_PRODUCT_RETURN'
                ? row.qty
                : new Prisma.Decimal(row.input.replacementQuantity!);
            if (loan.direction === 'OUTGOING') {
              const inbound = await this.createInboundLayer(
                tx,
                userId,
                loan,
                row.source.inventoryLoanDetailId,
                replacementId,
                replacementQty,
                row.total,
                date,
                audit,
                Boolean(row.input.recoveredWriteOffDetailId),
              );
              movementId = inbound.movement.inventoryMovementId;
              replacementLayerId = inbound.layer.fifoLayerId;
              replacementCost = inbound.cost;
            } else {
              const movement = await tx.inventoryMovement.create({
                data: {
                  movementNumber: await generateInventoryMovementNumber(
                    tx,
                    'OUT',
                    date,
                  ),
                  productUnitId: replacementId,
                  direction: 'OUT',
                  quantity: replacementQty,
                  movementType: row.input.recoveredWriteOffDetailId
                    ? INVENTORY_MOVEMENT_TYPES.INVENTORY_LOAN_RECOVERY_OUT
                    : INVENTORY_MOVEMENT_TYPES.INVENTORY_LOAN_RETURN_OUT,
                  originType: row.input.recoveredWriteOffDetailId
                    ? INVENTORY_ORIGIN_TYPES.INVENTORY_LOAN_RECOVERY
                    : INVENTORY_ORIGIN_TYPES.INVENTORY_LOAN_RETURN,
                  originId: key,
                  originNumber: loan.loanNumber,
                  movementDate: date,
                  createdBy: userId,
                },
              });
              await writeAuditLog(tx, {
                ...audit,
                module: 'INVENTORY',
                operation: AUDIT_OPERATIONS.CREATE,
                entityType: 'INVENTORY_MOVEMENT',
                entityId: movement.inventoryMovementId,
                changedFields: changedFields(null, movement),
              });
              actualCost =
                row.input.resolutionType === 'SAME_PRODUCT_RETURN'
                  ? await this.consumeIncomingLoanLayers(
                      tx,
                      row.source.inventoryLoanDetailId,
                      row.source.productUnitId,
                      replacementQty,
                      movement.inventoryMovementId,
                      userId,
                      recoverySlices,
                      audit,
                    )
                  : await consumeFifoLayers(tx, {
                      productUnitId: replacementId,
                      quantity: replacementQty,
                      inventoryMovementId: movement.inventoryMovementId,
                      createdBy: userId,
                      audit,
                    });
              await this.changeStock(
                tx,
                replacementId,
                replacementQty.neg(),
                audit,
              );
              movementId = movement.inventoryMovementId;
              replacementCost = row.total
                .div(replacementQty)
                .toDecimalPlaces(2);
            }
          }
          const resolutionDetail =
            await tx.inventoryLoanResolutionDetail.create({
              data: {
                inventoryLoanResolutionId: resolution.inventoryLoanResolutionId,
                inventoryLoanDetailId: row.source.inventoryLoanDetailId,
                recoveredWriteOffDetailId: row.input.recoveredWriteOffDetailId
                  ? BigInt(row.input.recoveredWriteOffDetailId)
                  : null,
                resolutionType: row.input.resolutionType,
                sourceQuantity: row.qty,
                obligationUnitCost: row.source.provisionalUnitCost,
                obligationTotalCost: row.total,
                replacementProductUnitId: replacementId,
                replacementQuantity: replacementId
                  ? row.input.resolutionType === 'SAME_PRODUCT_RETURN'
                    ? row.qty
                    : new Prisma.Decimal(row.input.replacementQuantity!)
                  : null,
                replacementUnitCost: replacementCost,
                replacementTotalCost: replacementId ? row.total : null,
                actualFifoCost: actualCost,
                valuationVariance: actualCost
                  ? row.total.sub(actualCost)
                  : ZERO,
                inventoryRevaluationAmount: inventoryRevaluation,
                consumedCostAdjustmentAmount: consumedCostAdjustment,
                inventoryMovementId: movementId,
                note: row.input.note,
              },
            });
          await writeAuditLog(tx, {
            ...audit,
            module: 'INVENTORY',
            operation: AUDIT_OPERATIONS.CREATE,
            entityType: 'INVENTORY_LOAN_RESOLUTION_DETAIL',
            entityId: resolutionDetail.inventoryLoanResolutionDetailId,
            entityNumber: resolution.resolutionNumber,
            changedFields: changedFields(null, resolutionDetail),
          });
          if (recoverySlices) {
            await this.saveLoanAllocationSlices(
              tx,
              resolutionDetail.inventoryLoanResolutionDetailId,
              recoverySlices,
            );
          } else {
            await this.allocateLoanObligation(
              tx,
              resolutionDetail.inventoryLoanResolutionDetailId,
              row.source.inventoryLoanDetailId,
              row.qty,
            );
          }
          if (replacementLayerId) {
            await tx.inventoryLoanResolutionAllocation.create({
              data: {
                inventoryLoanResolutionDetailId:
                  resolutionDetail.inventoryLoanResolutionDetailId,
                fifoLayerId: replacementLayerId,
                role: 'REPLACEMENT_IN',
                quantity: resolutionDetail.replacementQuantity!,
                unitCost: resolutionDetail.replacementUnitCost!,
                totalCost: resolutionDetail.replacementTotalCost!,
              },
            });
          }
          if (movementId && loan.direction === 'INCOMING') {
            const consumed = await tx.fifoLayerTransaction.findMany({
              where: { inventoryMovementId: movementId },
            });
            await tx.inventoryLoanResolutionAllocation.createMany({
              data: consumed.map((allocation) => ({
                inventoryLoanResolutionDetailId:
                  resolutionDetail.inventoryLoanResolutionDetailId,
                fifoLayerId: allocation.fifoLayerId,
                role: 'REPLACEMENT_OUT',
                quantity: allocation.quantity,
                unitCost: allocation.unitCost,
                totalCost: allocation.totalCost,
              })),
            });
          }
          const increment = row.input.recoveredWriteOffDetailId
            ? { recoveredQuantity: { increment: row.qty } }
            : row.input.resolutionType === 'INVOICE_CONVERSION'
              ? { convertedQuantity: { increment: row.qty } }
              : row.input.resolutionType === 'WRITE_OFF'
                ? { writtenOffQuantity: { increment: row.qty } }
                : { returnedQuantity: { increment: row.qty } };
          await tx.inventoryLoanDetail.update({
            where: { inventoryLoanDetailId: row.source.inventoryLoanDetailId },
            data: increment,
          });
        }
        if (salesInvoiceId) {
          await this.sales.postInventoryLoanCostAccrualTx(
            tx,
            userId,
            salesInvoiceId,
            resolution.inventoryLoanResolutionId,
            date,
          );
        }
        const remaining = await tx.inventoryLoanDetail.findMany({
          where: { inventoryLoanId: key },
        });
        const outstanding = remaining.reduce(
          (sum, x) => sum.add(inventoryLoanOutstanding(x)),
          ZERO,
        );
        const unrecovered = remaining.reduce(
          (sum, x) => sum.add(x.writtenOffQuantity).sub(x.recoveredQuantity),
          ZERO,
        );
        const status = outstanding.greaterThan(0)
          ? 'OUTSTANDING'
          : unrecovered.greaterThan(0)
            ? 'WRITTEN_OFF'
            : 'CLOSED';
        await tx.inventoryLoan.update({
          where: { inventoryLoanId: key },
          data: {
            status,
            closedAt: status === 'CLOSED' ? new Date() : null,
            closedBy: status === 'CLOSED' ? userId : null,
            updatedBy: userId,
          },
        });
        await writeActivityLog(tx, {
          userId,
          activityType: ACTIVITY_TYPES.UPDATE,
          module: 'INVENTORY',
          entityType: 'INVENTORY_LOAN_RESOLUTION',
          entityId: resolution.inventoryLoanResolutionId,
          entityNumber: resolution.resolutionNumber,
          description: `Menyelesaikan sebagian Inventory Loan ${loan.loanNumber}`,
        });
        await writeAuditLog(tx, {
          userId,
          transactionId,
          module: 'INVENTORY',
          operation: AUDIT_OPERATIONS.CREATE,
          entityType: 'INVENTORY_LOAN_RESOLUTION',
          entityId: resolution.inventoryLoanResolutionId,
          entityNumber: resolution.resolutionNumber,
          source: 'InventoryLoanService.resolve',
          changedFields: changedFields(null, {
            status: 'COMPLETED',
            items: dto.items,
          }),
          ipAddress: ip,
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30000,
      },
    );
    return this.detail(id);
  }
}
