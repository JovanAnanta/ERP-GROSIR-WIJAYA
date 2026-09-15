import type { ProductLookupOption } from './purchasing.api';

export function formatPurchasingWarehouseStock(
  units: ProductLookupOption['units'],
) {
  const ordered = units
    .filter((unit) => unit.conversionFactor > 0)
    .toSorted((left, right) => right.conversionFactor - left.conversionFactor);
  if (!ordered.length) return '—';

  let remaining = Math.max(
    0,
    ordered[0].warehouseQty * ordered[0].conversionFactor,
  );
  const parts: string[] = [];
  ordered.forEach((unit, index) => {
    const quantity =
      index === ordered.length - 1
        ? Math.round((remaining / unit.conversionFactor) * 1e6) / 1e6
        : Math.floor(remaining / unit.conversionFactor + 1e-9);
    if (quantity > 0) {
      parts.push(
        `${quantity.toLocaleString('id-ID', { maximumFractionDigits: 6 })} ${unit.unitName}`,
      );
    }
    remaining = Math.max(0, remaining - quantity * unit.conversionFactor);
  });

  return parts.join(' ') || `0 ${ordered.at(-1)?.unitName ?? ''}`.trim();
}

export function getProductWarehouseDisplay(
  products: ProductLookupOption[],
  identity: { productId?: string; productUnitId?: string },
) {
  const product = identity.productId
    ? products.find((item) => item.productId === identity.productId)
    : products.find((item) =>
        item.units.some(
          (unit) => unit.productUnitId === identity.productUnitId,
        ),
      );
  return product ? formatPurchasingWarehouseStock(product.units) : '—';
}
