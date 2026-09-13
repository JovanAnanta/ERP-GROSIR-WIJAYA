import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { transformSync } from "esbuild";

const source = readFileSync(
  new URL("../src/utils/format.ts", import.meta.url),
  "utf8",
);
const { code } = transformSync(source, { loader: "ts", format: "esm" });
const {
  formatIndonesianNumberInput,
  formatRupiah,
  formatThousand,
  parseFormattedNumber,
  parseIndonesianNumberInput,
} = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);

test("formats Indonesian thousands without corrupting API decimal strings", () => {
  assert.equal(formatThousand(15000), "15.000");
  assert.equal(formatThousand("15000.50", true), "15.000,5");
  assert.equal(formatRupiah("15000.00"), "Rp 15.000");
});

test("parses UI formatted values and API decimal values", () => {
  assert.equal(parseFormattedNumber("Rp 15.000"), 15000);
  assert.equal(parseFormattedNumber("15.000,50"), 15000.5);
  assert.equal(parseFormattedNumber("15000.50"), 15000.5);
});

test("keeps appending digits after an Indonesian thousands separator", () => {
  assert.equal(parseIndonesianNumberInput("2.0000"), 20000);
  assert.equal(formatIndonesianNumberInput("2.0000"), "20.000");
  assert.equal(formatIndonesianNumberInput("20.0000"), "200.000");
});

test("uses comma, not dot, as decimal separator in interactive input", () => {
  assert.equal(parseIndonesianNumberInput("1.234,5", true), 1234.5);
  assert.equal(formatIndonesianNumberInput("1.234,50", true), "1.234,50");
  assert.equal(formatIndonesianNumberInput("12,", true), "12,");
});
