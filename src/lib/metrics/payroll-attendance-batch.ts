/** JS getUTCDay(): 0=Sun … 6=Sat. UI order typically Mon→Sun. */
export const WEEKDAY_OPTIONS: ReadonlyArray<{
  value: number;
  label: string;
  short: string;
}> = [
  { value: 1, label: "Segunda", short: "Seg" },
  { value: 2, label: "Terça", short: "Ter" },
  { value: 3, label: "Quarta", short: "Qua" },
  { value: 4, label: "Quinta", short: "Qui" },
  { value: 5, label: "Sexta", short: "Sex" },
  { value: 6, label: "Sábado", short: "Sáb" },
  { value: 0, label: "Domingo", short: "Dom" },
];

export const WORKWEEK_UTC_DAYS = [1, 2, 3, 4, 5] as const;
export const WEEKEND_UTC_DAYS = [0, 6] as const;

export type BatchAttendanceKind =
  | "presencial"
  | "home"
  | "off"
  | "holiday"
  | "weekend";

export type AttendanceDaySnapshot = {
  day_on: string;
  day_kind: BatchAttendanceKind;
  hours: number;
};

export type BatchApplyMode = "fill_unfilled" | "overwrite";

export type BatchApplyAttendanceInput = {
  days: AttendanceDaySnapshot[];
  dayKind: BatchAttendanceKind;
  hours: number;
  /** Empty = all weekdays. Values are getUTCDay() numbers. */
  weekdays: number[];
  rangeStart: string | null;
  rangeEnd: string | null;
  mode: BatchApplyMode;
  contractedHoursPerDay: number;
  /** ISO dates that should seed as holiday (weekday only). */
  holidayDates?: ReadonlySet<string>;
};

export type BatchApplyPatch = {
  dayOn: string;
  dayKind: BatchAttendanceKind;
  hours: number;
};

function utcWeekday(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00.000Z`).getUTCDay();
}

function hoursNearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001;
}

/** Mirrors payroll-calc.defaultDayKindForDate (kept local for node:test). */
function defaultDayKindForDate(
  isoDate: string,
  holidayDates?: ReadonlySet<string>,
): BatchAttendanceKind {
  const weekday = utcWeekday(isoDate);
  if (weekday === 0 || weekday === 6) {
    return "weekend";
  }
  if (holidayDates?.has(isoDate)) {
    return "holiday";
  }
  return "home";
}

export function normalizeAttendanceHours(
  dayKind: BatchAttendanceKind,
  hours: number,
): number {
  if (dayKind === "presencial" || dayKind === "home") {
    return Math.max(0, Number.isFinite(hours) ? hours : 0);
  }
  return 0;
}

/**
 * Seed state from ensureAttendanceDefaults / “mês padrão”:
 * weekend → weekend/0h; holiday → holiday/0h; weekday → home + contracted hours.
 */
export function isUnfilledSeedDay(
  day: AttendanceDaySnapshot,
  contractedHoursPerDay: number,
  holidayDates?: ReadonlySet<string>,
): boolean {
  const expectedKind = defaultDayKindForDate(day.day_on, holidayDates);
  if (day.day_kind !== expectedKind) {
    return false;
  }
  if (expectedKind === "weekend" || expectedKind === "holiday") {
    return day.hours === 0;
  }
  return hoursNearlyEqual(day.hours, contractedHoursPerDay);
}

export function isCalendarWeekend(isoDate: string): boolean {
  const weekday = utcWeekday(isoDate);
  return weekday === 0 || weekday === 6;
}

export function resolveBatchTargetDays(
  input: BatchApplyAttendanceInput,
): BatchApplyPatch[] {
  const weekdaySet =
    input.weekdays.length > 0
      ? new Set(input.weekdays)
      : null;
  const hours = normalizeAttendanceHours(input.dayKind, input.hours);
  const patches: BatchApplyPatch[] = [];

  for (const day of input.days) {
    if (input.rangeStart && day.day_on < input.rangeStart) {
      continue;
    }
    if (input.rangeEnd && day.day_on > input.rangeEnd) {
      continue;
    }
    if (weekdaySet && !weekdaySet.has(utcWeekday(day.day_on))) {
      continue;
    }
    if (
      input.mode === "fill_unfilled" &&
      !isUnfilledSeedDay(day, input.contractedHoursPerDay, input.holidayDates)
    ) {
      continue;
    }
    patches.push({
      dayOn: day.day_on,
      dayKind: input.dayKind,
      hours,
    });
  }

  return patches;
}

/** Atalho: úteis = home + horas padrão; feriados = holiday/0; fins de semana = weekend/0. */
export function resolveFillMonthDefaultPatches(input: {
  days: AttendanceDaySnapshot[];
  contractedHoursPerDay: number;
  holidayDates?: ReadonlySet<string>;
}): BatchApplyPatch[] {
  return input.days.map((day) => {
    const kind = defaultDayKindForDate(day.day_on, input.holidayDates);
    return {
      dayOn: day.day_on,
      dayKind: kind,
      hours: normalizeAttendanceHours(kind, input.contractedHoursPerDay),
    };
  });
}

export function resolveWorkweekKindPatches(input: {
  days: AttendanceDaySnapshot[];
  dayKind: "home" | "presencial";
  contractedHoursPerDay: number;
  rangeStart?: string | null;
  rangeEnd?: string | null;
}): BatchApplyPatch[] {
  return resolveBatchTargetDays({
    days: input.days,
    dayKind: input.dayKind,
    hours: input.contractedHoursPerDay,
    weekdays: [...WORKWEEK_UTC_DAYS],
    rangeStart: input.rangeStart ?? null,
    rangeEnd: input.rangeEnd ?? null,
    mode: "overwrite",
    contractedHoursPerDay: input.contractedHoursPerDay,
  });
}

export function resolveZeroWeekendPatches(input: {
  days: AttendanceDaySnapshot[];
  rangeStart?: string | null;
  rangeEnd?: string | null;
}): BatchApplyPatch[] {
  return resolveBatchTargetDays({
    days: input.days,
    dayKind: "weekend",
    hours: 0,
    weekdays: [...WEEKEND_UTC_DAYS],
    rangeStart: input.rangeStart ?? null,
    rangeEnd: input.rangeEnd ?? null,
    mode: "overwrite",
    contractedHoursPerDay: 0,
  });
}
