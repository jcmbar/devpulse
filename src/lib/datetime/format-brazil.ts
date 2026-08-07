/**
 * Display helpers for instants stored in UTC.
 * Always format with America/Sao_Paulo — never rely on server/runtime local TZ
 * (Vercel/Node default is UTC; browser local can differ).
 */

export const APP_DISPLAY_TIME_ZONE = "America/Sao_Paulo";
export const APP_DISPLAY_LOCALE = "pt-BR";

export type InstantInput = string | number | Date | null | undefined;

/**
 * Parse DB/API timestamps into a Date.
 * Naive strings (no Z/offset) are treated as UTC wall time.
 */
export function parseInstant(value: InstantInput): Date | null {
  if (value == null || value === "") {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const raw = value.trim();
  if (!raw) {
    return null;
  }

  // Calendar date only (YYYY-MM-DD) — noon UTC avoids off-by-one in SP.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T12:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw);
  const normalized = hasZone
    ? raw
    : raw.includes("T")
      ? `${raw}Z`
      : `${raw.replace(" ", "T")}Z`;

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

const dateTimeFormatter = new Intl.DateTimeFormat(APP_DISPLAY_LOCALE, {
  timeZone: APP_DISPLAY_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dateTimeShortFormatter = new Intl.DateTimeFormat(APP_DISPLAY_LOCALE, {
  timeZone: APP_DISPLAY_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat(APP_DISPLAY_LOCALE, {
  timeZone: APP_DISPLAY_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat(APP_DISPLAY_LOCALE, {
  timeZone: APP_DISPLAY_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** dd/MM/yyyy, HH:mm:ss in America/Sao_Paulo */
export function formatDateTimeBrazil(
  value: InstantInput,
  fallback = "—",
): string {
  const date = parseInstant(value);
  if (!date) {
    return fallback;
  }
  return dateTimeFormatter.format(date);
}

/** dd/MM/yyyy, HH:mm (no seconds) */
export function formatDateTimeShortBrazil(
  value: InstantInput,
  fallback = "—",
): string {
  const date = parseInstant(value);
  if (!date) {
    return fallback;
  }
  return dateTimeShortFormatter.format(date);
}

/** dd/MM/yyyy */
export function formatDateBrazil(
  value: InstantInput,
  fallback = "—",
): string {
  const date = parseInstant(value);
  if (!date) {
    return fallback;
  }
  return dateFormatter.format(date);
}

/** HH:mm:ss */
export function formatTimeBrazil(
  value: InstantInput,
  fallback = "—",
): string {
  const date = parseInstant(value);
  if (!date) {
    return fallback;
  }
  return timeFormatter.format(date);
}
