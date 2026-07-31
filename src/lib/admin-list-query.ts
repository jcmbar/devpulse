/**
 * Shared admin list query params: teamId + q + page (+ optional developer filters).
 * teamId filtering is always by team_id (see team-filter.ts); never team_code.
 */

import {
  TEAM_FILTER_PARAM,
  parseTeamListFilter,
  teamFilterEmptyMessage,
  teamListFilterParam,
  toTeamScopedListInput,
  type TeamListFilter,
  type TeamScopedListInput,
} from "@/lib/teams/team-filter";

export const SEARCH_PARAM = "q";
export const PAGE_PARAM = "page";
export const ACTIVE_FILTER_PARAM = "active";
export const JIRA_ACCOUNT_FILTER_PARAM = "jiraId";

export const DEFAULT_ADMIN_PAGE_SIZE = 20;

export type ActiveListFilter = "all" | "active" | "inactive";
export type JiraAccountListFilter = "all" | "with" | "without";

export type AdminListQuery = {
  teamFilter: TeamListFilter;
  /** Canonical teamId param for UI/URL (empty | uuid | __none__). */
  teamParam: string;
  /** Raw teamId from URL (may be invalid / legacy code). */
  rawTeamId: string;
  /** True when URL teamId should be rewritten to canonical. */
  teamIdNeedsCanonicalize: boolean;
  q: string;
  page: number;
  pageSize: number;
  teamScope: TeamScopedListInput;
  /** Developers list: cadastro ativo/inativo. */
  activeFilter: ActiveListFilter;
  /** Developers list: presença de jira_account_id. */
  jiraAccountFilter: JiraAccountListFilter;
};

export function parseSearchQuery(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, 120);
}

export function parsePageParam(value: string | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) {
    return 1;
  }
  return Math.floor(n);
}

export function parseActiveListFilter(
  value: string | null | undefined,
): ActiveListFilter {
  if (value === "active" || value === "inactive") {
    return value;
  }
  return "all";
}

export function parseJiraAccountListFilter(
  value: string | null | undefined,
): JiraAccountListFilter {
  if (value === "with" || value === "without") {
    return value;
  }
  return "all";
}

export function parseAdminListQuery(
  params: {
    teamId?: string | null;
    q?: string | null;
    page?: string | null;
    active?: string | null;
    jiraId?: string | null;
  },
  options?: { pageSize?: number },
): AdminListQuery {
  const rawTeamId = (params.teamId ?? "").trim();
  const teamFilter = parseTeamListFilter(rawTeamId);
  const teamParam = teamListFilterParam(teamFilter);
  const pageSize = options?.pageSize ?? DEFAULT_ADMIN_PAGE_SIZE;

  return {
    teamFilter,
    teamParam,
    rawTeamId,
    teamIdNeedsCanonicalize: Boolean(rawTeamId) && rawTeamId !== teamParam,
    q: parseSearchQuery(params.q),
    page: parsePageParam(params.page),
    pageSize,
    teamScope: toTeamScopedListInput(teamFilter),
    activeFilter: parseActiveListFilter(params.active),
    jiraAccountFilter: parseJiraAccountListFilter(params.jiraId),
  };
}

export type AdminListHrefInput = {
  teamId?: string | null;
  q?: string | null;
  page?: number | null;
  active?: ActiveListFilter | null;
  jiraId?: JiraAccountListFilter | null;
};

/** Build query string preserving only known admin list params. */
export function buildAdminListSearchParams(
  input: AdminListHrefInput,
): URLSearchParams {
  const params = new URLSearchParams();
  const teamId = (input.teamId ?? "").trim();
  const q = parseSearchQuery(input.q);
  const page = input.page ?? 1;
  const active = input.active ?? "all";
  const jiraId = input.jiraId ?? "all";

  if (teamId) {
    params.set(TEAM_FILTER_PARAM, teamId);
  }
  if (q) {
    params.set(SEARCH_PARAM, q);
  }
  if (active !== "all") {
    params.set(ACTIVE_FILTER_PARAM, active);
  }
  if (jiraId !== "all") {
    params.set(JIRA_ACCOUNT_FILTER_PARAM, jiraId);
  }
  if (page > 1) {
    params.set(PAGE_PARAM, String(page));
  }

  return params;
}

export function adminListHref(
  pathname: string,
  input: AdminListHrefInput,
): string {
  const query = buildAdminListSearchParams(input).toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Patch current URLSearchParams for client navigations.
 * - empty teamId / q → delete
 * - resetPage or page<=1 → delete page
 */
export function patchAdminListSearchParams(
  current: URLSearchParams,
  patch: {
    teamId?: string | null;
    q?: string | null;
    page?: number | null;
    resetPage?: boolean;
    active?: ActiveListFilter | null;
    jiraId?: JiraAccountListFilter | null;
  },
): URLSearchParams {
  const next = new URLSearchParams(current.toString());

  if (patch.teamId !== undefined) {
    const teamId = (patch.teamId ?? "").trim();
    if (!teamId) {
      next.delete(TEAM_FILTER_PARAM);
    } else {
      next.set(TEAM_FILTER_PARAM, teamId);
    }
  }

  if (patch.q !== undefined) {
    const q = parseSearchQuery(patch.q);
    if (!q) {
      next.delete(SEARCH_PARAM);
    } else {
      next.set(SEARCH_PARAM, q);
    }
  }

  if (patch.active !== undefined) {
    if (!patch.active || patch.active === "all") {
      next.delete(ACTIVE_FILTER_PARAM);
    } else {
      next.set(ACTIVE_FILTER_PARAM, patch.active);
    }
  }

  if (patch.jiraId !== undefined) {
    if (!patch.jiraId || patch.jiraId === "all") {
      next.delete(JIRA_ACCOUNT_FILTER_PARAM);
    } else {
      next.set(JIRA_ACCOUNT_FILTER_PARAM, patch.jiraId);
    }
  }

  if (patch.resetPage) {
    next.delete(PAGE_PARAM);
  } else if (patch.page != null) {
    if (patch.page <= 1) {
      next.delete(PAGE_PARAM);
    } else {
      next.set(PAGE_PARAM, String(Math.floor(patch.page)));
    }
  }

  return next;
}

export type PaginatedList<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function toPaginatedList<T>(input: {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}): PaginatedList<T> {
  const pageSize = Math.max(1, input.pageSize);
  const total = Math.max(0, input.total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const page = Math.min(Math.max(1, input.page), totalPages);
  return {
    items: input.items,
    total,
    page,
    pageSize,
    totalPages,
  };
}

export function listEmptyMessage(
  entity: "developer" | "import",
  input: {
    filter: TeamListFilter;
    q?: string;
    activeFilter?: ActiveListFilter;
    jiraAccountFilter?: JiraAccountListFilter;
  },
): string {
  const q = parseSearchQuery(input.q);
  if (q) {
    if (entity === "developer") {
      return `Nenhum developer encontrado para “${q}”.`;
    }
    return `Nenhuma importação encontrada para “${q}”.`;
  }

  if (entity === "developer") {
    const parts: string[] = [];
    if (input.activeFilter === "active") {
      parts.push("ativos");
    } else if (input.activeFilter === "inactive") {
      parts.push("inativos");
    }
    if (input.jiraAccountFilter === "with") {
      parts.push("com Jira Account ID");
    } else if (input.jiraAccountFilter === "without") {
      parts.push("sem Jira Account ID");
    }
    if (parts.length > 0) {
      return `Nenhum developer ${parts.join(" e ")} neste filtro.`;
    }
  }

  return teamFilterEmptyMessage(entity, input.filter);
}
