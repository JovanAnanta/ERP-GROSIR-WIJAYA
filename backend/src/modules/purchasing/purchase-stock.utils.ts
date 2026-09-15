import { Prisma } from '../../../generated/prisma/client.js';

const ZERO = new Prisma.Decimal(0);

type StockValue = Prisma.Decimal | null | undefined;

export function getPurchasingStockQuantities(input: {
  actualQty: StockValue;
  availableQty: StockValue;
  packedQty: StockValue;
  selectedConversionFactor: Prisma.Decimal;
  parentConversionFactor: Prisma.Decimal;
}) {
  if (
    input.selectedConversionFactor.lessThanOrEqualTo(ZERO) ||
    input.parentConversionFactor.lessThanOrEqualTo(ZERO)
  ) {
    throw new Error('Konversi satuan produk tidak valid.');
  }

  const toSelectedUnit = (parentQuantity: StockValue) =>
    (parentQuantity ?? ZERO)
      .mul(input.parentConversionFactor)
      .div(input.selectedConversionFactor);

  return {
    availableQty: toSelectedUnit(input.availableQty),
    warehouseQty: toSelectedUnit(
      (input.actualQty ?? ZERO).sub(input.packedQty ?? ZERO),
    ),
  };
}
