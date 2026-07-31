/**
 * Why safety overlap exists (incremental sync):
 *
 * Jira Cloud search is NOT a transactional snapshot. While we paginate with
 * `nextPageToken`, issues can be created/updated and ranking by `updated ASC`
 * can shift. A cursor advanced to `max(updated)` from a previous run can also
 * miss updates that share the same truncated JQL minute boundary, or updates
 * that landed slightly before the cursor but were not fully returned.
 *
 * Overlap rewinds `sync_cursor_updated_at` by N minutes so the next run
 * intentionally re-fetches a small window. Upserts are idempotent
 * (integration_id + jira_id / changelog / worklog ids), so duplicates are safe.
 *
 * Consistency therefore comes from (overlap + idempotent upsert), not from
 * assuming a stable search snapshot.
 *
 * JQL datetime timezone:
 * Atlassian interprets `"yyyy-MM-dd HH:mm"` literals in the **timezone of the
 * user running the search** (the integration email / API token identity).
 * Serializing UTC wall-clock digits into that literal advances the window by
 * the site offset and skips recent updates (see AP-7677). Always format in the
 * resolved JQL timezone (myself.timeZone, else env, else default).
 */

import type { JiraIntegration } from "@/types/jira-integration";
import type { JiraSyncRunMode } from "@/types/jira-integration";

/** Fallback when `/myself.timeZone` and `JIRA_JQL_TIMEZONE` are unavailable. */
export const DEFAULT_JIRA_JQL_TIMEZONE = "America/Sao_Paulo";

function escapeJqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve timezone for JQL datetime literals.
 * Priority: explicit → `JIRA_JQL_TIMEZONE` env → default.
 */
export function resolveJiraJqlTimeZone(
  candidate?: string | null,
): string {
  const explicit = candidate?.trim();
  if (explicit && isValidIanaTimeZone(explicit)) {
    return explicit;
  }

  const fromEnv =
    typeof process !== "undefined"
      ? process.env.JIRA_JQL_TIMEZONE?.trim()
      : undefined;
  if (fromEnv && isValidIanaTimeZone(fromEnv)) {
    return fromEnv;
  }

  return DEFAULT_JIRA_JQL_TIMEZONE;
}

/**
 * Format an instant as Jira JQL datetime `"yyyy-MM-dd HH:mm"` in `timeZone`.
 * Truncates to minute (JQL has no seconds) — another reason for overlap.
 */
export function formatJiraDateTime(
  instant: Date | string,
  timeZone: string = DEFAULT_JIRA_JQL_TIMEZONE,
): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Data inválida para JQL: ${String(instant)}`);
  }

  const zone = resolveJiraJqlTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export type SyncWindow = {
  mode: JiraSyncRunMode;
  cursorFrom: Date;
  cursorTo: Date;
  /** Cursor before overlap rewind (null on full). */
  rawCursor: Date | null;
  overlapMinutes: number;
  /** IANA zone used to serialize `updated >= "..."` . */
  jqlTimeZone: string;
  jql: string;
};

function buildJql(input: {
  projectKeys: string[];
  cursorFrom: Date;
  jqlExtra: string | null;
  timeZone: string;
}): string {
  const projectKeys = input.projectKeys
    .map((key) => key.trim())
    .filter(Boolean);
  const clauses: string[] = [];

  if (projectKeys.length === 1) {
    clauses.push(`project = "${escapeJqlString(projectKeys[0])}"`);
  } else if (projectKeys.length > 1) {
    const list = projectKeys
      .map((key) => `"${escapeJqlString(key)}"`)
      .join(", ");
    clauses.push(`project in (${list})`);
  }

  clauses.push(
    `updated >= "${formatJiraDateTime(input.cursorFrom, input.timeZone)}"`,
  );

  const extra = input.jqlExtra?.trim() ?? "";
  if (extra) {
    if (/\border\s+by\b/i.test(extra)) {
      throw new Error(
        "JQL extra não pode conter ORDER BY; a ordenação é controlada pelo sync.",
      );
    }
    clauses.push(`(${extra})`);
  }

  // ORDER BY is deliberately outside the AND-joined filter clauses.
  return `${clauses.join(" AND ")} ORDER BY updated ASC, key ASC`;
}

/**
 * Build sync window + JQL.
 * Incremental = last cursor minus safety overlap; full = sync_window_days.
 */
export function buildSyncWindow(
  integration: JiraIntegration,
  options?: { timeZone?: string | null },
): SyncWindow {
  const now = new Date();
  const overlapMinutes = integration.safety_overlap_minutes;
  const jqlTimeZone = resolveJiraJqlTimeZone(options?.timeZone);

  let mode: JiraSyncRunMode = "full";
  let cursorFrom: Date;
  let rawCursor: Date | null = null;

  if (integration.sync_cursor_updated_at) {
    mode = "incremental";
    rawCursor = new Date(integration.sync_cursor_updated_at);
    // Rewind so boundary issues and in-flight updates are reprocessed safely.
    cursorFrom = new Date(rawCursor.getTime() - overlapMinutes * 60_000);
  } else {
    cursorFrom = new Date(
      now.getTime() - integration.sync_window_days * 24 * 60 * 60_000,
    );
  }

  return {
    mode,
    cursorFrom,
    cursorTo: now,
    rawCursor,
    overlapMinutes,
    jqlTimeZone,
    jql: buildJql({
      projectKeys: integration.project_keys,
      cursorFrom,
      jqlExtra: integration.jql_extra,
      timeZone: jqlTimeZone,
    }),
  };
}
