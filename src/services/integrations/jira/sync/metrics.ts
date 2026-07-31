/** Stop / guard reasons for Jira `/search/jql` pagination. */
export type JiraSyncStopReason =
  | "is_last"
  | "empty_next_page_token"
  | "missing_next_page_token"
  | "repeated_next_page_token"
  | "repeated_page_content"
  | "max_pages"
  | "empty_first_page"
  | "collector_error"
  | "completed";

export type JiraSyncRunMetrics = {
  stop_reason: JiraSyncStopReason;
  stop_detail: string | null;
  tokens_seen: number;
  pages_repeated: number;
  issues_reprocessed: number;
  issues_new: number;
  worklogs_fetched: number;
  worklog_issue_requests: number;
  changelog_issues_processed: number;
  changelog_histories_fetched: number;
  changelog_issue_requests: number;
  changelog_pages_fetched: number;
  changelog_capped_issues: number;
  unique_issue_keys: number;
  max_updated_at: string | null;
  overlap_minutes: number | null;
  raw_cursor: string | null;
  cursor_advanced: boolean;
  /** IANA zone used when serializing JQL `updated >= "…"`. */
  jql_timezone: string | null;
};

export class JiraPaginationError extends Error {
  readonly stopReason: JiraSyncStopReason;
  readonly metrics: Partial<JiraSyncRunMetrics>;

  constructor(
    stopReason: JiraSyncStopReason,
    message: string,
    metrics: Partial<JiraSyncRunMetrics> = {},
  ) {
    super(message);
    this.name = "JiraPaginationError";
    this.stopReason = stopReason;
    this.metrics = metrics;
  }
}

export function createEmptySyncMetrics(
  partial?: Partial<JiraSyncRunMetrics>,
): JiraSyncRunMetrics {
  return {
    stop_reason: "collector_error",
    stop_detail: null,
    tokens_seen: 0,
    pages_repeated: 0,
    issues_reprocessed: 0,
    issues_new: 0,
    worklogs_fetched: 0,
    worklog_issue_requests: 0,
    changelog_issues_processed: 0,
    changelog_histories_fetched: 0,
    changelog_issue_requests: 0,
    changelog_pages_fetched: 0,
    changelog_capped_issues: 0,
    unique_issue_keys: 0,
    max_updated_at: null,
    overlap_minutes: null,
    raw_cursor: null,
    cursor_advanced: false,
    jql_timezone: null,
    ...partial,
  };
}
