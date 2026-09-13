import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { transformSync } from "esbuild";

// Compile only this pure utility in memory; no server or database writes.
const source = readFileSync(
  new URL("../src/features/sales/sales-form.utils.ts", import.meta.url),
  "utf8",
);
const { code } = transformSync(source, { loader: "ts", format: "esm" });
const {
  defaultSalesAccount,
  resolveSalesPaymentAmount,
  formatSalesStock,
  salesOrderReference,
} = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);

test("KAS is selected even when a bank is the first account", () => {
  assert.equal(
    defaultSalesAccount([
      { financialAccountId: "1", accountName: "BANK", accountType: "BANK" },
      { financialAccountId: "2", accountName: " Kas ", accountType: "CASH" },
    ]),
    "2",
  );
});

test("falls back to a cash account, never silently to an arbitrary bank", () => {
  assert.equal(
    defaultSalesAccount([
      { financialAccountId: "3", accountName: "Kas Toko", accountType: "CASH" },
    ]),
    "3",
  );
  assert.equal(
    defaultSalesAccount([
      { financialAccountId: "1", accountName: "BANK", accountType: "BANK" },
    ]),
    "",
  );
  assert.equal(defaultSalesAccount([]), "");
});

test("payment follows total in auto mode and preserves a manually entered partial or zero payment", () => {
  assert.equal(resolveSalesPaymentAmount(100_000, null), 100_000);
  assert.equal(resolveSalesPaymentAmount(120_000, null), 120_000);
  assert.equal(resolveSalesPaymentAmount(120_000, 25_000), 25_000);
  assert.equal(resolveSalesPaymentAmount(120_000, 0), 0);
  assert.equal(resolveSalesPaymentAmount(120_000, null), 120_000);
});

test("stock is decomposed into largest to smallest units without mutating options", () => {
  const units = [
    { unitName: "PCS", conversionFactor: 1, availableQty: 182 },
    { unitName: "Dus", conversionFactor: 144, availableQty: 182 / 144 },
    { unitName: "Lusin", conversionFactor: 12, availableQty: 182 / 12 },
  ];
  assert.equal(formatSalesStock(units), "1 Dus 3 Lusin 2 PCS");
  assert.equal(units[0].unitName, "PCS");
  assert.equal(
    formatSalesStock([
      { unitName: "KG", conversionFactor: 1, availableQty: 0.25 },
    ]),
    "0,25 KG",
  );
  assert.equal(
    formatSalesStock([
      { unitName: "PCS", conversionFactor: 1, availableQty: 0 },
    ]),
    "0 PCS",
  );
  assert.equal(formatSalesStock([]), "—");
});

test("SO reference copies document and line fields but only unfulfilled quantities; no payment is copied", () => {
  const order = {
    customerId: "10",
    customerName: "Customer A",
    salesChannel: "WHATSAPP",
    discountAmount: 5000,
    note: "Antar sore",
    details: [
      {
        salesOrderDetailId: "101",
        productUnitId: "22",
        quantity: 10,
        remainingQuantity: 5,
        bonusQuantity: 2,
        remainingBonusQuantity: 1,
        unitPrice: 12000,
        discountAmount: 2000,
        note: "Pisahkan kemasan",
      },
      {
        salesOrderDetailId: "102",
        productUnitId: "23",
        quantity: 10,
        remainingQuantity: 0,
        bonusQuantity: 0,
      },
    ],
  };
  const result = salesOrderReference(order);
  assert.deepEqual(result, {
    customerId: "10",
    customerName: "Customer A",
    salesChannel: "WHATSAPP",
    discountAmount: 5000,
    note: "Antar sore",
    items: [
      {
        salesOrderDetailId: "101",
        productUnitId: "22",
        quantity: 5,
        bonusQuantity: 1,
        unitPrice: 12000,
        discountAmount: 1000,
        note: "Pisahkan kemasan",
      },
    ],
  });
  assert.equal(order.details[0].quantity, 10);
  assert.equal("payments" in result, false);
});

test("a named Guest SO stays Guest when referenced", () => {
  const result = salesOrderReference({
    customerId: null,
    customerName: "Pembeli Toko",
    salesChannel: "MANUAL",
    discountAmount: 0,
    details: [],
  });
  assert.equal(result.customerId, "");
  assert.equal(result.customerName, "Pembeli Toko");
});
