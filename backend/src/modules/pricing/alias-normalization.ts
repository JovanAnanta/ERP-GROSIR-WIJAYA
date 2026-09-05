export function normalizeAlias(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function displayAlias(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
