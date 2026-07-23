/**
 * Deterministic holiday eligibility for capacity.
 *
 * Matching is exact on normalized region_code (trim + uppercase).
 * Never fuzzy / prefix / "city implies state" beyond separate fields.
 *
 * Team holidays: region_code must equal teams.code.
 * Developer context.teamCode must be resolved from developers.team_id → teams.code
 * (never from free-form user input).
 *
 * Conventions for region_code:
 * - national → ""
 * - state    → BR-SP
 * - city     → BR-SP-SAO_PAULO
 * - team     → teams.code (e.g. PRIME)
 */

import type { Holiday, HolidayScope } from "@/types/holiday";

export type DeveloperHolidayContext = {
  stateCode: string;
  cityCode: string;
  /** Canonical FK when available. */
  teamId: string | null;
  /** Resolved from teams.code via team_id — source of truth for matching. */
  teamCode: string;
};

export type HolidayEligibilityReason =
  | "national"
  | "state_match"
  | "city_match"
  | "team_match";

export type ApplicableHoliday = Holiday & {
  reason: HolidayEligibilityReason;
};

export function normalizeHolidayCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function toDeveloperHolidayContext(input: {
  state_code?: string | null;
  city_code?: string | null;
  team_id?: string | null;
  team_code?: string | null;
  stateCode?: string | null;
  cityCode?: string | null;
  teamId?: string | null;
  teamCode?: string | null;
}): DeveloperHolidayContext {
  return {
    stateCode: normalizeHolidayCode(input.stateCode ?? input.state_code),
    cityCode: normalizeHolidayCode(input.cityCode ?? input.city_code),
    teamId: (input.teamId ?? input.team_id ?? null) || null,
    teamCode: normalizeHolidayCode(input.teamCode ?? input.team_code),
  };
}

function matchesScope(
  holiday: Holiday,
  context: DeveloperHolidayContext,
): HolidayEligibilityReason | null {
  if (!holiday.is_active) {
    return null;
  }

  const scope = holiday.scope as HolidayScope;
  const region = normalizeHolidayCode(holiday.region_code);

  switch (scope) {
    case "national":
      return "national";
    case "state":
      if (!context.stateCode || !region) {
        return null;
      }
      return context.stateCode === region ? "state_match" : null;
    case "city":
      if (!context.cityCode || !region) {
        return null;
      }
      return context.cityCode === region ? "city_match" : null;
    case "team":
      // Require team_id-backed code (empty if no structured team).
      if (!context.teamId || !context.teamCode || !region) {
        return null;
      }
      return context.teamCode === region ? "team_match" : null;
    default:
      return null;
  }
}

/**
 * Filter active holidays applicable to one developer.
 * Empty location/team context → national only.
 */
export function filterHolidaysForDeveloper(
  holidays: Holiday[],
  context: DeveloperHolidayContext,
): ApplicableHoliday[] {
  const applicable: ApplicableHoliday[] = [];

  for (const holiday of holidays) {
    const reason = matchesScope(holiday, context);
    if (reason == null) {
      continue;
    }
    applicable.push({ ...holiday, reason });
  }

  return applicable.sort((a, b) =>
    a.holiday_on === b.holiday_on
      ? a.name.localeCompare(b.name, "pt-BR")
      : a.holiday_on.localeCompare(b.holiday_on),
  );
}

/** National-only view (team reference meta / unknown developer). */
export function filterNationalHolidays(holidays: Holiday[]): ApplicableHoliday[] {
  return filterHolidaysForDeveloper(holidays, {
    stateCode: "",
    cityCode: "",
    teamId: null,
    teamCode: "",
  });
}

export function applicableHolidayDateSet(
  holidays: ApplicableHoliday[],
): Set<string> {
  return new Set(holidays.map((row) => row.holiday_on));
}
