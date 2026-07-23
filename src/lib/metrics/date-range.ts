/**
 * Shared Compilado date-range helpers (query-time filters).
 */

export type DateFilterMode = "month" | "custom";

export type CompiladoDateRange = {
  start: string;
  end: string;
  mode: DateFilterMode;
  /** YYYY-MM when mode === "month" */
  month: string | null;
};

export type DateFilterSearchParams = {
  from?: string;
  to?: string;
  month?: string;
};

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidYearMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

export function monthKeyFromDate(value: string): string | null {
  if (value.length < 7) {
    return null;
  }
  return value.slice(0, 7);
}

export function startOfMonth(yearMonth: string): string {
  return `${yearMonth}-01`;
}

export function endOfMonth(yearMonth: string): string {
  const [yearRaw, monthRaw] = yearMonth.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${yearMonth}-${String(lastDay).padStart(2, "0")}`;
}

export function listYearMonthsBetween(
  start: string,
  end: string,
): string[] {
  const startMonth = monthKeyFromDate(start);
  const endMonth = monthKeyFromDate(end);
  if (!startMonth || !endMonth || startMonth > endMonth) {
    return [];
  }

  const months: string[] = [];
  let [year, month] = startMonth.split("-").map(Number);

  while (true) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    months.push(key);
    if (key === endMonth) {
      break;
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return months;
}

export function formatYearMonthLabel(yearMonth: string): string {
  const [year, monthPart] = yearMonth.split("-");
  const date = new Date(Number(year), Number(monthPart) - 1, 1);
  if (Number.isNaN(date.getTime())) {
    return yearMonth;
  }
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatDateRangeLabel(range: CompiladoDateRange): string {
  if (range.mode === "month" && range.month) {
    return formatYearMonthLabel(range.month);
  }
  return `${range.start} → ${range.end}`;
}

/**
 * Resolve active Compilado date filter from URL params + import metadata defaults.
 */
export function resolveCompiladoDateRange(input: {
  searchParams: DateFilterSearchParams;
  defaultStart: string | null;
  defaultEnd: string | null;
}): CompiladoDateRange {
  const { searchParams, defaultStart, defaultEnd } = input;
  const month = searchParams.month?.trim() ?? "";
  const from = searchParams.from?.trim() ?? "";
  const to = searchParams.to?.trim() ?? "";

  if (month && isValidYearMonth(month)) {
    return {
      mode: "month",
      month,
      start: startOfMonth(month),
      end: endOfMonth(month),
    };
  }

  if (from && to && isValidIsoDate(from) && isValidIsoDate(to) && to >= from) {
    return {
      mode: "custom",
      month: null,
      start: from,
      end: to,
    };
  }

  if (from && isValidIsoDate(from) && !to) {
    const fallbackEnd = defaultEnd && defaultEnd >= from ? defaultEnd : from;
    return {
      mode: "custom",
      month: null,
      start: from,
      end: fallbackEnd,
    };
  }

  if (defaultStart && defaultEnd) {
    const defaultMonth = monthKeyFromDate(defaultEnd) ?? monthKeyFromDate(defaultStart);
    if (defaultMonth) {
      const monthStart = startOfMonth(defaultMonth);
      const monthEnd = endOfMonth(defaultMonth);
      const clippedStart = monthStart < defaultStart ? defaultStart : monthStart;
      const clippedEnd = monthEnd > defaultEnd ? defaultEnd : monthEnd;
      if (clippedEnd >= clippedStart) {
        return {
          mode: "month",
          month: defaultMonth,
          start: clippedStart,
          end: clippedEnd,
        };
      }
    }

    return {
      mode: "custom",
      month: null,
      start: defaultStart,
      end: defaultEnd,
    };
  }

  const today = new Date();
  const yearMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  return {
    mode: "month",
    month: yearMonth,
    start: startOfMonth(yearMonth),
    end: endOfMonth(yearMonth),
  };
}
