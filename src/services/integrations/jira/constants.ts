/** Central constants for Jira Cloud read-sync MVP. */

export const JIRA_API_VERSION = "3" as const;

export const JIRA_DEFAULT_PAGE_SIZE = 50;
export const JIRA_MAX_PAGE_SIZE = 100;

/** Hard stop for `/search/jql` loops (guards + operational safety). */
export const JIRA_MAX_SEARCH_PAGES = 500;

/** Soft concurrency for secondary fetches (changelog / worklogs). */
export const JIRA_SECONDARY_CONCURRENCY = 2;

/** Soft cap per issue when paging dedicated worklog endpoint. */
export const JIRA_MAX_WORKLOGS_PER_ISSUE = 2000;

/** Page size for GET /issue/{id}/changelog. */
export const JIRA_CHANGELOG_PAGE_SIZE = 100;

/** Soft cap per issue when paging dedicated changelog endpoint. */
export const JIRA_MAX_CHANGELOG_HISTORIES_PER_ISSUE = 2000;

export const JIRA_MAX_RETRIES = 5;
export const JIRA_RETRY_BASE_MS = 500;
export const JIRA_RETRY_MAX_MS = 20_000;

/**
 * @deprecated Search fields come from resolveJiraFieldMappings / collectSearchJiraFieldIds.
 * Kept only as a historical reference of former hardcoded defaults.
 */
export const JIRA_ISSUE_FIELDS = [
  "summary",
  "issuetype",
  "status",
  "priority",
  "labels",
  "assignee",
  "reporter",
  "created",
  "updated",
  "resolutiondate",
  "project",
  "parent",
  "duedate",
  "timeoriginalestimate",
] as const;

/**
 * @deprecated Not used. Changelog comes from GET /issue/{id}/changelog.
 * Kept only as a historical marker — do not reintroduce as primary source.
 */
export const JIRA_SEARCH_EXPAND_CHANGELOG_DEPRECATED = ["changelog"] as const;

export const JIRA_SYNC_STATUSES = [
  "pending",
  "running",
  "completed",
  "partial",
  "failed",
] as const;

export const JIRA_SYNC_MODES = ["full", "incremental"] as const;

/** How the pipeline was started (stored on jira_sync_runs.trigger_source). */
export const JIRA_SYNC_TRIGGER_SOURCES = [
  "manual",
  "auto_gestor_load",
  "auto_cron",
] as const;

export type JiraSyncTriggerSource =
  (typeof JIRA_SYNC_TRIGGER_SOURCES)[number];

/** Default cooldown for gestor auto-sync (minutes). Override with env. */
export const JIRA_AUTO_SYNC_COOLDOWN_MINUTES_DEFAULT = 60;

/**
 * Active sync runs older than this are treated as abandoned and marked failed
 * before a new claim.
 */
export const JIRA_SYNC_STALE_MINUTES = 45;

/** Key inside jira_integrations.settings for full-pipeline lease. */
export const JIRA_PIPELINE_LOCK_SETTINGS_KEY = "pipeline_lock";

/** Last background pipeline failure (cleared on next manual start). */
export const JIRA_PIPELINE_LAST_ERROR_KEY = "pipeline_last_error";

/** Key inside jira_integrations.settings for auto-sync cooldown (minutes). */
export const JIRA_AUTO_SYNC_COOLDOWN_SETTINGS_KEY =
  "auto_sync_cooldown_minutes";

const COOLDOWN_MIN = 1;
const COOLDOWN_MAX = 24 * 60;

function parseCooldownMinutes(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < COOLDOWN_MIN) {
    return null;
  }
  return Math.min(COOLDOWN_MAX, Math.floor(parsed));
}

/**
 * Resolve auto-sync cooldown minutes:
 * 1) integration settings.auto_sync_cooldown_minutes (painel Jira)
 * 2) env JIRA_AUTO_SYNC_COOLDOWN_MINUTES
 * 3) default 60
 */
export function resolveJiraAutoSyncCooldownMinutes(
  settings?: Record<string, unknown> | null,
): number {
  const fromSettings = parseCooldownMinutes(
    settings?.[JIRA_AUTO_SYNC_COOLDOWN_SETTINGS_KEY],
  );
  if (fromSettings != null) {
    return fromSettings;
  }

  const raw = process.env.JIRA_AUTO_SYNC_COOLDOWN_MINUTES;
  if (raw == null || raw.trim() === "") {
    return JIRA_AUTO_SYNC_COOLDOWN_MINUTES_DEFAULT;
  }
  const fromEnv = parseCooldownMinutes(raw);
  if (fromEnv == null) {
    return JIRA_AUTO_SYNC_COOLDOWN_MINUTES_DEFAULT;
  }
  return fromEnv;
}

/** Default changelog field names when mappings use system fields. */
export const JIRA_CHANGELOG_FIELDS = {
  status: "status",
  assignee: "assignee",
} as const;

export type JiraChangelogField =
  (typeof JIRA_CHANGELOG_FIELDS)[keyof typeof JIRA_CHANGELOG_FIELDS];
