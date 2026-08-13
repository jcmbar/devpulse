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
