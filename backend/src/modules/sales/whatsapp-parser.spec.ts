import {
  parseOrderText,
  orderTextLines,
  productCandidates,
  type ProductWord,
  type UnitWord,
} from './whatsapp-parser.js';

const products: ProductWord[] = [
  { key: 'jck', productId: '1', official: false },
  { key: 's mild 16', productId: '2', official: false },
  { key: '76 apel', productId: '3', official: true },
  { key: 'eko 1000 siwak', productId: '4', official: false },
  { key: 'camel ungu 12', productId: '5', official: false },
  { key: 'magnum filter', productId: '6', official: true },
  { key: 'so yumi baso', productId: '7', official: true },
];
const units: UnitWord[] = [
  { key: 'bal', unitId: '1', official: true },
  { key: 'pak', unitId: '2', official: true },
  { key: 'pk', unitId: '2', official: false },
  { key: 'kg', unitId: '3', official: true },
];
const parse = (text: string) =>
  parseOrderText(orderTextLines(text), products, units);

describe('WhatsApp order parser (no persistence)', () => {
  it('accepts official format with case-insensitive aliases and repeated spaces', () => {
    expect(parse('  3   BAL  JCK  ')[0]).toMatchObject({
      productId: '1',
      unitId: '1',
      quantity: 3,
      reviewReasons: [],
    });
  });
  it.each(['Jck 3bal', 'jck 3 bal'])(
    'accepts legacy compact quantities: %s',
    (text) => {
      expect(parse(text)[0]).toMatchObject({
        productId: '1',
        quantity: 3,
        unitId: '1',
        reviewReasons: [],
      });
    },
  );
  it('preserves numeric product variants and does not invent quantities', () => {
    expect(parse('S mild 16 3')[0]).toMatchObject({
      productId: '2',
      quantity: 3,
      unitId: null,
    });
    expect(parse('76 apel 5 pak')[0]).toMatchObject({
      productId: '3',
      quantity: 5,
      unitId: '2',
    });
    expect(parse('Eko 1000 siwak 3')[0]).toMatchObject({
      productId: '4',
      quantity: 3,
    });
    expect(parse('Camel ungu 12')[0]).toMatchObject({
      productId: '5',
      quantity: null,
    });
    expect(parse('So YUMI baso')[0].quantity).toBeNull();
  });
  it('keeps mixed units separate and preserves the original text for review', () => {
    const rows = parse('Magnum filter 1 bal 5 pak');
    expect(
      rows.map((row) => [row.productId, row.quantity, row.unitId]),
    ).toEqual([
      ['6', 1, '1'],
      ['6', 5, '2'],
    ]);
    expect(
      rows.every(
        (row) =>
          row.sourceText === 'Magnum filter 1 bal 5 pak' &&
          !row.reviewReasons.length,
      ),
    ).toBe(true);
  });
  it('keeps every unknown or conversational line for manual review', () => {
    const rows = parse('produk tak dikenal 3\ntolong cepat ya');
    expect(rows).toHaveLength(2);
    expect(
      rows.every((row) => row.productId === null && row.reviewReasons.length),
    ).toBe(true);
  });
  it.each(['0 bal jck', '-2 bal jck', '1,0001 bal jck'])(
    'flags invalid quantities: %s',
    (text) => {
      expect(parse(text)[0].reviewReasons).toContain('Jumlah tidak valid');
    },
  );
  it('accepts fractional quantities and unit aliases', () => {
    expect(parse('0,5 kg jck')[0]).toMatchObject({
      quantity: 0.5,
      unitId: '3',
    });
    expect(parse('2 pk jck')[0].unitId).toBe('2');
  });
  it('never chooses the first product in ambiguous matches', () => {
    const result = parseOrderText(
      ['3 bal jck'],
      [...products, { key: 'jck', productId: '9', official: false }],
      units,
    );
    expect(result[0].productId).toBeNull();
    expect(result[0].reviewReasons).toContain('Produk ambigu; pilih produk');
  });
  it('prefers the official name over an alias for the same spelling', () => {
    const result = parseOrderText(
      ['3 bal jck'],
      [...products, { key: 'jck', productId: '9', official: true }],
      units,
    );
    expect(result[0].productId).toBe('9');
  });
  it('bounds candidate generation to prefixes and suffixes', () => {
    expect(productCandidates(['3 bal jck'])).toEqual(
      expect.arrayContaining(['jck', '3 bal jck']),
    );
    expect(productCandidates(['3 bal jck']).length).toBeLessThanOrEqual(6);
  });
});
