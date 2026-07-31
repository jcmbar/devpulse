import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  classifyStatusDetailed,
  resolveStatusGroupMapping,
  type StatusClassification,
} from "@/services/analytics/jira/status-mapping";
import { getJiraIntegration } from "@/services/integrations/jira";
import type { JiraIssueFlowMetrics } from "@/types/jira-flow-analytics";

export type IssueFlowInspection = {
  issue: {
    id: string;
    jira_key: string;
    summary: string | null;
    status: string | null;
    status_category: string | null;
    assignee_account_id: string | null;
    assignee_display_name: string | null;
    created_at_jira: string | null;
    updated_at_jira: string | null;
    resolved_at_jira: string | null;
  };
  metrics: JiraIssueFlowMetrics | null;
  currentStatusClassification: StatusClassification;
  statusTimeline: Array<{
    changed_at: string;
    from_status: string | null;
    to_status: string | null;
    from_group: string;
    to_group: string;
    from_match: StatusClassification["matchedBy"];
    to_match: StatusClassification["matchedBy"];
  }>;
  assigneeTimeline: Array<{
    changed_at: string;
    from_account_id: string | null;
    to_account_id: string | null;
    from_display_name: string | null;
    to_display_name: string | null;
  }>;
  dwellByStatus: Array<{ status: string; dwell_ms: number; group: string; matchedBy: string }>;
  dwellByGroup: Array<{ group: string; dwell_ms: number }>;
  warnings: string[];
};

