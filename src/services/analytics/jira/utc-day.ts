/**
 * UTC calendar-day helpers for flow daily facts.
 * All day boundaries are UTC — do not mix board/local TZ in v1/v2 phase 1.
 */

export function toUtcDayString(input: Date | string): string {
  const date = typeof input === "string" ? new Date(input) : input;
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Data inválida para dia UTC: ${String(input)}`);
  }
  return date.toISOString().slice(0, 10);
}

/** Inclusive start of UTC day: YYYY-MM-DDT00:00:00.000Z */
export function utcDayStartMs(day: string): number {
  const ms = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) {
    throw new Error(`Dia UTC inválido: ${day}`);
  }
  return ms;
}

/** Inclusive end of UTC day: YYYY-MM-DDT23:59:59.999Z */
export function utcDayEndMs(day: string): number {
  const ms = Date.parse(`${day}T23:59:59.999Z`);
  if (!Number.isFinite(ms)) {
    throw new Error(`Dia UTC inválido: ${day}`);
  }
  return ms;
}

export function utcDayEndDate(day: string): Date {
  return new Date(utcDayEndMs(day));
}

/** List inclusive UTC days from fromDay to toDay (YYYY-MM-DD). */
export function eachUtcDay(fromDay: string, toDay: string): string[] {
  const start = utcDayStartMs(fromDay);
  const end = utcDayStartMs(toDay);
  if (end < start) {
    return [];
  }
  const days: string[] = [];
  for (let cursor = start; cursor <= end; cursor += 86_400_000) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return days;
}

export function addUtcDays(day: string, delta: number): string {
  const ms = utcDayStartMs(day) + delta * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
