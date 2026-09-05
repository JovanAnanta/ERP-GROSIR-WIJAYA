import type { SalesItemPayload, WhatsappImportRow } from "./sales.api";
export type SalesFormLine = SalesItemPayload & {
  key: string;
  productId: string;
  sourceText?: string;
  reviewPending?: boolean;
  reviewReasons?: string[];
  priceMissing?: boolean;
};

export function importedSalesLine(row: WhatsappImportRow): SalesFormLine {
  return {
    key: crypto.randomUUID(),
    productId: row.productId,
    productUnitId: row.productUnitId,
    quantity: row.quantity ?? 0,
    unitPrice: row.unitPrice ?? 0,
    discountAmount: 0,
    bonusQuantity: 0,
    note: "",
    sourceText: row.sourceText,
    reviewPending: row.reviewReasons.length > 0,
    reviewReasons: row.reviewReasons,
    priceMissing: row.unitPrice === null,
  };
}

export function editSalesLine(
  line: SalesFormLine,
  patch: Partial<SalesFormLine>,
): SalesFormLine {
  const changed = Object.entries(patch).some(
    ([key, value]) => line[key as keyof SalesFormLine] !== value,
  );
  return {
    ...line,
    ...patch,
    reviewPending: changed ? false : line.reviewPending,
    priceMissing:
      patch.priceMissing ??
      (patch.unitPrice !== undefined ? false : line.priceMissing),
  };
}

export function appendImportedLines(
  current: SalesFormLine[],
  added: SalesFormLine[],
) {
  const result = [...current];
  let cursor = 0;
  for (const row of added) {
    while (
      cursor < result.length &&
      (result[cursor].productId ||
        result[cursor].productUnitId ||
        result[cursor].sourceText ||
        result[cursor].note ||
        result[cursor].quantity ||
        result[cursor].unitPrice ||
        result[cursor].discountAmount ||
        result[cursor].bonusQuantity)
    )
      cursor++;
    if (cursor < result.length) result[cursor++] = row;
    else {
      result.push(row);
      cursor = result.length;
    }
  }
  return result;
}

export function importValidationError(lines: SalesFormLine[]): string {
  for (const [index, row] of lines.entries()) {
    if (!row.sourceText) continue;
    if (row.reviewPending)
      return `Periksa baris import ${index + 1} yang berwarna merah; perbaiki atau hapus jika bukan pesanan.`;
    if (
      !row.productUnitId ||
      !Number.isFinite(row.quantity) ||
      row.quantity <= 0
    )
      return `Baris import ${index + 1}: produk, satuan, dan jumlah wajib valid meskipun sudah diperiksa.`;
    if (
      row.priceMissing ||
      !Number.isFinite(row.unitPrice) ||
      row.unitPrice < 0
    )
      return `Baris import ${index + 1}: isi harga satuan.`;
  }
  return "";
}

export function salesLinePayload(line: SalesFormLine): SalesItemPayload {
  // Import metadata and original chat are form-only, never persisted in a document.
  return {
    productUnitId: line.productUnitId,
    salesOrderDetailId: line.salesOrderDetailId,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountAmount: line.discountAmount,
    bonusQuantity: line.bonusQuantity,
    note: line.note,
  };
}
