import { Prisma } from '../../../generated/prisma/client.js';
import { getPurchasingStockQuantities } from './purchase-stock.utils.js';

const decimal = (value: number) => new Prisma.Decimal(value);

describe('getPurchasingStockQuantities', () => {
  it('mengurangi barang yang sudah dikemas dari stok gudang', () => {
    const result = getPurchasingStockQuantities({
      actualQty: decimal(20),
      availableQty: decimal(15),
      packedQty: decimal(4),
      selectedConversionFactor: decimal(1),
      parentConversionFactor: decimal(1),
    });

    expect(result.warehouseQty.toNumber()).toBe(16);
    expect(result.availableQty.toNumber()).toBe(15);
  });

  it('mengonversi stok parent ke satuan yang dipilih', () => {
    const result = getPurchasingStockQuantities({
      actualQty: decimal(3),
      availableQty: decimal(2.5),
      packedQty: decimal(0.5),
      selectedConversionFactor: decimal(1),
      parentConversionFactor: decimal(12),
    });

    expect(result.warehouseQty.toNumber()).toBe(30);
    expect(result.availableQty.toNumber()).toBe(30);
  });

  it('mengembalikan nol ketika stok belum pernah dibuat', () => {
    const result = getPurchasingStockQuantities({
      actualQty: undefined,
      availableQty: undefined,
      packedQty: undefined,
      selectedConversionFactor: decimal(1),
      parentConversionFactor: decimal(1),
    });

    expect(result.warehouseQty.toNumber()).toBe(0);
    expect(result.availableQty.toNumber()).toBe(0);
  });
});
