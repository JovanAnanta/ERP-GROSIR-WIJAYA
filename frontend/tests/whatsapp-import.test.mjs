import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { transformSync } from "esbuild";
const source = readFileSync(
  new URL("../src/features/sales/whatsapp-import.utils.ts", import.meta.url),
  "utf8",
);
const { code } = transformSync(source, { loader: "ts", format: "esm" });
const {
  importedSalesLine,
  editSalesLine,
  appendImportedLines,
  importValidationError,
  salesLinePayload,
  splitSalesFormLine,
} = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
const row = (patch = {}) =>
  importedSalesLine({
    sourceText: "s mild 16 3",
    productId: "1",
    productName: "S Mild 16",
    productUnitId: "2",
    quantity: 3,
    unitPrice: 10000,
    reviewReasons: ["Satuan dari histori; periksa kembali"],
    ...patch,
  });

test("uncertain rows start red; changing one value acknowledges review", () => {
  const original = row();
  assert.equal(original.reviewPending, true);
  assert.equal(
    editSalesLine(original, { quantity: original.quantity }).reviewPending,
    true,
  );
  const checked = editSalesLine(original, { note: "Sudah dicek" });
  assert.equal(checked.reviewPending, false);
  assert.equal(importValidationError([checked]), "");
});
test("white/acknowledged rows still cannot save missing product, qty or price", () => {
  const missing = row({ productUnitId: "", quantity: null, unitPrice: null });
  const checked = editSalesLine(missing, { note: "Sudah dicek" });
  assert.equal(checked.reviewPending, false);
  assert.notEqual(importValidationError([checked]), "");
  const filled = editSalesLine(checked, { productUnitId: "2", quantity: 3 });
  assert.match(importValidationError([filled]), /harga/i);
  assert.equal(
    importValidationError([editSalesLine(filled, { unitPrice: 10000 })]),
    "",
  );
});
test("complete exact matches start white", () => {
  assert.equal(row({ reviewReasons: [] }).reviewPending, false);
});
test("import occupies truly empty rows before adding; old data and unknown imported lines are never overwritten", () => {
  const old = { ...row(), note: "Pertahankan" };
  const empty = {
    key: "blank",
    productId: "",
    productUnitId: "",
    quantity: 0,
    unitPrice: 0,
    discountAmount: 0,
    bonusQuantity: 0,
    note: "",
  };
  const unknown = row({ productId: "", productUnitId: "", quantity: null });
  const a = row(),
    b = row();
  const result = appendImportedLines([old, empty, unknown], [a, b]);
  assert.deepEqual(result, [old, a, unknown, b]);
  assert.equal(empty.productId, "");
});
test("request payload never includes chat, review state or price flags", () => {
  const payload = salesLinePayload(row());
  for (const key of [
    "sourceText",
    "reviewReasons",
    "reviewPending",
    "priceMissing",
    "productId",
    "key",
  ])
    assert.equal(key in payload, false);
  assert.equal(payload.quantity, 3);
});

test("a product can be split between SI and SO without losing quantity, bonus, or line discount", () => {
  const original = {
    ...row({ quantity: 5 }),
    quantity: 5,
    bonusQuantity: 2,
    discountAmount: 5_000,
  };
  const { invoiceLine, orderLine } = splitSalesFormLine(original, 2, 1);
  assert.equal(invoiceLine.quantity, 3);
  assert.equal(orderLine.quantity, 2);
  assert.equal(invoiceLine.quantity + orderLine.quantity, original.quantity);
  assert.equal(invoiceLine.bonusQuantity + orderLine.bonusQuantity, 2);
  assert.equal(invoiceLine.discountAmount + orderLine.discountAmount, 5_000);
  assert.equal(orderLine.productUnitId, original.productUnitId);
  assert.equal(orderLine.unitPrice, original.unitPrice);
  assert.equal(orderLine.salesOrderDetailId, undefined);
});

test("split rejects zero, full, excessive, and invalid bonus allocations", () => {
  const original = { ...row({ quantity: 5 }), bonusQuantity: 1 };
  for (const quantity of [0, 5, 6])
    assert.throws(() => splitSalesFormLine(original, quantity), /tidak valid/i);
  assert.throws(() => splitSalesFormLine(original, 2, 2), /tidak valid/i);
});
