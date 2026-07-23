/**
 * Period capacity / proration helpers.
 *
 * Model: monthly capacity is derived from weekday hour weights
 * (Compilado K22:N30). Active holidays zero the weight of that date.
 *
 * Team default for a range = sum of weekday hours in the range,
 * skipping holiday dates.
 *
 * Monthly overrides scale as:
 *   override * (weightInRangeWithHolidays / weightFullMonthWithoutHolidays)
 * so a closed month with holidays yields less than the raw override,
 * and partial ranges stay proportional to the “full month before holidays”.
 *
 * Fallback when raw full-month weekday weight is 0: calendar-day ratio
 * (excluding holidays).
 */

import {
  clampIsoDateRange,
  isoWeekday,
  listDatesInMonth,
  listDatesInRange,
} from "@/lib/metrics/business-days";
import {
  endOfMonth,
  listYearMonthsBetween,
  startOfMonth,
} from "@/lib/metrics/date-range";
import type { CapacitySource, CapacityWeekdayHours } from "@/types/capacity";

export type CapacityMonthSegment = {
  yearMonth: string;
  year: number;
  month: number;
  hours: number;
  source: "override" | "team_default";
  weightInRange: number;
  weightFullMonth: number;
};

export type HolidayCapacityImpact = {
  /** Holidays in the filter range that would have carried weekday hours. */
  impactingHolidays: Array<{ date: string; hoursExcluded: number }>;
  hoursExcluded: number;
  affected: boolean;
};

export type ProratedCapacityResult = {
  requiredHours: number | null;
  source: CapacitySource;
  segments: CapacityMonthSegment[];
  spansMultipleMonths: boolean;
  holidayImpact: HolidayCapacityImpact;
};

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function hoursByWeekdayMap(
  weekdayHours: CapacityWeekdayHours[],
): Map<number, number> {
  return new Map(
    weekdayHours.map((row) => [row.weekday, Number(row.hours_per_day)]),
  );
}

function emptyHolidayImpact(): HolidayCapacityImpact {
  return { impactingHolidays: [], hoursExcluded: 0, affected: false };
}

function isHoliday(
  isoDate: string,
  holidayDates: Set<string> | undefined,
): boolean {
  return holidayDates != null && holidayDates.has(isoDate);
}

/** Sum of configured weekday hours for each day in an inclusive range. */
export function sumWeekdayHoursInRange(
  rangeStart: string,
  rangeEnd: string,
  weekdayHours: CapacityWeekdayHours[],
  holidayDates?: Set<string>,
): number {
  if (weekdayHours.length === 0 || rangeStart > rangeEnd) {
    return 0;
  }

  const byWeekday = hoursByWeekdayMap(weekdayHours);
  let total = 0;
  for (const isoDate of listDatesInRange(rangeStart, rangeEnd)) {
    if (isHoliday(isoDate, holidayDates)) {
      continue;
    }
    total += byWeekday.get(isoWeekday(isoDate)) ?? 0;
  }
  return roundHours(total);
}

/**
 * Hours that holidays removed from the range (only days with weekday load > 0).
 */
export function computeHolidayCapacityImpact(
  rangeStart: string,
  rangeEnd: string,
  weekdayHours: CapacityWeekdayHours[],
  holidayDates: Set<string>,
): HolidayCapacityImpact {
  if (
    weekdayHours.length === 0 ||
    holidayDates.size === 0 ||
    rangeStart > rangeEnd
  ) {
    return emptyHolidayImpact();
  }

  const byWeekday = hoursByWeekdayMap(weekdayHours);
  const impactingHolidays: HolidayCapacityImpact["impactingHolidays"] = [];
  let hoursExcluded = 0;

  for (const isoDate of listDatesInRange(rangeStart, rangeEnd)) {
    if (!holidayDates.has(isoDate)) {
      continue;
    }
    const hours = byWeekday.get(isoWeekday(isoDate)) ?? 0;
    if (hours <= 0) {
      continue;
    }
    hoursExcluded += hours;
    impactingHolidays.push({ date: isoDate, hoursExcluded: hours });
  }

  return {
    impactingHolidays,
    hoursExcluded: roundHours(hoursExcluded),
    affected: impactingHolidays.length > 0,
  };
}

/**
 * Monthly required hours from weekday defaults (Compilado K22:N30),
 * optionally excluding holidays.
 */
