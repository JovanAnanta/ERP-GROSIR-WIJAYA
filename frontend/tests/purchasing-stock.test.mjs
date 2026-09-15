import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { transformSync } from 'esbuild';

const source = readFileSync(
  new URL('../src/features/purchasing/purchasing-stock.ts', import.meta.url),
  'utf8',
);
const { code } = transformSync(source, { loader: 'ts', format: 'esm' });
const { formatPurchasingWarehouseStock, getProductWarehouseDisplay } =
  await import(
    `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  );

const units = [
  {
    productUnitId: '1',
    unitName: 'LUSIN',
    conversionFactor: 1,
    availableQty: 15,
    warehouseQty: 15,
  },
  {
    productUnitId: '2',
    unitName: 'DUS',
    conversionFactor: 12,
    availableQty: 1.25,
    warehouseQty: 1.25,
  },
];

test('stok gudang purchasing ditampilkan dari unit terbesar ke terkecil', () => {
  assert.equal(formatPurchasingWarehouseStock(units), '1 DUS 3 LUSIN');
});

test('stok langsung ditemukan ketika produk dipilih sebelum satuan', () => {
  assert.equal(
    getProductWarehouseDisplay(
      [{ productId: '10', productName: 'Produk A', units }],
      { productId: '10' },
    ),
    '1 DUS 3 LUSIN',
  );
});
