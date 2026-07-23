/**
 * Shared admin list query params: teamId + q + page.
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

export const DEFAULT_ADMIN_PAGE_SIZE = 20;

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

export function parseAdminListQuery(
  params: {
    teamId?: string | null;
    q?: string | null;
    page?: string | null;
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
  };
}

export type AdminListHrefInput = {
  teamId?: string | null;
  q?: string | null;
  page?: number | null;
};

/** Build query string preserving only known admin list params. */
export function buildAdminListSearchParams(
  input: AdminListHrefInput,
): URLSearchParams {
  const params = new URLSearchParams();
  const teamId = (input.teamId ?? "").trim();
  const q = parseSearchQuery(input.q);
  const page = input.page ?? 1;

  if (teamId) {
    params.set(TEAM_FILTER_PARAM, teamId);
  }
  if (q) {
    params.set(SEARCH_PARAM, q);
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
  input: { filter: TeamListFilter; q?: string },
): string {
  const q = parseSearchQuery(input.q);
  if (q) {
    if (entity === "developer") {
      return `Nenhum developer encontrado para “${q}”.`;
    }
    return `Nenhuma importação encontrada para “${q}”.`;
  }
  return teamFilterEmptyMessage(entity, input.filter);
}
