import "server-only";

import { endOfMonth, listYearMonthsBetween, startOfMonth } from "@/lib/metrics/date-range";
import {
  applicableHolidayDateSet,
  filterHolidaysForDeveloper,
  toDeveloperHolidayContext,
  type ApplicableHoliday,
} from "@/lib/metrics/holiday-eligibility";
import { yearMonthPeriod } from "@/lib/metrics/payroll-calc";
import { createClient } from "@/lib/supabase/server";
import type { Holiday, HolidayScope } from "@/types/holiday";

const HOLIDAY_SCOPES: HolidayScope[] = ["national", "state", "city", "team"];

function mapRow(row: {
  id: string;
  holiday_on: string;
  name: string;
  scope: string;
  region_code: string;
  is_active: boolean;
}): Holiday {
  return {
    id: row.id,
    holiday_on: row.holiday_on,
    name: row.name,
    scope: row.scope as HolidayScope,
    region_code: row.region_code ?? "",
    is_active: row.is_active,
  };
}

export function isHolidayScope(value: string): value is HolidayScope {
  return HOLIDAY_SCOPES.includes(value as HolidayScope);
}

export function normalizeRegionCode(
  scope: HolidayScope,
  regionCode: string | null | undefined,
): string {
  const trimmed = (regionCode ?? "").trim().toUpperCase();
  if (scope === "national") {
    return "";
  }
  return trimmed;
}

function assertHolidayInput(input: {
  holidayOn: string;
  name: string;
  scope: string;
  regionCode?: string | null;
}): {
  holidayOn: string;
  name: string;
  scope: HolidayScope;
  regionCode: string;
} {
  const holidayOn = input.holidayOn.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayOn)) {
    throw new Error("Data inválida. Use o formato AAAA-MM-DD.");
  }

  const parsed = new Date(`${holidayOn}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== holidayOn) {
    throw new Error("Data inválida.");
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error("Informe o nome do feriado.");
  }
  if (name.length > 120) {
    throw new Error("Nome muito longo (máx. 120 caracteres).");
  }

  if (!isHolidayScope(input.scope)) {
    throw new Error("Escopo inválido.");
  }

  const regionCode = normalizeRegionCode(input.scope, input.regionCode);
  if (input.scope !== "national" && !regionCode) {
    throw new Error(
      input.scope === "team"
        ? "Selecione o time cadastrado (vínculo estruturado)."
        : "Informe o código da região (ex.: BR-SP ou BR-SP-SAO_PAULO).",
    );
  }
  if (regionCode.length > 64) {
    throw new Error("region_code muito longo (máx. 64 caracteres).");
  }

  return {
    holidayOn,
    name,
    scope: input.scope,
    regionCode,
  };
}

async function assertTeamRegionExists(regionCode: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("id")
    .eq("code", regionCode)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to validate team region: ${error.message}`);
  }
  if (!data) {
    throw new Error(
      "Time inválido. Cadastre o time em /app/teams e selecione na lista.",
    );
  }
}

function uniqueViolationMessage(error: { code?: string; message: string }): string | null {
  if (
    error.code === "23505" ||
    error.message.toLowerCase().includes("holidays_unique_day_scope") ||
    error.message.toLowerCase().includes("duplicate")
  ) {
    return "Já existe feriado nesta data para o mesmo escopo/região.";
  }
  return null;
}

/**
 * Active holidays overlapping [rangeStart, rangeEnd] (inclusive).
 * Used by capacity calculation.
 */
export async function listHolidaysInRange(input: {
  rangeStart: string;
  rangeEnd: string;
}): Promise<Holiday[]> {
  if (input.rangeStart > input.rangeEnd) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("holidays")
    .select("id, holiday_on, name, scope, region_code, is_active")
    .eq("is_active", true)
    .gte("holiday_on", input.rangeStart)
    .lte("holiday_on", input.rangeEnd)
    .order("holiday_on", { ascending: true });

  if (error) {
    console.warn("holidays unavailable:", error.message);
    return [];
  }

  return (data ?? []).map(mapRow);
}

/**
 * Holidays applicable to one developer in a date range (national/state/city/team).
 * Team match uses teams.code via developers.team_id.
 */
