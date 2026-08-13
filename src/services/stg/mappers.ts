import type { JiraStatusGroup } from "@/types/jira-flow-analytics";
import { parseStgApprovalPolicy } from "@/services/stg/constants";
import type {
  StgDefaultParticipant,
  StgFinding,
  StgModule,
  StgScenario,
  StgScenarioRun,
  StgSession,
  StgSessionParticipant,
  StgSessionScenario,
  StgTeamDefaults,
} from "@/types/stg";

export function mapStgModule(row: Record<string, unknown>): StgModule {
  return {
    id: String(row.id),
    team_id: String(row.team_id),
    name: String(row.name),
    sort_order: Number(row.sort_order ?? 0),
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function mapStgScenario(row: Record<string, unknown>): StgScenario {
  return {
    id: String(row.id),
    module_id: String(row.module_id),
    name: String(row.name),
    summary: (row.summary as string | null) ?? null,
    sort_order: Number(row.sort_order ?? 0),
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function mapStgTeamDefaults(
  row: Record<string, unknown>,
): StgTeamDefaults {
  return {
    team_id: String(row.team_id),
    default_environment: String(row.default_environment ?? "staging"),
    approval_policy: parseStgApprovalPolicy(row.approval_policy),
    notes: (row.notes as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function mapStgDefaultParticipant(
  row: Record<string, unknown>,
): StgDefaultParticipant {
  return {
    id: String(row.id),
    team_id: String(row.team_id),
    developer_id: String(row.developer_id),
    role: row.role as StgDefaultParticipant["role"],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function mapStgSession(row: Record<string, unknown>): StgSession {
  return {
    id: String(row.id),
    team_id: String(row.team_id),
    scheduled_on: String(row.scheduled_on).slice(0, 10),
    version_label: String(row.version_label),
    environment: String(row.environment ?? "staging"),
    status: row.status as StgSession["status"],
    result: row.result as StgSession["result"],
    scope_notes: (row.scope_notes as string | null) ?? null,
    approval_policy_snapshot: parseStgApprovalPolicy(
      row.approval_policy_snapshot,
    ),
    waive_reason: (row.waive_reason as string | null) ?? null,
    waived_by: (row.waived_by as string | null) ?? null,
    waived_at: (row.waived_at as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    closed_at: (row.closed_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function mapStgSessionParticipant(
  row: Record<string, unknown>,
): StgSessionParticipant {
  return {
    id: String(row.id),
    session_id: String(row.session_id),
    developer_id: String(row.developer_id),
    participation: row.participation as StgSessionParticipant["participation"],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function mapStgSessionScenario(
  row: Record<string, unknown>,
): StgSessionScenario {
  return {
    id: String(row.id),
    session_id: String(row.session_id),
    module_name: String(row.module_name),
    scenario_name: String(row.scenario_name),
    summary: (row.summary as string | null) ?? null,
    source_scenario_id: (row.source_scenario_id as string | null) ?? null,
    sort_order: Number(row.sort_order ?? 0),
    is_included: Boolean(row.is_included),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function mapStgScenarioRun(row: Record<string, unknown>): StgScenarioRun {
  return {
    id: String(row.id),
    session_scenario_id: String(row.session_scenario_id),
    developer_id: String(row.developer_id),
    status: row.status as StgScenarioRun["status"],
    completed_at: (row.completed_at as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function asStatusGroup(
  value: unknown,
): JiraStatusGroup | null {
  if (
    value === "analysis" ||
    value === "development" ||
    value === "validation" ||
    value === "done" ||
    value === "other"
  ) {
    return value;
  }
  return null;
}

export function mapStgFinding(row: Record<string, unknown>): StgFinding {
  return {
    id: String(row.id),
    session_id: String(row.session_id),
    session_scenario_id: (row.session_scenario_id as string | null) ?? null,
    title: String(row.title),
    description: (row.description as string | null) ?? null,
    found_by_developer_id: String(row.found_by_developer_id),
    impact: row.impact as StgFinding["impact"],
    blocks_release: Boolean(row.blocks_release),
    jira_key: (row.jira_key as string | null) ?? null,
    jira_issue_id: (row.jira_issue_id as string | null) ?? null,
    status_group_cached: asStatusGroup(row.status_group_cached),
    jira_status_cached: (row.jira_status_cached as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}
