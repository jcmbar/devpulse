import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  JiraIssueFlowMetrics,
  JiraIssueFlowMetricsWrite,
  JiraStatusGroup,
  ThroughputBucket,
} from "@/types/jira-flow-analytics";

const CHUNK = 50;

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function mapFlowRow(row: Record<string, unknown>): JiraIssueFlowMetrics {
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
    lead_time_ms:
      row.lead_time_ms == null ? null : Number(row.lead_time_ms),
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
      (row.current_status_group as JiraStatusGroup | null) ?? null,
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

export async function upsertIssueFlowMetrics(
  rows: JiraIssueFlowMetricsWrite[],
): Promise<number> {
  const supabase = await createClient();
  let upserted = 0;

  for (const batch of chunkArray(rows, CHUNK)) {
    if (batch.length === 0) {
      continue;
    }
    const { data, error } = await supabase
      .from("jira_issue_flow_metrics")
      .upsert(batch, { onConflict: "issue_id" })
      .select("id");

    if (error) {
      throw new Error(`Falha ao upsert flow metrics: ${error.message}`);
    }
    upserted += data?.length ?? batch.length;
  }

  return upserted;
}

export async function listIssueFlowMetrics(
  integrationId: string,
  limit = 50,
): Promise<JiraIssueFlowMetrics[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jira_issue_flow_metrics")
    .select("*")
    .eq("integration_id", integrationId)
    .order("computed_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Falha ao listar flow metrics: ${error.message}`);
  }

  return (data ?? []).map((row) => mapFlowRow(row as Record<string, unknown>));
}

export async function countIssueFlowMetrics(
  integrationId: string,
): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("jira_issue_flow_metrics")
    .select("id", { count: "exact", head: true })
    .eq("integration_id", integrationId);

  if (error) {
    throw new Error(`Falha ao contar flow metrics: ${error.message}`);
  }
  return count ?? 0;
}

export type JiraIssueFlowMetricsRow = {
  metrics: JiraIssueFlowMetrics;
  jira_key: string | null;
};

export async function listIssueFlowMetricsWithKeys(
  integrationId: string,
  limit = 50,
): Promise<JiraIssueFlowMetricsRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jira_issue_flow_metrics")
    .select("*, jira_issues ( jira_key )")
    .eq("integration_id", integrationId)
    .order("computed_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Falha ao listar flow metrics: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    const issueJoin = record.jira_issues as
      | { jira_key?: string }
      | { jira_key?: string }[]
      | null;
    const key = Array.isArray(issueJoin)
      ? (issueJoin[0]?.jira_key ?? null)
      : (issueJoin?.jira_key ?? null);
    return {
      metrics: mapFlowRow(record),
      jira_key: key,
    };
  });
}

/**
 * Throughput = issues with resolved_at_jira inside [from, to] (inclusive UTC day bounds).
 */
export async function getThroughputByResolvedDay(input: {
  integrationId: string;
  fromIso: string;
  toIso: string;
}): Promise<ThroughputBucket[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jira_issue_flow_metrics")
    .select("resolved_at_jira")
    .eq("integration_id", input.integrationId)
    .not("resolved_at_jira", "is", null)
    .gte("resolved_at_jira", input.fromIso)
    .lte("resolved_at_jira", input.toIso);

  if (error) {
    throw new Error(`Falha ao agregar throughput: ${error.message}`);
  }

  const buckets = new Map<string, number>();
  for (const row of data ?? []) {
    const resolved = String(row.resolved_at_jira);
    const day = resolved.slice(0, 10);
    buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, resolvedCount]) => ({
      periodStart: `${day}T00:00:00.000Z`,
      periodEnd: `${day}T23:59:59.999Z`,
      resolvedCount,
    }));
}
