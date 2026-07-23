export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function cellToString(value: unknown): string | null {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value).trim() || null;
}

export function parseNumber(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/h$/i, "")
    .replace(",", ".");

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDate(value: unknown): string | null {
  if (value == null || value === "") {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial date
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 24 * 60 * 60 * 1000);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  const asString = String(value).trim();
  if (!asString) {
    return null;
  }

  // dd/mm/yyyy or dd-mm-yyyy
  const brMatch = asString.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (brMatch) {
    const day = Number(brMatch[1]);
    const month = Number(brMatch[2]);
    let year = Number(brMatch[3]);
    if (year < 100) {
      year += 2000;
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  const parsed = new Date(asString);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

export function parseCategories(value: unknown): string[] {
  const asString = cellToString(value);
  if (!asString) {
    return [];
  }

  return asString
    .split(/[;,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function headerMatchesAlias(header: string, alias: string): boolean {
  const normalizedHeader = normalizeHeader(header);
  const normalizedAlias = normalizeHeader(alias);

  if (!normalizedHeader || !normalizedAlias) {
    return false;
  }

  return (
    normalizedHeader === normalizedAlias ||
    normalizedHeader.startsWith(`${normalizedAlias} `)
  );
}

export function findColumnIndex(
  headers: string[],
  aliases: string[],
): number {
  return headers.findIndex((header) =>
    aliases.some((alias) => headerMatchesAlias(header, alias)),
  );
}

export function pickColumn(
  row: unknown[],
  headers: string[],
  aliases: string[],
): unknown {
  const index = findColumnIndex(headers, aliases);
  if (index < 0) {
    return null;
  }

  return row[index];
}
