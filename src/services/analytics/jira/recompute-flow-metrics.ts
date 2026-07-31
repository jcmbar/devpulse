import "server-only";

import { createClient } from "@/lib/supabase/server";
import { computeIssueFlowMetrics } from "@/services/analytics/jira/compute-issue-flow";
import { upsertIssueFlowMetrics } from "@/services/analytics/jira/repository";
import {
  listFlowAssigneeEvents,
  listFlowStatusEvents,
  type FlowAssigneeEventRow,
  type FlowStatusEventRow,
} from "@/services/analytics/jira/repository-source-events";
import { getJiraIntegration } from "@/services/integrations/jira";

export type RecomputeFlowMetricsResult = {
  ok: boolean;
  issuesProcessed: number;
  metricsUpserted: number;
  error?: string;
};

function describeCause(cause: unknown): string {
  if (cause == null) {
    return "";
  }
  if (cause instanceof Error) {
    return `${cause.name}: ${cause.message}`;
  }
  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
}

/**
 * Rebuild derived flow metrics for an integration from normalized events.
 * Safe to re-run (upsert by issue_id). Does not call Jira API.
 */
export async function recomputeJiraFlowMetrics(input: {
  integrationId: string;
  /** Optional subset; default = all issues for the integration. */
  issueIds?: string[];
}): Promise<RecomputeFlowMetricsResult> {
  const integration = await getJiraIntegration(input.integrationId);
  if (!integration) {
    return {
      ok: false,
      issuesProcessed: 0,
      metricsUpserted: 0,
      error: "Integração Jira não encontrada.",
    };
  }

  const supabase = await createClient();

  let issuesQuery = supabase
    .from("jira_issues")
    .select(
      "id, integration_id, status, status_category, created_at_jira, updated_at_jira, resolved_at_jira, assignee_account_id",
    )
    .eq("integration_id", input.integrationId);

  if (input.issueIds?.length) {
    issuesQuery = issuesQuery.in("id", input.issueIds);
  }

  const { data: issues, error: issuesError } = await issuesQuery;
  if (issuesError) {
    return {
      ok: false,
      issuesProcessed: 0,
      metricsUpserted: 0,
      error: `Falha ao carregar issues: ${issuesError.message}`,
    };
  }

  const issueRows = issues ?? [];
  if (issueRows.length === 0) {
    return { ok: true, issuesProcessed: 0, metricsUpserted: 0 };
  }

  const issueIds = issueRows.map((row) => String(row.id));

  let statusEvents: FlowStatusEventRow[];
  let assigneeEvents: FlowAssigneeEventRow[];
  try {
    [statusEvents, assigneeEvents] = await Promise.all([
      listFlowStatusEvents({
        integrationId: input.integrationId,
        issueIds,
      }),
      listFlowAssigneeEvents({
        integrationId: input.integrationId,
        issueIds,
      }),
    ]);
  } catch (error) {
    return {
      ok: false,
      issuesProcessed: 0,
      metricsUpserted: 0,
      error:
        error instanceof Error
          ? `${error.message}${error.cause ? ` | cause=${describeCause(error.cause)}` : ""}`
          : `Falha ao carregar eventos: ${String(error)}`,
    };
  }

  const statusByIssue = new Map<
    string,
    Array<{
      from_status: string | null;
      to_status: string | null;
      changed_at: string;
    }>
  >();
  for (const event of statusEvents) {
    const issueId = String(event.issue_id);
    const list = statusByIssue.get(issueId) ?? [];
    list.push({
      from_status: (event.from_status as string | null) ?? null,
      to_status: (event.to_status as string | null) ?? null,
      changed_at: String(event.changed_at),
    });
    statusByIssue.set(issueId, list);
  }

  const assigneeByIssue = new Map<
    string,
    Array<{
      from_account_id: string | null;
      to_account_id: string | null;
      changed_at: string;
    }>
  >();
  for (const event of assigneeEvents) {
    const issueId = String(event.issue_id);
    const list = assigneeByIssue.get(issueId) ?? [];
    list.push({
      from_account_id: (event.from_account_id as string | null) ?? null,
      to_account_id: (event.to_account_id as string | null) ?? null,
      changed_at: String(event.changed_at),
    });
    assigneeByIssue.set(issueId, list);
  }

  const asOf = new Date();
  const writes = issueRows.map((row) => {
    const issueId = String(row.id);
    return computeIssueFlowMetrics({
      issue: {
        id: issueId,
        integration_id: String(row.integration_id),
        status: (row.status as string | null) ?? null,
        status_category: (row.status_category as string | null) ?? null,
        created_at_jira: (row.created_at_jira as string | null) ?? null,
        updated_at_jira: (row.updated_at_jira as string | null) ?? null,
        resolved_at_jira: (row.resolved_at_jira as string | null) ?? null,
        assignee_account_id:
          (row.assignee_account_id as string | null) ?? null,
      },
      statusEvents: statusByIssue.get(issueId) ?? [],
      assigneeEvents: assigneeByIssue.get(issueId) ?? [],
      settings: integration.settings,
      asOf,
    });
  });

  const metricsUpserted = await upsertIssueFlowMetrics(writes);

  return {
    ok: true,
    issuesProcessed: issueRows.length,
    metricsUpserted,
  };
}
