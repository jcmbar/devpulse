export type JiraSyncRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "partial"
  | "failed";

export type JiraSyncRunMode = "full" | "incremental";

/**
 * DevPulse logical field key → Jira field id (system or custom).
 * Keys come from DEVPULSE_JIRA_FIELD_CATALOG; extra keys are preserved.
 */
export type JiraFieldMappings = {
  [key: string]: string | undefined;
};

export type JiraIntegration = {
  id: string;
  team_id: string;
  name: string;
  base_url: string;
  email: string;
  api_token_secret_ref: string;
  is_enabled: boolean;
  project_keys: string[];
  jql_extra: string | null;
  sync_window_days: number;
  safety_overlap_minutes: number;
  include_worklogs: boolean;
  include_changelog: boolean;
  sync_cursor_updated_at: string | null;
  last_successful_sync_at: string | null;
  field_mappings: JiraFieldMappings;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type JiraIntegrationWriteInput = {
  teamId: string;
  name: string;
  baseUrl: string;
  email: string;
  apiTokenSecretRef: string;
  isEnabled?: boolean;
  projectKeys?: string[];
  jqlExtra?: string | null;
  syncWindowDays?: number;
  safetyOverlapMinutes?: number;
  includeWorklogs?: boolean;
  includeChangelog?: boolean;
  fieldMappings?: JiraFieldMappings;
  /** Minutes between automatic syncs; stored in settings. */
  autoSyncCooldownMinutes?: number;
};

export type JiraSyncRun = {
  id: string;
  integration_id: string;
  mode: JiraSyncRunMode;
  status: JiraSyncRunStatus;
  trigger_source: string;
  started_at: string | null;
  finished_at: string | null;
  cursor_from: string | null;
  cursor_to: string | null;
  jql: string | null;
  issues_fetched: number;
  issues_upserted: number;
  status_events_upserted: number;
  assignee_events_upserted: number;
  worklogs_upserted: number;
  pages_fetched: number;
  api_requests: number;
  error_message: string | null;
  error_details: Record<string, unknown> | null;
  metrics: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type JiraProject = {
  id: string;
  integration_id: string;
  jira_id: string;
  key: string;
  name: string;
  style: string | null;
  /** Project overrides for logical→Jira field ids. */
  field_mappings: JiraFieldMappings;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JiraIssue = {
  id: string;
  integration_id: string;
  project_id: string | null;
  jira_id: string;
  jira_key: string;
  summary: string | null;
  issue_type: string | null;
  status: string | null;
  status_category: string | null;
  priority: string | null;
  labels: string[];
  assignee_account_id: string | null;
  assignee_display_name: string | null;
  reporter_account_id: string | null;
  story_points: number | null;
  created_at_jira: string | null;
  updated_at_jira: string | null;
  resolved_at_jira: string | null;
  /** Mapped Entrega p/ Teste Unitário (date-only). */
  unit_test_delivery_on?: string | null;
  due_on?: string | null;
  estimate_hours?: number | null;
  parent_key?: string | null;
  content_hash: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JiraIssueStatusEvent = {
  id: string;
  integration_id: string;
  issue_id: string;
  jira_changelog_id: string;
  from_status: string | null;
  to_status: string | null;
  from_status_id: string | null;
  to_status_id: string | null;
  changed_at: string;
  author_account_id: string | null;
};

export type JiraIssueAssigneeEvent = {
  id: string;
  integration_id: string;
  issue_id: string;
  jira_changelog_id: string;
  from_account_id: string | null;
  to_account_id: string | null;
  from_display_name: string | null;
  to_display_name: string | null;
  changed_at: string;
  author_account_id: string | null;
};

export type JiraWorklog = {
  id: string;
  integration_id: string;
  issue_id: string;
  jira_worklog_id: string;
  author_account_id: string | null;
  author_display_name: string | null;
  time_spent_seconds: number;
  started_at: string | null;
  created_at_jira: string | null;
  updated_at_jira: string | null;
  comment_text: string | null;
  last_synced_at: string | null;
};
