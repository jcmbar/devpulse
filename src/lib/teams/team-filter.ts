/**
 * Shared team list filter query-param helpers (safe for client + server).
 * Filtering is always by team_id; never by free-form team_code.
 */

export const TEAM_FILTER_UNASSIGNED = "__none__";
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
 * - empty → all
 * - `__none__` → unassigned (team_id IS NULL)
 * - valid UUID → filter by team_id
 * - anything else (e.g. legacy team_code) → all (never filter by code)
 */
export function parseTeamListFilter(
  value: string | null | undefined,
): TeamListFilter {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
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

/** Canonical value for the filter select / URL (never a free-form code). */
export function teamListFilterParam(filter: TeamListFilter): string {
  if (filter.kind === "team") {
    return filter.teamId;
  }
  if (filter.kind === "unassigned") {
    return TEAM_FILTER_UNASSIGNED;
  }
  return "";
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
