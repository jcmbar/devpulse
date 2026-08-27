import type { JiraStatusGroup } from "@/types/jira-flow-analytics";

export type StgSessionStatus =
  | "draft"
  | "planned"
  | "in_progress"
  | "reviewing"
  | "closed";

export type StgSessionResult =
  | "pending"
  | "approved"
  | "blocked"
  | "waived";

export type StgParticipation = "required" | "optional" | "excluded";

export type StgDefaultParticipantRole = "required" | "optional";

export type StgRunStatus = "pending" | "done" | "partial" | "skipped";

export type StgFindingImpact = "low" | "medium" | "high";

/** Semantic groups only — never literal Jira status names. */
export type StgApprovalPolicy = {
  safe_status_groups: JiraStatusGroup[];
  blocking_impacts: StgFindingImpact[];
  missing_card_blocks_high: boolean;
  unmapped_or_other_blocks: boolean;
};

export type StgModule = {
  id: string;
  team_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type StgScenario = {
  id: string;
  module_id: string;
  name: string;
  summary: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type StgModuleWithScenarios = StgModule & {
  scenarios: StgScenario[];
};

export type StgTeamDefaults = {
  team_id: string;
  default_environment: string;
  approval_policy: StgApprovalPolicy;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type StgDefaultParticipant = {
  id: string;
  team_id: string;
  developer_id: string;
  role: StgDefaultParticipantRole;
  created_at: string;
  updated_at: string;
};

export type StgSession = {
  id: string;
  team_id: string;
  scheduled_on: string;
  version_label: string;
  environment: string;
  status: StgSessionStatus;
  result: StgSessionResult;
  scope_notes: string | null;
  approval_policy_snapshot: StgApprovalPolicy;
  waive_reason: string | null;
  waived_by: string | null;
  waived_at: string | null;
  created_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StgSessionParticipant = {
  id: string;
  session_id: string;
  developer_id: string;
  participation: StgParticipation;
  created_at: string;
  updated_at: string;
};

export type StgSessionScenario = {
  id: string;
  session_id: string;
  module_name: string;
  scenario_name: string;
  summary: string | null;
  source_scenario_id: string | null;
  sort_order: number;
  is_included: boolean;
  created_at: string;
  updated_at: string;
};

export type StgScenarioRun = {
  id: string;
  session_scenario_id: string;
  developer_id: string;
  status: StgRunStatus;
  completed_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type StgFinding = {
  id: string;
  session_id: string;
  session_scenario_id: string | null;
  title: string;
  description: string | null;
  found_by_developer_id: string;
  impact: StgFindingImpact;
  blocks_release: boolean;
  jira_key: string | null;
  jira_issue_id: string | null;
  status_group_cached: JiraStatusGroup | null;
  jira_status_cached: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type StgCoverageStats = {
  expected_runs: number;
  done_runs: number;
  partial_runs: number;
  skipped_runs: number;
  pending_runs: number;
  /** 0–1; null when expected_runs = 0 */
  ratio: number | null;
};

export type OpenStgSessionInput = {
  teamId: string;
  scheduledOn: string;
  versionLabel: string;
  environment?: string;
  scopeNotes?: string | null;
  createdByProfileId?: string | null;
  /** Catalog scenario ids to include; default = all active for team */
  scenarioIds?: string[];
  participants: Array<{
    developerId: string;
    participation: StgParticipation;
  }>;
};

export type UpsertStgModuleInput = {
  teamId: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
  id?: string;
};

export type UpsertStgScenarioInput = {
  moduleId: string;
  name: string;
  summary?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  id?: string;
};
