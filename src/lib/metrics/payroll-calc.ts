import type { CompensationBaseType } from "@/types/developer-compensation";
import type { PayrollAttendanceKind } from "@/types/payroll-closing";

export type AttendanceDayInput = {
  dayKind: PayrollAttendanceKind;
  hours: number;
};

/** Hours actually worked in the month (presencial + home office). */
export function countWorkedHours(attendance: AttendanceDayInput[]): number {
  let total = 0;
  for (const day of attendance) {
    if (day.dayKind !== "presencial" && day.dayKind !== "home") {
      continue;
    }
    const hours = Number.isFinite(day.hours) && day.hours > 0 ? day.hours : 0;
    total += hours;
  }
  return Math.round(total * 100) / 100;
}

/** Worked hours × hourly rate (presencial + home office). */
export function computeWorkedAmount(input: {
  hourlyRate: number | null;
  attendance: AttendanceDayInput[];
}): number {
  const rate = input.hourlyRate;
  if (rate == null || !Number.isFinite(rate) || rate < 0) {
    return 0;
  }
  return roundMoney(countWorkedHours(input.attendance) * rate);
}

/**
 * Variable: (worked hours × hourly rate) − contractual base.
 * May be negative when the month has fewer hours than the base covers.
 * Fixed: 0 (manual override allowed in UI).
 */
export function computePayrollDifferential(input: {
  baseType: CompensationBaseType;
  baseAmount: number;
  hourlyRate: number | null;
  attendance: AttendanceDayInput[];
}): number {
  if (input.baseType !== "variable") {
    return 0;
  }
  const rate = input.hourlyRate;
  if (rate == null || !Number.isFinite(rate) || rate < 0) {
    return 0;
  }
  const worked = computeWorkedAmount({
    hourlyRate: rate,
    attendance: input.attendance,
  });
  const base = Number.isFinite(input.baseAmount) ? input.baseAmount : 0;
  return roundMoney(worked - base);
}

export function countPresencialDays(
  attendance: AttendanceDayInput[],
): number {
  return attendance.filter((day) => day.dayKind === "presencial").length;
}

export function computeTravelAmount(input: {
  presencialDays: number;
  dailyTravelAmount: number;
}): number {
  return roundMoney(
    Math.max(0, input.presencialDays) * Math.max(0, input.dailyTravelAmount),
  );
}

export function computeMealAmount(input: {
  presencialDays: number;
  dailyMealAmount: number;
}): number {
  return roundMoney(
    Math.max(0, input.presencialDays) * Math.max(0, input.dailyMealAmount),
  );
}

export function computeInvoiceAmount(input: {
  baseAmount: number;
  differentialAmount: number;
  discountsAmount: number;
  travelAmount: number;
  mealAmount: number;
}): number {
  return roundMoney(
    input.baseAmount +
      input.differentialAmount -
      input.discountsAmount +
      input.travelAmount +
      input.mealAmount,
  );
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

/** List YYYY-MM-DD days in a calendar month (UTC date parts). */
export function listDaysInYearMonth(yearMonth: string): string[] {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) {
    return [];
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days: string[] = [];
  for (let day = 1; day <= last; day += 1) {
    days.push(
      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );
  }
  return days;
}

export function defaultDayKindForDate(isoDate: string): PayrollAttendanceKind {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) {
    return "weekend";
  }
  return "home";
}

export function yearMonthPeriod(yearMonth: string): {
  start: string;
  end: string;
} | null {
  const days = listDaysInYearMonth(yearMonth);
  if (days.length === 0) {
    return null;
  }
  return { start: days[0]!, end: days[days.length - 1]! };
}