export function computeMonthlyRequiredHours(
  year: number,
  month: number,
  weekdayHours: CapacityWeekdayHours[],
  holidayDates?: Set<string>,
): number {
  const dates = listDatesInMonth(year, month);
  if (dates.length === 0) {
    return 0;
  }
  return sumWeekdayHoursInRange(
    dates[0],
    dates[dates.length - 1],
    weekdayHours,
    holidayDates,
  );
}

function calendarDayCount(
  start: string,
  end: string,
  holidayDates?: Set<string>,
): number {
  let count = 0;
  for (const isoDate of listDatesInRange(start, end)) {
    if (isHoliday(isoDate, holidayDates)) {
      continue;
    }
    count += 1;
  }
  return count;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Prorated capacity for [rangeStart, rangeEnd].
 * `overrideByYearMonth` keys are `YYYY-MM`.
 * `holidayDates` should include holidays for all months touched (full months).
 */
export function computeProratedRequiredHours(input: {
  rangeStart: string;
  rangeEnd: string;
  weekdayHours: CapacityWeekdayHours[];
  overrideByYearMonth?: Map<string, number>;
  holidayDates?: Set<string>;
}): ProratedCapacityResult {
  const { rangeStart, rangeEnd, weekdayHours } = input;
  const overrides = input.overrideByYearMonth ?? new Map<string, number>();
  const holidayDates = input.holidayDates ?? new Set<string>();

  if (rangeStart > rangeEnd) {
    return {
      requiredHours: null,
      source: "missing",
      segments: [],
      spansMultipleMonths: false,
      holidayImpact: emptyHolidayImpact(),
    };
  }

  const yearMonths = listYearMonthsBetween(rangeStart, rangeEnd);
  const segments: CapacityMonthSegment[] = [];
  let usedOverride = false;
  let usedDefault = false;

  for (const yearMonth of yearMonths) {
    const [yearRaw, monthRaw] = yearMonth.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const monthStart = startOfMonth(yearMonth);
    const monthEnd = endOfMonth(yearMonth);
    const intersection = clampIsoDateRange(
      rangeStart,
      rangeEnd,
      monthStart,
      monthEnd,
    );
    if (!intersection) {
      continue;
    }

    const weightFullMonthRaw = computeMonthlyRequiredHours(
      year,
      month,
      weekdayHours,
    );
    const weightFullMonth = computeMonthlyRequiredHours(
      year,
      month,
      weekdayHours,
      holidayDates,
    );
    const weightInRange = sumWeekdayHoursInRange(
      intersection.start,
      intersection.end,
      weekdayHours,
      holidayDates,
    );
    const override = overrides.get(yearMonth);

    if (override != null) {
      usedOverride = true;
      let hours: number;
      if (weightFullMonthRaw > 0) {
        // Denominator ignores holidays so closed-month overrides shrink
        // when holidays fall on load days.
        hours = override * (weightInRange / weightFullMonthRaw);
      } else {
        const daysFull = calendarDayCount(monthStart, monthEnd, holidayDates);
        const daysInRange = calendarDayCount(
          intersection.start,
          intersection.end,
          holidayDates,
        );
        hours = daysFull > 0 ? override * (daysInRange / daysFull) : 0;
      }
      segments.push({
        yearMonth,
        year,
        month,
        hours: roundHours(hours),
        source: "override",
        weightInRange,
        weightFullMonth,
      });
      continue;
    }

    if (weekdayHours.length === 0) {
      continue;
    }

    usedDefault = true;
    segments.push({
      yearMonth,
      year,
      month,
      hours: weightInRange,
      source: "team_default",
      weightInRange,
      weightFullMonth,
    });
  }

  const holidayImpact = computeHolidayCapacityImpact(
    rangeStart,
    rangeEnd,
    weekdayHours,
    holidayDates,
  );

  if (segments.length === 0) {
    return {
      requiredHours: null,
      source: "missing",
      segments,
      spansMultipleMonths: yearMonths.length > 1,
      holidayImpact,
    };
  }

  const requiredHours = roundHours(
    segments.reduce((sum, segment) => sum + segment.hours, 0),
  );

  let source: CapacitySource;
  if (usedOverride && usedDefault) {
    source = "mixed";
  } else if (usedOverride) {
    source = "override";
  } else {
    source = "team_default";
  }

  return {
    requiredHours,
    source,
    segments,
    spansMultipleMonths: yearMonths.length > 1,
    holidayImpact,
  };
}

export function yearMonthKeyFromParts(year: number, month: number): string {
  return monthKey(year, month);
}
