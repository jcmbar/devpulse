import "server-only";

import {
  computeMonthlyRequiredHours,
  computeProratedRequiredHours,
} from "@/lib/metrics/capacity-period";
import { listYearMonthsBetween, monthKeyFromDate } from "@/lib/metrics/date-range";
import {
  applicableHolidayDateSet,
  filterHolidaysForDeveloper,
  filterNationalHolidays,
  toDeveloperHolidayContext,
} from "@/lib/metrics/holiday-eligibility";
import { weekdayLabel } from "@/lib/metrics/weekday-labels";
import { createClient } from "@/lib/supabase/server";
import { listHolidaysForCapacityPeriod } from "@/services/holidays";
import { getTeamLabelMap } from "@/services/teams/labels";
import type {
  AppliedHolidaySummary,
  CapacityWeekdayHours,
  DeveloperMonthlyCapacity,
  ResolvedDeveloperCapacity,
} from "@/types/capacity";
import type { Holiday } from "@/types/holiday";

export type WeekdayHours = CapacityWeekdayHours;

export { weekdayLabel, computeMonthlyRequiredHours };

export type TeamDefaultCapacityForPeriod = {
  requiredHours: number | null;
  spansMultipleMonths: boolean;
  primaryYearMonth: string | null;
  holidays: Holiday[];
  holidayImpact: {
    affected: boolean;
    hoursExcluded: number;
    impactingHolidays: Array<{
      date: string;
      name: string;
      hoursExcluded: number;
    }>;
  };
  /** Reference meta uses national holidays only. */
  holidayScopeNote: string;
};

type DeveloperHolidayRow = {
  id: string;
  state_code: string;
  city_code: string;
  team_id: string | null;
  team_code: string;
  team_name: string | null;
};

/**
 * Holiday context with team code resolved from teams via team_id
 * (never from free-form developers.team_code).
 */
