import { Prisma } from '../../../generated/prisma/client.js';

export interface DisplayUnit {
  productUnitId?: bigint;
  conversionFactor: Prisma.Decimal;
  displayOrder?: number;
  unit: { unitName: string };
}

export function formatStockQuantity(baseQty: number, units: DisplayUnit[]) {
  const sorted = [...units].sort(
    (left, right) =>
      Number(right.conversionFactor) - Number(left.conversionFactor),
  );
  let remaining = baseQty;
  const parts: string[] = [];
  for (const [index, item] of sorted.entries()) {
    const factor = Number(item.conversionFactor);
    if (factor <= 0 || remaining + Number.EPSILON < factor) continue;
    const isSmallestUnit = index === sorted.length - 1;
    const quantity = isSmallestUnit
      ? Number((remaining / factor).toFixed(3))
      : Math.floor((remaining + Number.EPSILON) / factor);
    if (quantity > 0) {
      parts.push(`${quantity.toLocaleString('id-ID')} ${item.unit.unitName}`);
    }
    remaining = Number((remaining - quantity * factor).toFixed(3));
  }
  if (remaining > 0 && sorted.length) {
    parts.push(
      `${remaining.toLocaleString('id-ID')} ${sorted.at(-1)?.unit.unitName ?? ''}`,
    );
  }
  return parts.length
    ? parts.join(' ')
    : `0 ${sorted.at(-1)?.unit.unitName ?? ''}`.trim();
}

export function calculateUnitCosts(
  parentUnitCost: Prisma.Decimal,
  parentFactor: Prisma.Decimal,
  units: DisplayUnit[],
) {
  if (parentFactor.lessThanOrEqualTo(0)) return [];
  return [...units]
    .sort(
      (left, right) =>
        Number(right.conversionFactor) - Number(left.conversionFactor),
    )
    .filter((item) => item.conversionFactor.greaterThan(0))
    .map((item) => ({
      productUnitId: item.productUnitId,
      unitName: item.unit.unitName,
      unitCost: Number(
        parentUnitCost
          .mul(item.conversionFactor)
          .div(parentFactor)
          .toDecimalPlaces(2),
      ),
    }));
}
