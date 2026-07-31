/**
 * Preserve dashboard query params when drilling into issue audit.
 */
export function buildAuditHref(
  issueId: string,
  query: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value && value !== "all") {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return `/app/jira/analytics/issues/${issueId}${qs ? `?${qs}` : ""}`;
}
