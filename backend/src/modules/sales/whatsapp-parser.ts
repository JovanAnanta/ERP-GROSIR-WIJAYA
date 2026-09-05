import { normalizeAlias } from '../pricing/alias-normalization.js';

export interface ProductWord {
  key: string;
  productId: string;
  official: boolean;
}
export interface UnitWord {
  key: string;
  unitId: string;
  official: boolean;
}
export interface ParsedOrderLine {
  sourceText: string;
  productId: string | null;
  unitId: string | null;
  quantity: number | null;
  reviewReasons: string[];
}

export function orderTextLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[•*]\s+/, ''))
    .filter(Boolean);
}

// Prefix/suffix candidates cover the official format and legacy product-first orders.
// Bounded by line/word limits in the API; no scan of the full product catalog.
export function productCandidates(lines: string[]): string[] {
  const candidates = new Set<string>();
  for (const line of lines) {
    const words = normalizeAlias(line).split(' ');
    for (let i = 0; i < words.length; i++) {
      candidates.add(words.slice(i).join(' '));
      candidates.add(words.slice(0, i + 1).join(' '));
    }
  }
  return [...candidates];
}

function chooseWords<T extends { official: boolean }>(words: T[]): T[] {
  const official = words.filter((word) => word.official);
  return official.length ? official : words;
}

function parseAmounts(text: string, units: UnitWord[]) {
  const result: Array<{
    quantity: number | null;
    unitId: string | null;
    reasons: string[];
  }> = [];
  let rest = text.trim();
  if (!rest)
    return [
      {
        quantity: null,
        unitId: null,
        reasons: ['Jumlah belum diisi', 'Pilih satuan'],
      },
    ];
  while (rest) {
    const number = /^(-?\d+(?:[.,]\d+)?)/.exec(rest);
    if (!number)
      return [
        {
          quantity: null,
          unitId: null,
          reasons: ['Format jumlah/satuan perlu diperiksa'],
        },
      ];
    const quantity = Number(number[1].replace(',', '.'));
    rest = rest.slice(number[0].length).trim();
    const reasons: string[] = [];
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity > 999999999 ||
      Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 1e-6
    )
      reasons.push('Jumlah tidak valid');
    const matches = units.filter(
      (word) => rest === word.key || rest.startsWith(word.key + ' '),
    );
    const longest = Math.max(0, ...matches.map((word) => word.key.length));
    const matched = chooseWords(
      matches.filter((word) => word.key.length === longest),
    );
    const ids = [...new Set(matched.map((word) => word.unitId))];
    if (!ids.length) {
      result.push({
        quantity,
        unitId: null,
        reasons: [...reasons, rest ? 'Satuan tidak dikenali' : 'Pilih satuan'],
      });
      if (rest && /\d/.test(rest))
        result[result.length - 1].reasons.push(
          'Periksa kembali jumlah pada teks asli',
        );
      break;
    }
    result.push({
      quantity,
      unitId: ids.length === 1 ? ids[0] : null,
      reasons: ids.length === 1 ? reasons : [...reasons, 'Satuan ambigu'],
    });
    rest = rest.slice(longest).trim();
  }
  return result;
}

export function parseOrderText(
  lines: string[],
  products: ProductWord[],
  units: UnitWord[],
): ParsedOrderLine[] {
  const productMap = new Map<string, ProductWord[]>();
  for (const word of products)
    productMap.set(word.key, [...(productMap.get(word.key) ?? []), word]);
  return lines.flatMap<ParsedOrderLine>((sourceText) => {
    const normalized = normalizeAlias(sourceText);
    const candidates = productCandidates([sourceText])
      .filter((key) => productMap.has(key))
      .sort((a, b) => b.length - a.length);
    const longest = candidates[0]?.length;
    const matchedKeys = candidates.filter((key) => key.length === longest);
    const matches = matchedKeys.flatMap((key) =>
      chooseWords(productMap.get(key)!),
    );
    const productIds = [...new Set(matches.map((word) => word.productId))];
    if (productIds.length !== 1 || matchedKeys.length !== 1) {
      return [
        {
          sourceText,
          productId: null,
          unitId: null,
          quantity: null,
          reviewReasons: [
            productIds.length
              ? 'Produk ambigu; pilih produk'
              : 'Produk belum dikenali; pilih produk, jumlah dan satuan',
          ],
        },
      ];
    }
    const key = matchedKeys[0];
    const remainder =
      normalized === key
        ? ''
        : normalized.startsWith(key + ' ')
          ? normalized.slice(key.length)
          : normalized.slice(0, normalized.length - key.length);
    return parseAmounts(remainder, units).map((amount) => ({
      sourceText,
      productId: productIds[0],
      unitId: amount.unitId,
      quantity: amount.quantity,
      reviewReasons: amount.reasons,
    }));
  });
}
