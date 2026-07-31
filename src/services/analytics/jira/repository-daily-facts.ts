import "server-only";

import { createClient } from "@/lib/supabase/server";
import { JIRA_FLOW_COMPUTATION_VERSION } from "@/types/jira-flow-analytics";
import type { JiraStatusGroup } from "@/types/jira-flow-analytics";

export type JiraFlowDailyFactWrite = {
  integration_id: string;
  day: string;
  status_group: JiraStatusGroup;
  issue_type: string;
  wip_count: number;
  arrived_count: number;
  departed_count: number;
  resolved_count: number;
  rules_hash: string;
  computation_version: string;
  computed_at: string;
};

export type JiraFlowDailyFactRow = JiraFlowDailyFactWrite & {
  id: string;
};

export type FlowRecomputeRunWrite = {
  integration_id: string;
  kind: "daily_facts" | "issue_metrics";
  mode: "full" | "range" | "incremental";
  status: "pending" | "running" | "success" | "error";
  trigger_source?: string;
  from_day?: string | null;
  to_day?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  rules_hash?: string | null;
  computation_version?: string;
  metrics?: Record<string, unknown>;
  error_message?: string | null;
  created_by?: string | null;
};

/**
 * Safe range rebuild: delete existing facts in [fromDay, toDay], then insert.
 * Natural key uniqueness still protects concurrent partial upserts.
 */
export async function replaceDailyFactsInRange(input: {
  integrationId: string;
  fromDay: string;
  toDay: string;
  rows: JiraFlowDailyFactWrite[];
}): Promise<number> {
  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("jira_flow_daily_facts")
    .delete()
    .eq("integration_id", input.integrationId)
    .gte("day", input.fromDay)
    .lte("day", input.toDay);

  if (deleteError) {
    throw new Error(
      `Falha ao limpar daily facts no range: ${deleteError.message}`,
    );
  }

  if (input.rows.length === 0) {
    return 0;
  }

  const chunkSize = 500;
  let written = 0;
  for (let i = 0; i < input.rows.length; i += chunkSize) {
    const chunk = input.rows.slice(i, i + chunkSize);
    const { error } = await supabase.from("jira_flow_daily_facts").insert(chunk);
    if (error) {
      throw new Error(`Falha ao inserir daily facts: ${error.message}`);
    }
    written += chunk.length;
  }

  return written;
}

export async function listDailyFacts(input: {
  integrationIds: string[];
  fromDay?: string;
  toDay?: string;
  issueType?: string;
  statusGroup?: JiraStatusGroup | "all";
}): Promise<JiraFlowDailyFactRow[]> {
  if (input.integrationIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  let query = supabase
    .from("jira_flow_daily_facts")
    .select(
      "id, integration_id, day, status_group, issue_type, wip_count, arrived_count, departed_count, resolved_count, rules_hash, computation_version, computed_at",
    )
    .in("integration_id", input.integrationIds)
    .order("day", { ascending: true });

  if (input.fromDay) {
    query = query.gte("day", input.fromDay);
  }
  if (input.toDay) {
    query = query.lte("day", input.toDay);
  }
  if (input.issueType && input.issueType !== "all") {
    query = query.eq("issue_type", input.issueType);
  }
  if (input.statusGroup && input.statusGroup !== "all") {
    query = query.eq("status_group", input.statusGroup);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao ler daily facts: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    integration_id: String(row.integration_id),
    day: String(row.day),
    status_group: row.status_group as JiraStatusGroup,
    issue_type: String(row.issue_type ?? ""),
    wip_count: Number(row.wip_count ?? 0),
    arrived_count: Number(row.arrived_count ?? 0),
    departed_count: Number(row.departed_count ?? 0),
    resolved_count: Number(row.resolved_count ?? 0),
    rules_hash: String(row.rules_hash),
    computation_version: String(
      row.computation_version ?? JIRA_FLOW_COMPUTATION_VERSION,
    ),
    computed_at: String(row.computed_at),
  }));
}

export async function getDailyFactsCoverage(input: {
  integrationId: string;
}): Promise<{
  coverageFrom: string | null;
  coverageTo: string | null;
  rulesHash: string | null;
  rowCount: number;
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jira_flow_daily_facts")
    .select("day, rules_hash")
    .eq("integration_id", input.integrationId)
    .order("day", { ascending: true });

  if (error) {
    throw new Error(`Falha ao ler cobertura daily facts: ${error.message}`);
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return null;
  }

  return {
    coverageFrom: String(rows[0].day),
    coverageTo: String(rows[rows.length - 1].day),
    rulesHash: String(rows[0].rules_hash),
    rowCount: rows.length,
  };
}

export async function createFlowRecomputeRun(
  input: FlowRecomputeRunWrite,
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jira_flow_recompute_runs")
    .insert({
      integration_id: input.integration_id,
      kind: input.kind,
      mode: input.mode,
      status: input.status,
      trigger_source: input.trigger_source ?? "manual",
      from_day: input.from_day ?? null,
      to_day: input.to_day ?? null,
      started_at: input.started_at ?? null,
      finished_at: input.finished_at ?? null,
      rules_hash: input.rules_hash ?? null,
      computation_version:
        input.computation_version ?? JIRA_FLOW_COMPUTATION_VERSION,
      metrics: input.metrics ?? {},
      error_message: input.error_message ?? null,
      created_by: input.created_by ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `Falha ao criar recompute run: ${error?.message ?? "sem id"}`,
    );
  }

  return String(data.id);
}

export async function finishFlowRecomputeRun(input: {
  runId: string;
  status: "success" | "error";
  metrics?: Record<string, unknown>;
  errorMessage?: string | null;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("jira_flow_recompute_runs")
    .update({
      status: input.status,
      finished_at: new Date().toISOString(),
      metrics: input.metrics ?? {},
      error_message: input.errorMessage ?? null,
    })
    .eq("id", input.runId);

  if (error) {
    throw new Error(`Falha ao finalizar recompute run: ${error.message}`);
  }
}
