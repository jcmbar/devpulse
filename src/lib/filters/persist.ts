/**
 * Persist last-used filters per surface (cookie).
 * URL remains source of truth; cookies only fill missing durable params.
 */

export type FilterScope =
  | "developer-home"
  | "gestor-dashboard"
  | "gestor-analitico"
  | "gestor-fechamentos"
  | "gestor-folha"
  | "gestor-config"
  | "admin-developers"
  | "admin-imports"
  | "jira-admin"
  | "jira-analytics";

/** Params we never restore from cookies (ephemeral UI / drill-down). */
const EPHEMERAL_KEYS = new Set([
  "detailMonth",
  "page",
  "q",
  "saved",
  "developerId",
  "status",
  "class",
  "holidayScope",
]);

/** Durable keys allowed per scope (order used when serializing). */
export const FILTER_SCOPE_KEYS: Record<FilterScope, readonly string[]> = {
  "developer-home": ["tab", "month", "from", "to", "closingYear"],
  "gestor-dashboard": ["teamId", "source", "month", "from", "to"],
  "gestor-analitico": ["teamId", "source", "month", "from", "to"],
  "gestor-fechamentos": ["teamId", "closingYear", "closingMonth"],
  "gestor-folha": ["teamId", "month"],
  "gestor-config": ["year", "month"],
  "admin-developers": ["teamId", "active", "jiraId"],
  "admin-imports": ["teamId"],
  "jira-admin": ["teamId", "integrationId"],
  "jira-analytics": [
    "integrationId",
    "teamId",
    "from",
    "to",
    "statusGroup",
    "issueType",
    "bucket",
  ],
};

const COOKIE_PREFIX = "dp.filters.";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

export function filterCookieName(scope: FilterScope): string {
  return `${COOKIE_PREFIX}${scope}`;
}

export function pickDurableFilterParams(
  scope: FilterScope,
  input: Record<string, string | null | undefined> | URLSearchParams,
): Record<string, string> {
  const allowed = new Set(FILTER_SCOPE_KEYS[scope]);
  const source =
    input instanceof URLSearchParams
      ? Object.fromEntries(input.entries())
      : input;

  const next: Record<string, string> = {};
  for (const key of FILTER_SCOPE_KEYS[scope]) {
    if (!allowed.has(key) || EPHEMERAL_KEYS.has(key)) {
      continue;
    }
    const value = source[key];
    if (value == null) {
      continue;
    }
    const trimmed = String(value).trim();
    if (!trimmed) {
      continue;
    }
    next[key] = trimmed;
  }

  // Mutual exclusion for date modes.
  if (next.month) {
    delete next.from;
    delete next.to;
  } else if (next.from && next.to) {
    delete next.month;
  } else {
    delete next.from;
    delete next.to;
  }

  return next;
}

export function serializeFilterCookie(
  scope: FilterScope,
  params: Record<string, string | null | undefined> | URLSearchParams,
): string {
  const durable = pickDurableFilterParams(scope, params);
  return encodeURIComponent(JSON.stringify(durable));
}

export function parseFilterCookie(
  scope: FilterScope,
  raw: string | null | undefined,
): Record<string, string> {
  if (!raw) {
    return {};
  }
  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return pickDurableFilterParams(
      scope,
      parsed as Record<string, string | null | undefined>,
    );
  } catch {
    return {};
  }
}

/**
 * Merge stored durable params into the current URL only where keys are absent.
 * Returns null when nothing changes.
 */
export function mergeMissingFilterParams(input: {
  scope: FilterScope;
  pathname: string;
  searchParams: Record<string, string | string[] | undefined> | URLSearchParams;
  stored: Record<string, string>;
}): string | null {
  const current = toFlatParams(input.searchParams);
  const stored = pickDurableFilterParams(input.scope, input.stored);
  if (Object.keys(stored).length === 0) {
    return null;
  }

  const next = { ...current };
  let changed = false;

  const hasDateInUrl = Boolean(
    current.month || (current.from && current.to),
  );
  const hasDateInStore = Boolean(
    stored.month || (stored.from && stored.to),
  );

  for (const key of FILTER_SCOPE_KEYS[input.scope]) {
    if (EPHEMERAL_KEYS.has(key)) {
      continue;
    }
    if (key === "month" || key === "from" || key === "to") {
      continue;
    }
    if (!current[key] && stored[key]) {
      next[key] = stored[key];
      changed = true;
    }
  }

  if (!hasDateInUrl && hasDateInStore) {
    if (stored.month) {
      next.month = stored.month;
      delete next.from;
      delete next.to;
      changed = true;
    } else if (stored.from && stored.to) {
      next.from = stored.from;
      next.to = stored.to;
      delete next.month;
      changed = true;
    }
  }

  if (!changed) {
    return null;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (value) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `${input.pathname}?${query}` : input.pathname;
}

function toFlatParams(
  searchParams: Record<string, string | string[] | undefined> | URLSearchParams,
): Record<string, string> {
  if (searchParams instanceof URLSearchParams) {
    return Object.fromEntries(searchParams.entries());
  }
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    if (value == null) {
      continue;
    }
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw != null && String(raw).trim()) {
      next[key] = String(raw).trim();
    }
  }
  return next;
}

export function buildFilterCookieHeader(
  scope: FilterScope,
  params: Record<string, string | null | undefined> | URLSearchParams,
): string {
  const name = filterCookieName(scope);
  const value = serializeFilterCookie(scope, params);
  return `${name}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}
