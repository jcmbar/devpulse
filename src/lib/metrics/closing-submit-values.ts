import type { CompensationBaseType } from "@/types/developer-compensation";

/** Extra hours billed per presencial (travel) day when variable + 6h/day contract. */
export const PRESENCIAL_EXTRA_HOURS = 2;

/**
 * Variable 6h/day from this month: keep cadastral/contractual base, and put
 * (dias úteis × 6h − carga contratual) + (presencial × 2h) into the differential.
 */
export const VARIABLE_CALENDAR_BASE_FROM = "2026-08";

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function computeTravelAmount(input: {
  presencialDays: number;
  dailyTravelAmount: number;
}): number {
  return roundMoney(
    Math.max(0, input.presencialDays) * Math.max(0, input.dailyTravelAmount),
  );
}

function computeMealAmount(input: {
  presencialDays: number;
  dailyMealAmount: number;
}): number {
  return roundMoney(
    Math.max(0, input.presencialDays) * Math.max(0, input.dailyMealAmount),
  );
}

function computeInvoiceAmount(input: {
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

export type ClosingSubmitValuesInput = {
  baseType: CompensationBaseType;
  baseAmount: number;
  hourlyRate: number | null;
  contractedHoursPerDay: number;
  contractedHoursPerMonth: number;
  dailyTravelAmount: number;
  dailyMealAmount: number;
  /** Jira delivery hours in the closing month. */
  workedHours: number;
  travelDays: string[];
  mealDays: string[];
  /** Absence days (Fixo + considerJiraHours false). */
  absenceDays?: string[];
  /** Makeup / compensação days that offset absences 1:1. */
  makeupDays?: string[];
  /** When true, Jira Δ goes to time bank — no money adjustment on NF. */
  timeBankEnabled?: boolean;
  /**
   * Fixo: when false, ignore Jira and discount by absence days.
   * Variable always uses Jira (this flag is ignored).
   */
  considerJiraHours?: boolean;
  /** Closing month YYYY-MM — gates calendar variable base. */
  yearMonth?: string;
  /**
   * Business days in the month (Mon–Fri minus applicable holidays).
   * Required to activate calendar differential for variable 6h from 2026-08.
   */
  calendarBusinessDays?: number;
};

export type ClosingSubmitValuesResult = {
  travelPresencialDays: number;
  mealPresencialDays: number;
  /** Raw absence days marked (before makeup offset). */
  absenceDeclaredCount: number;
  /** Makeup days marked. */
  makeupDaysCount: number;
  /** Billed absences: max(0, declared − makeup). */
  absenceDaysCount: number;
  travelAmount: number;
  mealAmount: number;
  /**
   * −jiraDeficitAmount − absenceAmount + presencialExtraAmount
   * (+ calendar uplift vs contractual base when calendar mode is on).
   */
  differentialAmount: number;
  invoiceAmount: number;
  workedHoursSnapshot: number;
  contractedHoursMonthSnapshot: number;
  timeBankEnabled: boolean;
  considerJiraHours: boolean;
  /** Jira − contracted (positive credits bank / no cash bonus when bank off). */
  timeBankHoursDelta: number;
  /** Money discount for Jira shortfall when bank OFF and Jira considered; else 0. */
  jiraDeficitAmount: number;
  /** Money discount for billed absences when Jira not considered; else 0. */
  absenceAmount: number;
  /** Variable + ~6h/day: travelDays × 2h × rate. */
  presencialExtraAmount: number;
  /**
   * Calendar money above/below cadastral base when calendar mode is on
   * (dias úteis × 6h × rate − base contratual); else 0.
   */
  calendarUpliftAmount: number;
  /**
   * Hours that compose the variable calendar differential:
   * dias úteis × 6h + presencial × 2h. Null when calendar mode is off.
   */
  consideredHours: number | null;
  /**
   * consideredHours − carga contratual (e.g. +22). Null when calendar mode is off.
   */
  differentialHours: number | null;
  /** Always the cadastral/contractual base (not the calendar recomputation). */
  compensationBaseAmount: number;
  /** True when variable 6h calendar differential rules apply (from 2026-08). */
  usesCalendarVariableBase: boolean;
  /** Business days used for calendar hours; null when not applied. */
  calendarBusinessDaysUsed: number | null;
  compensationBaseType: CompensationBaseType;
  compensationHourlyRate: number | null;
  compensationDailyTravelAmount: number;
  compensationDailyMealAmount: number;
};

export function usesVariableCalendarBase(input: {
  baseType: CompensationBaseType;
  contractedHoursPerDay: number;
  yearMonth?: string;
  calendarBusinessDays?: number;
  hourlyRate: number | null;
}): boolean {
  if (input.baseType !== "variable") {
    return false;
  }
  if (!isSixHourContractDay(input.contractedHoursPerDay)) {
    return false;
  }
  if (input.hourlyRate == null || !Number.isFinite(input.hourlyRate)) {
    return false;
  }
  const yearMonth = input.yearMonth?.trim() ?? "";
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return false;
  }
  if (yearMonth < VARIABLE_CALENDAR_BASE_FROM) {
    return false;
  }
  return (
    input.calendarBusinessDays != null &&
    Number.isFinite(input.calendarBusinessDays) &&
    input.calendarBusinessDays >= 0
  );
}

/**
 * NF amounts frozen on monthly closing submit.
 *
 * Variável / Fixo+Jira ON: base − déficit Jira + extras + desloc. + refeição
 * Fixo+Jira OFF:           base − max(0, faltas−compensações)×h/dia×R$/h + desloc. + refeição
 *
 * Variable 6h from 2026-08:
 *   base = valor contratual (cadastro)
 *   diferencial = (dias úteis×6h + presencial×2h − carga contratual)×rate
 *                 − déficit Jira (ainda vs contractedHoursPerMonth)
 *   horas consideradas = dias úteis×6h + presencial×2h
 *
 * Does not rewrite historical closings; only used on new submit/draft.
 */
export function computeClosingSubmitValues(
  input: ClosingSubmitValuesInput,
): ClosingSubmitValuesResult {
  const travelDays = uniqueIsoDates(input.travelDays);
  const mealDays = uniqueIsoDates(input.mealDays);
  const absenceDays = uniqueIsoDates(input.absenceDays ?? []);
  const makeupDays = uniqueIsoDates(input.makeupDays ?? []).filter(
    (day) => !absenceDays.includes(day),
  );
  const travelPresencialDays = travelDays.length;
  const mealPresencialDays = mealDays.length;
  const absenceDeclaredCount = absenceDays.length;
  const makeupDaysCount = makeupDays.length;
  const absenceDaysCount = Math.max(0, absenceDeclaredCount - makeupDaysCount);
  const dailyTravel = Math.max(0, input.dailyTravelAmount);
  const dailyMeal = Math.max(0, input.dailyMealAmount);
  const cadastralBaseAmount = Number.isFinite(input.baseAmount)
    ? input.baseAmount
    : 0;
  const contractedMonth = Math.max(
    0,
    Number.isFinite(input.contractedHoursPerMonth)
      ? input.contractedHoursPerMonth
      : 0,
  );
  const contractedDay = Math.max(
    0,
    Number.isFinite(input.contractedHoursPerDay)
      ? input.contractedHoursPerDay
      : 0,
  );
  const workedHours =
    Number.isFinite(input.workedHours) && input.workedHours > 0
      ? Math.round(input.workedHours * 100) / 100
      : 0;
  const rate =
    input.hourlyRate != null &&
    Number.isFinite(input.hourlyRate) &&
    input.hourlyRate >= 0
      ? input.hourlyRate
      : null;
  const timeBankEnabled = Boolean(input.timeBankEnabled);
  const considerJiraHours =
    input.baseType === "variable"
      ? true
      : input.considerJiraHours !== false;

  const calendarBaseActive = usesVariableCalendarBase({
    baseType: input.baseType,
    contractedHoursPerDay: input.contractedHoursPerDay,
    yearMonth: input.yearMonth,
    calendarBusinessDays: input.calendarBusinessDays,
    hourlyRate: rate,
  });
  const calendarBusinessDaysUsed = calendarBaseActive
    ? Math.max(0, Math.floor(input.calendarBusinessDays as number))
    : null;

  // Base column stays contractual/cadastral; calendar hours feed the differential.
  const baseAmount = cadastralBaseAmount;
  const calendarHours =
    calendarBaseActive && calendarBusinessDaysUsed != null
      ? roundHours(calendarBusinessDaysUsed * contractedDay)
      : 0;
  const calendarMoney =
    calendarBaseActive && rate != null
      ? roundMoney(calendarHours * rate)
      : 0;
  const calendarUpliftAmount = calendarBaseActive
    ? roundMoney(calendarMoney - cadastralBaseAmount)
    : 0;

  const hoursDelta = considerJiraHours
    ? roundHours(workedHours - contractedMonth)
    : 0;
  const shortfallHours = Math.max(0, -hoursDelta);

  const jiraDeficitAmount =
    considerJiraHours &&
    !timeBankEnabled &&
    rate != null &&
    shortfallHours > 0
      ? roundMoney(shortfallHours * rate)
      : 0;

  const absenceAmount =
    !considerJiraHours && rate != null && absenceDaysCount > 0
      ? roundMoney(absenceDaysCount * contractedDay * rate)
      : 0;

  const presencialExtraHours =
    qualifiesPresencialExtra({
      baseType: input.baseType,
      contractedHoursPerDay: input.contractedHoursPerDay,
      hourlyRate: rate,
    })
      ? roundHours(travelPresencialDays * PRESENCIAL_EXTRA_HOURS)
      : 0;
  const presencialExtraAmount =
    rate != null && presencialExtraHours > 0
      ? roundMoney(presencialExtraHours * rate)
      : 0;

  const consideredHours = calendarBaseActive
    ? roundHours(calendarHours + presencialExtraHours)
    : null;
  const differentialHours =
    consideredHours != null
      ? roundHours(consideredHours - contractedMonth)
      : null;

  const travelAmount = computeTravelAmount({
    presencialDays: travelPresencialDays,
    dailyTravelAmount: dailyTravel,
  });
  const mealAmount = computeMealAmount({
    presencialDays: mealPresencialDays,
    dailyMealAmount: dailyMeal,
  });

  const differentialAmount = roundMoney(
    calendarUpliftAmount +
      presencialExtraAmount -
      jiraDeficitAmount -
      absenceAmount,
  );

  const invoiceAmount = computeInvoiceAmount({
    baseAmount,
    differentialAmount,
    discountsAmount: 0,
    travelAmount,
    mealAmount,
  });

  return {
    travelPresencialDays,
    mealPresencialDays,
    absenceDeclaredCount,
    makeupDaysCount,
    absenceDaysCount,
    travelAmount,
    mealAmount,
    differentialAmount,
    invoiceAmount,
    workedHoursSnapshot: workedHours,
    contractedHoursMonthSnapshot: contractedMonth,
    timeBankEnabled,
    considerJiraHours,
    timeBankHoursDelta: hoursDelta,
    jiraDeficitAmount,
    absenceAmount,
    presencialExtraAmount,
    calendarUpliftAmount,
    consideredHours,
    differentialHours,
    compensationBaseAmount: baseAmount,
    usesCalendarVariableBase: calendarBaseActive,
    calendarBusinessDaysUsed,
    compensationBaseType: input.baseType,
    compensationHourlyRate: input.hourlyRate,
    compensationDailyTravelAmount: dailyTravel,
    compensationDailyMealAmount: dailyMeal,
  };
}

export function qualifiesPresencialExtra(input: {
  baseType: CompensationBaseType;
  contractedHoursPerDay: number;
  hourlyRate: number | null;
}): boolean {
  if (input.baseType !== "variable") {
    return false;
  }
  if (input.hourlyRate == null || !Number.isFinite(input.hourlyRate)) {
    return false;
  }
  return isSixHourContractDay(input.contractedHoursPerDay);
}

export function isSixHourContractDay(hoursPerDay: number): boolean {
  return Number.isFinite(hoursPerDay) && Math.abs(hoursPerDay - 6) < 0.05;
}

/** Folha / UI helper: hours that drive the variable calendar differential. */
export function computeVariableCalendarHoursForDisplay(input: {
  baseType: CompensationBaseType;
  contractedHoursPerDay: number;
  contractedHoursPerMonth: number;
  hourlyRate: number | null;
  yearMonth: string;
  calendarBusinessDays: number;
  presencialDays: number;
}): { consideredHours: number; differentialHours: number } | null {
  if (
    !usesVariableCalendarBase({
      baseType: input.baseType,
      contractedHoursPerDay: input.contractedHoursPerDay,
      yearMonth: input.yearMonth,
      calendarBusinessDays: input.calendarBusinessDays,
      hourlyRate: input.hourlyRate,
    })
  ) {
    return null;
  }

  const contractedDay = Math.max(0, input.contractedHoursPerDay);
  const contractedMonth = Math.max(0, input.contractedHoursPerMonth);
  const calendarHours = roundHours(
    Math.max(0, Math.floor(input.calendarBusinessDays)) * contractedDay,
  );
  const presencialExtraHours = qualifiesPresencialExtra({
    baseType: input.baseType,
    contractedHoursPerDay: input.contractedHoursPerDay,
    hourlyRate: input.hourlyRate,
  })
    ? roundHours(Math.max(0, input.presencialDays) * PRESENCIAL_EXTRA_HOURS)
    : 0;
  const consideredHours = roundHours(calendarHours + presencialExtraHours);

  return {
    consideredHours,
    differentialHours: roundHours(consideredHours - contractedMonth),
  };
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function uniqueIsoDates(values: string[]): string[] {
  const set = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      set.add(trimmed);
    }
  }
  return [...set].sort();
}

export function formatClosingMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