async function listDeveloperHolidayContexts(
  developerIds: string[],
): Promise<Map<string, DeveloperHolidayRow>> {
  const map = new Map<string, DeveloperHolidayRow>();
  if (developerIds.length === 0) {
    return map;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("developers")
    .select("id, state_code, city_code, team_id")
    .in("id", developerIds);

  if (error) {
    throw new Error(`Failed to load developer holiday context: ${error.message}`);
  }

  const teamIds = (data ?? [])
    .map((row) => row.team_id as string | null)
    .filter((id): id is string => Boolean(id));
  const labels = await getTeamLabelMap(teamIds);

  for (const row of data ?? []) {
    const teamId = (row.team_id as string | null) ?? null;
    const label = teamId ? labels.get(teamId) : undefined;
    map.set(row.id, {
      id: row.id,
      state_code: row.state_code ?? "",
      city_code: row.city_code ?? "",
      team_id: teamId,
      team_code: label?.code ?? "",
      team_name: label?.name ?? null,
    });
  }

  for (const id of developerIds) {
    if (!map.has(id)) {
      map.set(id, {
        id,
        state_code: "",
        city_code: "",
        team_id: null,
        team_code: "",
        team_name: null,
      });
    }
  }

  return map;
}

function buildAppliedHolidaySummaries(
  applicable: ReturnType<typeof filterHolidaysForDeveloper>,
  impact: {
    impactingHolidays: Array<{ date: string; hoursExcluded: number }>;
  },
): AppliedHolidaySummary[] {
  const hoursByDate = new Map(
    impact.impactingHolidays.map((item) => [item.date, item.hoursExcluded]),
  );

  return applicable
    .filter((holiday) => hoursByDate.has(holiday.holiday_on))
    .map((holiday) => ({
      date: holiday.holiday_on,
      name: holiday.name,
      scope: holiday.scope,
      regionCode: holiday.region_code,
      reason: holiday.reason,
      hoursExcluded: hoursByDate.get(holiday.holiday_on) ?? 0,
    }));
}

export async function listCapacityWeekdayHours(): Promise<WeekdayHours[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("capacity_weekday_hours")
    .select("weekday, hours_per_day")
    .order("weekday", { ascending: true });

  if (error) {
    throw new Error(`Failed to load capacity settings: ${error.message}`);
  }

  return data ?? [];
}

export async function updateCapacityWeekdayHours(
  rows: Array<{ weekday: number; hoursPerDay: number }>,
): Promise<void> {
  const supabase = await createClient();

  for (const row of rows) {
    if (row.weekday < 1 || row.weekday > 7) {
      throw new Error(`Weekday inválido: ${row.weekday}`);
    }
    if (row.hoursPerDay < 0) {
      throw new Error("Horas por dia não podem ser negativas.");
    }

    const { error } = await supabase.from("capacity_weekday_hours").upsert(
      {
        weekday: row.weekday,
        hours_per_day: row.hoursPerDay,
      },
      { onConflict: "weekday" },
    );

    if (error) {
      throw new Error(`Failed to save weekday hours: ${error.message}`);
    }
  }
}

export async function listDeveloperMonthlyCapacity(input: {
  year: number;
  month: number;
}): Promise<DeveloperMonthlyCapacity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("developer_monthly_capacity")
    .select("id, developer_id, year, month, required_hours, notes")
    .eq("year", input.year)
    .eq("month", input.month)
    .order("developer_id", { ascending: true });

  if (error) {
    throw new Error(`Failed to load capacity overrides: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    developer_id: row.developer_id,
    year: row.year,
    month: row.month,
    required_hours: Number(row.required_hours),
    notes: row.notes,
  }));
}

/**
 * Overrides that touch any year-month in [periodStart, periodEnd].
 */
export async function listDeveloperMonthlyCapacityInRange(input: {
  developerIds: string[];
  periodStart: string;
  periodEnd: string;
}): Promise<DeveloperMonthlyCapacity[]> {
  if (input.developerIds.length === 0 || input.periodStart > input.periodEnd) {
    return [];
  }

  const yearMonths = listYearMonthsBetween(input.periodStart, input.periodEnd);
  if (yearMonths.length === 0) {
    return [];
  }

  const years = Array.from(
    new Set(yearMonths.map((key) => Number(key.slice(0, 4)))),
  );

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("developer_monthly_capacity")
    .select("id, developer_id, year, month, required_hours, notes")
    .in("developer_id", input.developerIds)
    .in("year", years);

  if (error) {
    throw new Error(`Failed to load capacity overrides: ${error.message}`);
  }

  const allowed = new Set(yearMonths);
  return (data ?? [])
    .filter((row) => {
      const key = `${row.year}-${String(row.month).padStart(2, "0")}`;
      return allowed.has(key);
    })
    .map((row) => ({
      id: row.id,
      developer_id: row.developer_id,
      year: row.year,
      month: row.month,
      required_hours: Number(row.required_hours),
      notes: row.notes,
    }));
}

export async function upsertDeveloperMonthlyCapacity(input: {
  developerId: string;
  year: number;
  month: number;
  requiredHours: number;
  notes?: string | null;
}): Promise<void> {
  if (input.requiredHours < 0) {
    throw new Error("Capacidade não pode ser negativa.");
  }
  if (input.month < 1 || input.month > 12) {
    throw new Error("Mês inválido.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("developer_monthly_capacity").upsert(
    {
      developer_id: input.developerId,
      year: input.year,
      month: input.month,
      required_hours: input.requiredHours,
      notes: input.notes ?? null,
    },
    { onConflict: "developer_id,year,month" },
  );

  if (error) {
    throw new Error(`Failed to save capacity override: ${error.message}`);
  }
}

export async function deleteDeveloperMonthlyCapacity(input: {
  developerId: string;
  year: number;
  month: number;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("developer_monthly_capacity")
    .delete()
    .eq("developer_id", input.developerId)
    .eq("year", input.year)
    .eq("month", input.month);

  if (error) {
    throw new Error(`Failed to remove capacity override: ${error.message}`);
  }
}

/**
 * Resolve required hours for many developers over an arbitrary date range.
 * Uses weekday-hour proration + monthly overrides + per-developer holidays.
 */
export async function resolveCapacitiesForDevelopers(input: {
  developerIds: string[];
  periodStart: string;
  periodEnd: string;
}): Promise<Map<string, ResolvedDeveloperCapacity>> {
  const result = new Map<string, ResolvedDeveloperCapacity>();
  const primaryYearMonth = monthKeyFromDate(input.periodStart);

  if (input.developerIds.length === 0) {
    return result;
  }

  const [weekdayHours, overrides, holidays, contexts] = await Promise.all([
    listCapacityWeekdayHours(),
    listDeveloperMonthlyCapacityInRange({
      developerIds: input.developerIds,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    }),
    listHolidaysForCapacityPeriod({
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    }),
    listDeveloperHolidayContexts(input.developerIds),
  ]);

  const overridesByDeveloper = new Map<string, Map<string, number>>();
  for (const row of overrides) {
    const key = `${row.year}-${String(row.month).padStart(2, "0")}`;
    const byMonth = overridesByDeveloper.get(row.developer_id) ?? new Map();
    byMonth.set(key, row.required_hours);
    overridesByDeveloper.set(row.developer_id, byMonth);
  }

  for (const developerId of input.developerIds) {
    const contextRow = contexts.get(developerId);
    const context = toDeveloperHolidayContext({
      state_code: contextRow?.state_code,
      city_code: contextRow?.city_code,
      teamId: contextRow?.team_id ?? null,
      teamCode: contextRow?.team_code ?? "",
    });
    const applicable = filterHolidaysForDeveloper(holidays, context);
    const holidayDates = applicableHolidayDateSet(applicable);

    const computed = computeProratedRequiredHours({
      rangeStart: input.periodStart,
      rangeEnd: input.periodEnd,
      weekdayHours,
      overrideByYearMonth: overridesByDeveloper.get(developerId),
      holidayDates,
    });

    result.set(developerId, {
      developerId,
      requiredHours: computed.requiredHours,
      source: computed.source,
      primaryYearMonth,
      spansMultipleMonths: computed.spansMultipleMonths,
      segments: computed.segments.map((segment) => ({
        yearMonth: segment.yearMonth,
        hours: segment.hours,
        source: segment.source,
      })),
      appliedHolidays: buildAppliedHolidaySummaries(
        applicable,
        computed.holidayImpact,
      ),
      holidayHoursExcluded: computed.holidayImpact.hoursExcluded,
    });
  }

  return result;
}

function enrichHolidayImpact(
  holidays: Holiday[],
  impact: {
    affected: boolean;
    hoursExcluded: number;
    impactingHolidays: Array<{ date: string; hoursExcluded: number }>;
  },
): TeamDefaultCapacityForPeriod["holidayImpact"] {
  const nameByDate = new Map(holidays.map((row) => [row.holiday_on, row.name]));
  return {
    affected: impact.affected,
    hoursExcluded: impact.hoursExcluded,
    impactingHolidays: impact.impactingHolidays.map((item) => ({
      date: item.date,
      name: nameByDate.get(item.date) ?? "Feriado",
      hoursExcluded: item.hoursExcluded,
    })),
  };
}

/**
 * Team reference capacity for a range (no developer overrides).
 * Uses national holidays only — regional metas live on each ranking row.
 */
export async function resolveTeamDefaultCapacityForPeriod(input: {
  periodStart: string;
  periodEnd: string;
}): Promise<TeamDefaultCapacityForPeriod> {
  const [weekdayHours, holidays] = await Promise.all([
    listCapacityWeekdayHours(),
    listHolidaysForCapacityPeriod({
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    }),
  ]);

  const national = filterNationalHolidays(holidays);
  const holidayDates = applicableHolidayDateSet(national);
  const computed = computeProratedRequiredHours({
    rangeStart: input.periodStart,
    rangeEnd: input.periodEnd,
    weekdayHours,
    holidayDates,
  });

  return {
    requiredHours: computed.requiredHours,
    spansMultipleMonths: computed.spansMultipleMonths,
    primaryYearMonth: monthKeyFromDate(input.periodStart),
    holidays: national,
    holidayImpact: enrichHolidayImpact(national, computed.holidayImpact),
    holidayScopeNote:
      "Referência do time usa apenas feriados nacionais. State/city/team entram na meta de cada developer.",
  };
}

export async function resolveRequiredHoursForPeriod(input: {
  developerId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<number | null> {
  const map = await resolveCapacitiesForDevelopers({
    developerIds: [input.developerId],
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });
  return map.get(input.developerId)?.requiredHours ?? null;
}
