/**
 * Business-day helpers equivalent to Excel NETWORKDAYS.INTL(..., 1)
 * (Saturday + Sunday as weekend).
 */

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay(); // 0=Sun … 6=Sat
  return day === 0 || day === 6;
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Count business days from start to end inclusive, matching Excel NETWORKDAYS.INTL.
 */
export function networkDaysIntl(
  startIso: string,
  endIso: string,
): number {
  let start = parseIsoDate(startIso);
  let end = parseIsoDate(endIso);

  if (start.getTime() > end.getTime()) {
    const tmp = start;
    start = end;
    end = tmp;
  }

  let count = 0;
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addUtcDays(cursor, 1)) {
    if (!isWeekend(cursor)) {
      count += 1;
    }
  }

  return count;
}

/**
 * Delay rule from Compilado/Base JIRA:
 * - delivery == due → 0
 * - delivery > due → NETWORKDAYS.INTL(due, delivery, 1) - 1  (positive = late)
 * - delivery < due → -(NETWORKDAYS.INTL(delivery, due, 1) - 1) (negative = early)
 */
export function computeBusinessDayDelay(input: {
  dueOn: string | null;
  deliveryOn: string | null;
}): number | null {
  const { dueOn, deliveryOn } = input;

  if (!dueOn || !deliveryOn) {
    return null;
  }

  if (dueOn === deliveryOn) {
    return 0;
  }

  if (deliveryOn > dueOn) {
    return networkDaysIntl(dueOn, deliveryOn) - 1;
  }

  return -(networkDaysIntl(deliveryOn, dueOn) - 1);
}

export function listDatesInMonth(year: number, month: number): string[] {
  const dates: string[] = [];
  let cursor = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  while (cursor.getTime() <= end.getTime()) {
    dates.push(toIsoDate(cursor));
    cursor = addUtcDays(cursor, 1);
  }

  return dates;
}

/** Inclusive ISO date list for [startIso, endIso]. Empty if start > end. */
export function listDatesInRange(startIso: string, endIso: string): string[] {
  let start = parseIsoDate(startIso);
  let end = parseIsoDate(endIso);

  if (start.getTime() > end.getTime()) {
    return [];
  }

  const dates: string[] = [];
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addUtcDays(cursor, 1)) {
    dates.push(toIsoDate(cursor));
  }
  return dates;
}

export function clampIsoDateRange(
  rangeStart: string,
  rangeEnd: string,
  clipStart: string,
  clipEnd: string,
): { start: string; end: string } | null {
  const start = rangeStart > clipStart ? rangeStart : clipStart;
  const end = rangeEnd < clipEnd ? rangeEnd : clipEnd;
  if (start > end) {
    return null;
  }
  return { start, end };
}

/** ISO weekday: 1=Mon … 7=Sun */
export function isoWeekday(isoDate: string): number {
  const day = parseIsoDate(isoDate).getUTCDay(); // 0=Sun
  return day === 0 ? 7 : day;
}