export async function listApplicableHolidaysForDeveloperInRange(input: {
  developerId: string;
  rangeStart: string;
  rangeEnd: string;
}): Promise<ApplicableHoliday[]> {
  const holidays = await listHolidaysInRange({
    rangeStart: input.rangeStart,
    rangeEnd: input.rangeEnd,
  });
  if (holidays.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const { data: developer, error } = await supabase
    .from("developers")
    .select("state_code, city_code, team_id")
    .eq("id", input.developerId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Falha ao carregar contexto de feriados: ${error.message}`,
    );
  }

  let teamCode = "";
  const teamId = (developer?.team_id as string | null) ?? null;
  if (teamId) {
    const { data: team } = await supabase
      .from("teams")
      .select("code")
      .eq("id", teamId)
      .maybeSingle();
    teamCode = String(team?.code ?? "");
  }

  const context = toDeveloperHolidayContext({
    state_code: developer?.state_code ?? "",
    city_code: developer?.city_code ?? "",
    team_id: teamId,
    team_code: teamCode,
  });

  return filterHolidaysForDeveloper(holidays, context);
}

export async function listApplicableHolidayDatesForDeveloperMonth(input: {
  developerId: string;
  yearMonth: string;
}): Promise<{ dates: Set<string>; byDate: Map<string, string> }> {
  const period = yearMonthPeriod(input.yearMonth);
  if (!period) {
    return { dates: new Set(), byDate: new Map() };
  }

  const applicable = await listApplicableHolidaysForDeveloperInRange({
    developerId: input.developerId,
    rangeStart: period.start,
    rangeEnd: period.end,
  });

  const dates = applicableHolidayDateSet(applicable);
  const byDate = new Map<string, string>();
  for (const holiday of applicable) {
    if (!byDate.has(holiday.holiday_on)) {
      byDate.set(holiday.holiday_on, holiday.name);
    }
  }
  return { dates, byDate };
}

/**
 * Holidays for every calendar month touched by the period
 * (needed so monthly override weights exclude holidays outside a partial range).
 */
export async function listHolidaysForCapacityPeriod(input: {
  periodStart: string;
  periodEnd: string;
}): Promise<Holiday[]> {
  const yearMonths = listYearMonthsBetween(input.periodStart, input.periodEnd);
  if (yearMonths.length === 0) {
    return [];
  }

  const expandedStart = startOfMonth(yearMonths[0]);
  const expandedEnd = endOfMonth(yearMonths[yearMonths.length - 1]);
  return listHolidaysInRange({
    rangeStart: expandedStart,
    rangeEnd: expandedEnd,
  });
}

/** @deprecated Prefer listHolidaysAdmin for UI; capacity should use listHolidaysInRange. */
export async function listHolidaysInYear(year: number): Promise<Holiday[]> {
  return listHolidaysInRange({
    rangeStart: `${year}-01-01`,
    rangeEnd: `${year}-12-31`,
  });
}

/**
 * Admin listing: includes inactive. Optional year/scope filters.
 */
export async function listHolidaysAdmin(input: {
  year?: number;
  scope?: HolidayScope | "all";
}): Promise<Holiday[]> {
  const supabase = await createClient();
  let query = supabase
    .from("holidays")
    .select("id, holiday_on, name, scope, region_code, is_active")
    .order("holiday_on", { ascending: true });

  if (input.year != null && Number.isFinite(input.year)) {
    query = query
      .gte("holiday_on", `${input.year}-01-01`)
      .lte("holiday_on", `${input.year}-12-31`);
  }

  if (input.scope && input.scope !== "all") {
    query = query.eq("scope", input.scope);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list holidays: ${error.message}`);
  }

  return (data ?? []).map(mapRow);
}

export async function createHoliday(input: {
  holidayOn: string;
  name: string;
  scope: string;
  regionCode?: string | null;
  isActive?: boolean;
}): Promise<Holiday> {
  const parsed = assertHolidayInput(input);
  if (parsed.scope === "team") {
    await assertTeamRegionExists(parsed.regionCode);
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("holidays")
    .insert({
      holiday_on: parsed.holidayOn,
      name: parsed.name,
      scope: parsed.scope,
      region_code: parsed.regionCode,
      is_active: input.isActive ?? true,
    })
    .select("id, holiday_on, name, scope, region_code, is_active")
    .single();

  if (error) {
    throw new Error(
      uniqueViolationMessage(error) ?? `Failed to create holiday: ${error.message}`,
    );
  }

  return mapRow(data);
}

export async function updateHoliday(input: {
  id: string;
  holidayOn: string;
  name: string;
  scope: string;
  regionCode?: string | null;
  isActive: boolean;
}): Promise<Holiday> {
  if (!input.id.trim()) {
    throw new Error("Feriado inválido.");
  }

  const parsed = assertHolidayInput(input);
  if (parsed.scope === "team") {
    await assertTeamRegionExists(parsed.regionCode);
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("holidays")
    .update({
      holiday_on: parsed.holidayOn,
      name: parsed.name,
      scope: parsed.scope,
      region_code: parsed.regionCode,
      is_active: input.isActive,
    })
    .eq("id", input.id)
    .select("id, holiday_on, name, scope, region_code, is_active")
    .single();

  if (error) {
    throw new Error(
      uniqueViolationMessage(error) ?? `Failed to update holiday: ${error.message}`,
    );
  }

  return mapRow(data);
}

export async function setHolidayActive(input: {
  id: string;
  isActive: boolean;
}): Promise<Holiday> {
  if (!input.id.trim()) {
    throw new Error("Feriado inválido.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("holidays")
    .update({ is_active: input.isActive })
    .eq("id", input.id)
    .select("id, holiday_on, name, scope, region_code, is_active")
    .single();

  if (error) {
    throw new Error(`Failed to update holiday status: ${error.message}`);
  }

  return mapRow(data);
}

/**
 * Hard delete — prefer deactivate for seeded/shared holidays.
 */
export async function deleteHoliday(id: string): Promise<void> {
  if (!id.trim()) {
    throw new Error("Feriado inválido.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("holidays").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete holiday: ${error.message}`);
  }
}

export function holidayDateSet(holidays: Holiday[]): Set<string> {
  return new Set(holidays.map((row) => row.holiday_on));
}
