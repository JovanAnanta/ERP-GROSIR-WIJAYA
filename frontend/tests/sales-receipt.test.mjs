import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { transformSync } from "esbuild";

const source = readFileSync(
  new URL("../src/features/sales/sales-receipt.ts", import.meta.url),
  "utf8",
).replace(/^import .*\r?\n/gm, "");
const isolatedSource = `
const escapeReceiptHtml = (value) => String(value ?? "");
const createThermalPrintJob = () => { throw new Error("not used in this unit test"); };
const systemConfigApi = {};
${source}`;
const { code } = transformSync(isolatedSource, { loader: "ts", format: "esm" });
const { splitReceiptItems } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);

const items = Array.from({ length: 7 }, (_, index) => ({
  productName: `Produk ${index + 1}`,
  unitName: "PCS",
  quantity: 1,
  subtotal: 1_000,
}));

test("receipt can be split into two or three balanced complete copies", () => {
  assert.deepEqual(splitReceiptItems(items, 2).map((group) => group.length), [4, 3]);
  assert.deepEqual(splitReceiptItems(items, 3).map((group) => group.length), [3, 2, 2]);
  assert.equal(splitReceiptItems(items, 3).flat().length, items.length);
  assert.deepEqual(
    splitReceiptItems(items, 3).flat().map((item) => item.productName),
    items.map((item) => item.productName),
  );
});

test("receipt never creates empty extra pages", () => {
  assert.deepEqual(splitReceiptItems(items.slice(0, 1), 3).map((group) => group.length), [1]);
  assert.deepEqual(splitReceiptItems([], 3), [[]]);
});
