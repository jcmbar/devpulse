export const JIRA_FLOW_COMPUTATION_VERSION = "flow_v1" as const;

export type JiraStatusGroup =
  | "analysis"
  | "development"
  | "validation"
  | "done"
  | "other";

/** Alias lists per logical group (lowercase match). */
export type JiraStatusGroupMapping = Record<JiraStatusGroup, string[]>;

export type JiraFlowRulesSnapshot = {
  computation_version: typeof JIRA_FLOW_COMPUTATION_VERSION;
  status_groups: JiraStatusGroupMapping;
  as_of: string;
};

export type JiraIssueFlowMetrics = {
  id: string;
  integration_id: string;
  issue_id: string;
  computation_version: string;
  computed_at: string;
  source_issue_updated_at: string | null;
  created_at_jira: string | null;
  resolved_at_jira: string | null;
  is_open: boolean;
  lead_time_ms: number | null;
  aging_ms: number | null;
  time_to_first_assignment_ms: number | null;
  first_develop_at: string | null;
  first_staging_at: string | null;
  time_to_first_develop_ms: number | null;
  time_to_first_staging_ms: number | null;
  reopen_count: number;
  develop_reentry_count: number;
  assignee_change_count: number;
  status_transition_count: number;
  status_dwell_ms: Record<string, number>;
  status_group_dwell_ms: Record<string, number>;
  current_status: string | null;
  current_status_group: JiraStatusGroup | null;
  rules_snapshot: JiraFlowRulesSnapshot;
  created_at: string;
  updated_at: string;
};

export type JiraIssueFlowMetricsWrite = {
  integration_id: string;
  issue_id: string;
  computation_version: string;
  computed_at: string;
  source_issue_updated_at: string | null;
  created_at_jira: string | null;
  resolved_at_jira: string | null;
  is_open: boolean;
  lead_time_ms: number | null;
  aging_ms: number | null;
  time_to_first_assignment_ms: number | null;
  first_develop_at: string | null;
  first_staging_at: string | null;
  time_to_first_develop_ms: number | null;
  time_to_first_staging_ms: number | null;
  reopen_count: number;
  develop_reentry_count: number;
  assignee_change_count: number;
  status_transition_count: number;
  status_dwell_ms: Record<string, number>;
  status_group_dwell_ms: Record<string, number>;
  current_status: string | null;
  current_status_group: JiraStatusGroup | null;
  rules_snapshot: JiraFlowRulesSnapshot;
};

export type ThroughputBucket = {
  periodStart: string;
  periodEnd: string;
  resolvedCount: number;
};
