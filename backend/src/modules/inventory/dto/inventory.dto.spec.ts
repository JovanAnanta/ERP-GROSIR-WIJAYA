import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  InventoryListQueryDto,
  SaveAdjustmentDto,
  SaveOpnameDto,
} from './inventory.dto.js';

describe('Inventory DTO validation', () => {
  it('accepts separate warehouse and packed quantities for stock opname', async () => {
    const dto = plainToInstance(SaveOpnameDto, {
      opnameDate: '2026-08-30',
      status: 'DRAFT',
      items: [
        { productUnitId: '10', warehouseQty: 8, packedQty: 2, unitCost: 12500 },
      ],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects negative physical quantities', async () => {
    const dto = plainToInstance(SaveOpnameDto, {
      opnameDate: '2026-08-30',
      status: 'DRAFT',
      items: [{ productUnitId: '10', warehouseQty: -1, packedQty: 0 }],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects duplicate product units in one document', async () => {
    const dto = plainToInstance(SaveAdjustmentDto, {
      adjustmentDate: '2026-08-30',
      reason: 'Barang rusak',
      status: 'DRAFT',
      items: [
        { productUnitId: '10', direction: 'OUT', quantity: 1 },
        { productUnitId: '10', direction: 'OUT', quantity: 2 },
      ],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects an empty adjustment reason', async () => {
    const dto = plainToInstance(SaveAdjustmentDto, {
      adjustmentDate: '2026-08-30',
      reason: '',
      status: 'DRAFT',
      items: [
        { productUnitId: '10', direction: 'IN', quantity: 1, unitCost: 1000 },
      ],
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('accepts inventory date and product filter parameters', async () => {
    const dto = plainToInstance(InventoryListQueryDto, {
      page: '1',
      limit: '20',
      dateFrom: '2026-08-25',
      dateTo: '2026-09-01',
      categoryId: '2',
      brandId: '3',
      supplierId: '4',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects malformed inventory filter identifiers and dates', async () => {
    const dto = plainToInstance(InventoryListQueryDto, {
      dateFrom: 'not-a-date',
      categoryId: '0',
      supplierId: 'supplier',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
