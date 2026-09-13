/**
 * Standard utility for formatting numbers with Indonesian thousand separator (.)
 * and currency display across the ERP frontend.
 */

/**
 * Formats a number with Indonesian thousand dot separator (e.g. 15000 -> "15.000", 1500000 -> "1.500.000")
 */
export function formatThousand(value: number | string | null | undefined, allowDecimal = false): string {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'string' ? parseFormattedNumber(value) : value;
  if (isNaN(num)) return '';

  if (allowDecimal && String(value).includes(',')) {
    const parts = String(value).split(',');
    const integerPart = Math.floor(Math.abs(Number(parts[0].replace(/\./g, ''))));
    const sign = num < 0 ? '-' : '';
    const formattedInteger = integerPart.toLocaleString('id-ID');
    return `${sign}${formattedInteger},${parts[1] ?? ''}`;
  }

  const isDecimal = num % 1 !== 0;
  if (allowDecimal && isDecimal) {
    return num.toLocaleString('id-ID', {
      maximumFractionDigits: 3,
    });
  }

  return Math.round(num).toLocaleString('id-ID');
}

/**
 * Formats a number as Indonesian Rupiah (e.g. 15000 -> "Rp 15.000")
 */
export function formatRupiah(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Rp 0';
  const num = typeof value === 'string' ? parseFormattedNumber(value) : value;
  if (isNaN(num)) return 'Rp 0';
  return `Rp ${Math.round(num).toLocaleString('id-ID')}`;
}

/**
 * Parses a string with thousand dots into a clean JavaScript number
 * Handles both "15.000" -> 15000 and "15.000,50" -> 15000.5
 */
export function parseFormattedNumber(text: string | number | null | undefined): number {
  if (text === null || text === undefined || text === '') return 0;
  if (typeof text === 'number') return isNaN(text) ? 0 : text;
  
  const clean = text.toString().trim().replace(/[^\d,.-]/g, '');
  const usesIndonesianDecimal = clean.includes(',');
  const isIndonesianGroupedInteger = /^-?\d{1,3}(\.\d{3})+$/.test(clean);
  const standardDecimal = usesIndonesianDecimal
    ? clean.replace(/\./g, '').replace(',', '.')
    : isIndonesianGroupedInteger
      ? clean.replace(/\./g, '')
      : clean;
  const parsed = parseFloat(standardDecimal);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parses text typed into an Indonesian numeric field. Unlike API decimal
 * values, every dot in interactive input is a thousands separator and a
 * comma is the decimal separator. Keeping this separate prevents a transient
 * value such as `2.0000` (produced while appending a digit to `2.000`) from
 * being interpreted as the decimal number 2.
 */
export function parseIndonesianNumberInput(
  text: string | number | null | undefined,
  allowDecimal = false,
): number {
  if (text === null || text === undefined || text === '') return 0;
  if (typeof text === 'number') return Number.isFinite(text) ? text : 0;

  const clean = text.trim().replace(/[^\d,.-]/g, '');
  if (!clean || clean === '-') return 0;

  const negative = clean.startsWith('-');
  const unsigned = clean.replace(/-/g, '');
  const [integerText, ...decimalParts] = unsigned.split(',');
  const integerDigits = integerText.replace(/\./g, '') || '0';
  const decimalDigits = allowDecimal
    ? decimalParts.join('').replace(/\D/g, '').slice(0, 3)
    : '';
  const normalized = `${negative ? '-' : ''}${integerDigits}${decimalDigits ? `.${decimalDigits}` : ''}`;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Formats an in-progress Indonesian numeric input without losing its value. */
export function formatIndonesianNumberInput(
  text: string,
  allowDecimal = false,
): string {
  const clean = text.trim().replace(/[^\d,.-]/g, '');
  if (!clean || clean === '-') return clean;

  const value = parseIndonesianNumberInput(clean, allowDecimal);
  const negative = value < 0 || clean.startsWith('-');
  const unsigned = clean.replace(/-/g, '');
  const [integerText, ...decimalParts] = unsigned.split(',');
  const integerDigits = integerText.replace(/\./g, '').replace(/^0+(?=\d)/, '') || '0';
  const groupedInteger = Number(integerDigits).toLocaleString('id-ID');

  if (!allowDecimal || !clean.includes(',')) {
    return `${negative ? '-' : ''}${groupedInteger}`;
  }

  const decimalDigits = decimalParts.join('').replace(/\D/g, '').slice(0, 3);
  return `${negative ? '-' : ''}${groupedInteger},${decimalDigits}`;
}