function mapMetrics(row: Record<string, unknown>): JiraIssueFlowMetrics {
  return {
    id: String(row.id),
    integration_id: String(row.integration_id),
    issue_id: String(row.issue_id),
    computation_version: String(row.computation_version),
    computed_at: String(row.computed_at),
    source_issue_updated_at:
      (row.source_issue_updated_at as string | null) ?? null,
    created_at_jira: (row.created_at_jira as string | null) ?? null,
    resolved_at_jira: (row.resolved_at_jira as string | null) ?? null,
    is_open: Boolean(row.is_open),
    lead_time_ms: row.lead_time_ms == null ? null : Number(row.lead_time_ms),
    aging_ms: row.aging_ms == null ? null : Number(row.aging_ms),
    time_to_first_assignment_ms:
      row.time_to_first_assignment_ms == null
        ? null
        : Number(row.time_to_first_assignment_ms),
    first_develop_at: (row.first_develop_at as string | null) ?? null,
    first_staging_at: (row.first_staging_at as string | null) ?? null,
    time_to_first_develop_ms:
      row.time_to_first_develop_ms == null
        ? null
        : Number(row.time_to_first_develop_ms),
    time_to_first_staging_ms:
      row.time_to_first_staging_ms == null
        ? null
        : Number(row.time_to_first_staging_ms),
    reopen_count: Number(row.reopen_count ?? 0),
    develop_reentry_count: Number(row.develop_reentry_count ?? 0),
    assignee_change_count: Number(row.assignee_change_count ?? 0),
    status_transition_count: Number(row.status_transition_count ?? 0),
    status_dwell_ms:
      row.status_dwell_ms && typeof row.status_dwell_ms === "object"
        ? (row.status_dwell_ms as Record<string, number>)
        : {},
    status_group_dwell_ms:
      row.status_group_dwell_ms && typeof row.status_group_dwell_ms === "object"
        ? (row.status_group_dwell_ms as Record<string, number>)
        : {},
    current_status: (row.current_status as string | null) ?? null,
    current_status_group:
      (row.current_status_group as JiraIssueFlowMetrics["current_status_group"]) ??
      null,
    rules_snapshot:
      row.rules_snapshot && typeof row.rules_snapshot === "object"
        ? (row.rules_snapshot as JiraIssueFlowMetrics["rules_snapshot"])
        : {
            computation_version: "flow_v1",
            status_groups: {
              analysis: [],
              development: [],
              validation: [],
              done: [],
              other: [],
            },
            as_of: String(row.computed_at),
          },
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/**
 * Audit package for one issue: metrics + timelines + classification provenance.
 * Read-only over local tables (no Jira API).
 */
export async function inspectIssueFlow(input: {
  integrationId: string;
  issueId: string;
}): Promise<IssueFlowInspection | null> {
  const integration = await getJiraIntegration(input.integrationId);
  if (!integration) {
    return null;
  }

  const mapping = resolveStatusGroupMapping(integration.settings);
  const supabase = await createClient();

  const { data: issue, error: issueError } = await supabase
    .from("jira_issues")
    .select(
      "id, jira_key, summary, status, status_category, assignee_account_id, assignee_display_name, created_at_jira, updated_at_jira, resolved_at_jira",
    )
    .eq("integration_id", input.integrationId)
    .eq("id", input.issueId)
    .maybeSingle();

  if (issueError) {
    throw new Error(`Falha ao carregar issue: ${issueError.message}`);
  }
  if (!issue) {
    return null;
  }

  const [{ data: metricsRow }, { data: statusEvents }, { data: assigneeEvents }] =
    await Promise.all([
      supabase
        .from("jira_issue_flow_metrics")
        .select("*")
        .eq("issue_id", input.issueId)
        .maybeSingle(),
      supabase
        .from("jira_issue_status_events")
        .select("changed_at, from_status, to_status")
        .eq("issue_id", input.issueId)
        .order("changed_at", { ascending: true }),
      supabase
        .from("jira_issue_assignee_events")
        .select(
          "changed_at, from_account_id, to_account_id, from_display_name, to_display_name",
        )
        .eq("issue_id", input.issueId)
        .order("changed_at", { ascending: true }),
    ]);

  const metrics = metricsRow
    ? mapMetrics(metricsRow as Record<string, unknown>)
    : null;

  const currentStatusClassification = classifyStatusDetailed(
    issue.status as string | null,
    mapping,
  );

  const statusTimeline = (statusEvents ?? []).map((event) => {
    const from = classifyStatusDetailed(
      event.from_status as string | null,
      mapping,
    );
    const to = classifyStatusDetailed(event.to_status as string | null, mapping);
    return {
      changed_at: String(event.changed_at),
      from_status: (event.from_status as string | null) ?? null,
      to_status: (event.to_status as string | null) ?? null,
      from_group: from.group,
      to_group: to.group,
      from_match: from.matchedBy,
      to_match: to.matchedBy,
    };
  });

  const assigneeTimeline = (assigneeEvents ?? []).map((event) => ({
    changed_at: String(event.changed_at),
    from_account_id: (event.from_account_id as string | null) ?? null,
    to_account_id: (event.to_account_id as string | null) ?? null,
    from_display_name: (event.from_display_name as string | null) ?? null,
    to_display_name: (event.to_display_name as string | null) ?? null,
  }));

  const dwellSource = metrics?.status_dwell_ms ?? {};
  const dwellByStatus = Object.entries(dwellSource)
    .map(([status, dwell_ms]) => {
      const classification = classifyStatusDetailed(status, mapping);
      return {
        status,
        dwell_ms: Number(dwell_ms),
        group: classification.group,
        matchedBy: classification.matchedBy,
      };
    })
    .sort((a, b) => b.dwell_ms - a.dwell_ms);

  const dwellByGroup = Object.entries(metrics?.status_group_dwell_ms ?? {})
    .map(([group, dwell_ms]) => ({
      group,
      dwell_ms: Number(dwell_ms),
    }))
    .sort((a, b) => b.dwell_ms - a.dwell_ms);

  const warnings: string[] = [];
  if (!metrics) {
    warnings.push("Sem snapshot flow_v1 — rode o recálculo de métricas.");
  }
  if (currentStatusClassification.matchedBy === "unmapped") {
    warnings.push(
      `Status atual "${issue.status}" caiu em other (não mapeado). Ajuste settings.status_groups.`,
    );
  }
  if (currentStatusClassification.matchedBy === "fuzzy") {
    warnings.push(
      `Status atual "${issue.status}" casou por fuzzy (${currentStatusClassification.matchedAlias}). Prefira alias explícito.`,
    );
  }
  const unmappedInTimeline = statusTimeline.filter(
    (row) => row.to_match === "unmapped" || row.from_match === "unmapped",
  );
  if (unmappedInTimeline.length > 0) {
    warnings.push(
      `${unmappedInTimeline.length} transição(ões) com status unmapped na timeline.`,
    );
  }
  if (statusTimeline.length === 0) {
    warnings.push(
      "Sem status events — dwell pode estar concentrado no status atual desde created_at.",
    );
  }

  return {
    issue: {
      id: String(issue.id),
      jira_key: String(issue.jira_key),
      summary: (issue.summary as string | null) ?? null,
      status: (issue.status as string | null) ?? null,
      status_category: (issue.status_category as string | null) ?? null,
      assignee_account_id: (issue.assignee_account_id as string | null) ?? null,
      assignee_display_name:
        (issue.assignee_display_name as string | null) ?? null,
      created_at_jira: (issue.created_at_jira as string | null) ?? null,
      updated_at_jira: (issue.updated_at_jira as string | null) ?? null,
      resolved_at_jira: (issue.resolved_at_jira as string | null) ?? null,
    },
    metrics,
    currentStatusClassification,
    statusTimeline,
    assigneeTimeline,
    dwellByStatus,
    dwellByGroup,
    warnings,
  };
}

export async function findIssueIdByKey(input: {
  integrationId: string;
  jiraKey: string;
}): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jira_issues")
    .select("id")
    .eq("integration_id", input.integrationId)
    .eq("jira_key", input.jiraKey.trim().toUpperCase())
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao buscar issue key: ${error.message}`);
  }
  return data ? String(data.id) : null;
}
