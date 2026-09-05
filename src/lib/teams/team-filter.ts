/**
 * Shared team list filter query-param helpers (safe for client + server).
 * Filtering is always by team_id; never by free-form team_code.
 */

export const TEAM_FILTER_UNASSIGNED = "__none__";
/** Explicit “all teams” for URL/cookies (empty param is ambiguous vs “missing”). */
export const TEAM_FILTER_ALL = "__all__";
export const TEAM_FILTER_PARAM = "teamId";

const TEAM_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TeamListFilter =
  | { kind: "all" }
  | { kind: "team"; teamId: string }
  | { kind: "unassigned" };

export type TeamScopedListInput = {
  teamId?: string | null;
  unassignedOnly?: boolean;
};

/**
 * Parse `teamId` search param.
 * - empty / `__all__` → all
 * - `__none__` → unassigned (team_id IS NULL)
 * - valid UUID → filter by team_id
 * - anything else (e.g. legacy team_code) → all (never filter by code)
 */
export function parseTeamListFilter(
  value: string | null | undefined,
): TeamListFilter {
  const trimmed = (value ?? "").trim();
  if (!trimmed || trimmed === TEAM_FILTER_ALL) {
    return { kind: "all" };
  }
  if (trimmed === TEAM_FILTER_UNASSIGNED) {
    return { kind: "unassigned" };
  }
  if (!TEAM_ID_UUID_RE.test(trimmed)) {
    return { kind: "all" };
  }
  return { kind: "team", teamId: trimmed };
}

/**
 * Canonical value for selects / persistence.
 * Uses `__all__` so “todos” is not confused with a missing param on restore.
 */
export function teamListFilterParam(filter: TeamListFilter): string {
  if (filter.kind === "team") {
    return filter.teamId;
  }
  if (filter.kind === "unassigned") {
    return TEAM_FILTER_UNASSIGNED;
  }
  return TEAM_FILTER_ALL;
}

/** Real team UUID for APIs, or null when filter is all/unassigned. */
export function teamListFilterTeamId(filter: TeamListFilter): string | null {
  return filter.kind === "team" ? filter.teamId : null;
}

/** Map parsed filter → service list options (team_id only). */
export function toTeamScopedListInput(
  filter: TeamListFilter,
): TeamScopedListInput {
  if (filter.kind === "team") {
    return { teamId: filter.teamId, unassignedOnly: false };
  }
  if (filter.kind === "unassigned") {
    return { teamId: null, unassignedOnly: true };
  }
  return {};
}

export function teamFilterEmptyMessage(
  entity: "developer" | "import",
  filter: TeamListFilter,
): string {
  if (entity === "developer") {
    if (filter.kind === "unassigned") {
      return "Nenhum developer sem time (team_id nulo).";
    }
    if (filter.kind === "team") {
      return "Nenhum developer neste time.";
    }
    return "Nenhum developer cadastrado ainda.";
  }

  if (filter.kind === "unassigned") {
    return "Nenhuma importação sem time (team_id nulo).";
  }
  if (filter.kind === "team") {
    return "Nenhuma importação neste time.";
  }
  return "Nenhuma importação registrada ainda.";
}
