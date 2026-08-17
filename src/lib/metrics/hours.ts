/**
 * Jira REST `timeoriginalestimate` / similar fields are always seconds.
 * Do not treat small values as hours — 1 minute is 60 seconds, not 60h.
 */
export function jiraEstimateSecondsToHours(
  value: number | null,
): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return roundHours(value / 3600);
}

/**
 * Coerce a Jira estimate field (seconds, numeric string, or timetracking
 * object) into seconds. Does not treat the number as hours.
 */
export function jiraEstimateFieldToSeconds(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    const nested =
      rec.originalEstimateSeconds ??
      rec.timeoriginalestimate ??
      rec.timeOriginalEstimate;
    return jiraEstimateFieldToSeconds(nested);
  }
  return null;
}

export function jiraEstimateFieldToHours(value: unknown): number | null {
  return jiraEstimateSecondsToHours(jiraEstimateFieldToSeconds(value));
}

/**
 * Compilado / Gestor must not trust `jira_issues.estimate_hours` when the
 * raw Jira seconds are still on the payload. Older syncs stored values < 1000
 * as hours (1 minute / 60s → 60h).
 */
export function estimateHoursFromPersistedJiraIssue(input: {
  estimateHours: number | null;
  originalEstimateSeconds: unknown;
}): number | null {
  const fromSeconds = jiraEstimateFieldToHours(input.originalEstimateSeconds);
  if (fromSeconds != null) {
    return fromSeconds;
  }
  if (input.estimateHours == null || !Number.isFinite(input.estimateHours)) {
    return null;
  }
  return roundHours(input.estimateHours);
}

/**
 * Normalize spreadsheet hour values to decimal hours.
 *
 * Handles:
 * - already decimal hours (e.g. 8, 1.5)
 * - Jira-exported seconds (e.g. 3600 → 1h)
 * - Excel time fractions of a day (e.g. 0.04166 → 1h)
 *
 * Spreadsheet-only. Jira API estimates must use `jiraEstimateSecondsToHours`.
 */
export function toDecimalHours(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  // Excel time fraction (less than 1 day)
  if (value > 0 && value < 1) {
    return roundHours(value * 24);
  }

  // Likely seconds from Jira original estimate / time spent
  if (Math.abs(value) >= 1000) {
    return roundHours(value / 3600);
  }

  return roundHours(value);
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}
