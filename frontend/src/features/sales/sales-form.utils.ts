import type {
  SalesFinancialAccount,
  SalesProductUnit,
  SalesOrderDocument,
  SalesItemPayload,
} from "./sales.api";

export function salesOrderReference(order: SalesOrderDocument) {
  const items: SalesItemPayload[] = order.details
    .filter((line) => (line.remainingQuantity ?? line.quantity) > 0)
    .map((line) => ({
      productUnitId: line.productUnitId,
      salesOrderDetailId: line.salesOrderDetailId ?? undefined,
      quantity: line.remainingQuantity ?? line.quantity,
      bonusQuantity: line.remainingBonusQuantity ?? line.bonusQuantity,
      unitPrice: line.unitPrice,
      discountAmount: line.discountAmount,
      note: line.note ?? "",
    }));
  return {
    customerId: order.customerId ?? "",
    customerName: order.customerName,
    salesChannel: order.salesChannel,
    discountAmount: order.discountAmount,
    note: order.note ?? "",
    items,
  };
}

export function defaultSalesAccount(accounts: SalesFinancialAccount[]) {
  return (
    (
      accounts.find(
        (account) => account.accountName.trim().toUpperCase() === "KAS",
      ) ?? accounts.find((account) => account.accountType === "CASH")
    )?.financialAccountId ?? ""
  );
}

export function resolveSalesPaymentAmount(
  total: number,
  override: number | null,
) {
  return override === null ? Math.max(0, total) : override;
}

export function formatSalesStock(units: SalesProductUnit[]) {
  const ordered = units
    .filter((unit) => unit.conversionFactor > 0)
    .toSorted((a, b) => b.conversionFactor - a.conversionFactor);
  if (!ordered.length) return "—";
  let remaining = Math.max(
    0,
    ordered[0].availableQty * ordered[0].conversionFactor,
  );
  const parts: string[] = [];
  ordered.forEach((unit, index) => {
    const quantity =
      index === ordered.length - 1
        ? Math.round((remaining / unit.conversionFactor) * 1e6) / 1e6
        : Math.floor(remaining / unit.conversionFactor + 1e-9);
    if (quantity > 0)
      parts.push(
        `${quantity.toLocaleString("id-ID", { maximumFractionDigits: 6 })} ${unit.unitName}`,
      );
    remaining = Math.max(0, remaining - quantity * unit.conversionFactor);
  });
  return parts.join(" ") || `0 ${ordered[ordered.length - 1].unitName}`;
}
