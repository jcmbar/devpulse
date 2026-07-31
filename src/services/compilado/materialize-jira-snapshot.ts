import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  assignDeveloperTeamIfEmpty,
  findDevelopersByJiraAccountIds,
} from "@/services/developers";
import {
  createImport,
  updateImportStatus,
} from "@/services/imports";
import { archiveOlderImportsForTeam } from "@/services/imports/retention";
import { getJiraIntegration } from "@/services/integrations/jira";
import { insertJiraCards } from "@/services/jira-cards";
import { buildSnapshotsForImport } from "@/services/productivity-snapshots";
import {
  projectJiraIssueToCompiladoCard,
  type JiraBridgeFlowRow,
  type JiraBridgeIssueRow,
} from "@/services/compilado/project-jira-card";
import { JIRA_FLOW_COMPUTATION_VERSION } from "@/types/jira-flow-analytics";
import type { ImportRecord } from "@/types/import";
import type { JiraCardInsert } from "@/types/jira-card";

const PAGE_SIZE = 500;
const ID_CHUNK = 75;

export const JIRA_COMPILADO_SOURCE = "jira" as const;

export type MaterializeJiraCompiladoSnapshotInput = {
  integrationId: string;
  importedBy: string | null;
  syncRunId?: string | null;
  /** Soft-archive older Jira Compilado batches for the team. Default true. */
  archiveOlder?: boolean;
};

export type MaterializeJiraCompiladoSnapshotResult = {
  importRecord: ImportRecord;
  issuesConsidered: number;
  cardsInserted: number;
  cardsWithDelivery: number;
  developersLinked: number;
  cardsSkippedNoDelivery: number;
  cardsUnmappedAssignee: number;
  archivedOlderCount: number;
  deliveryMin: string | null;
  deliveryMax: string | null;
};

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function loadIssuesForIntegration(
  integrationId: string,
): Promise<JiraBridgeIssueRow[]> {
  const supabase = await createClient();
  const rows: JiraBridgeIssueRow[] = [];
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("jira_issues")
      .select(
        `
        id,
        jira_key,
        summary,
        status,
        labels,
        assignee_account_id,
        assignee_display_name,
        story_points,
        created_at_jira,
        resolved_at_jira,
        unit_test_delivery_on,
        due_on,
        estimate_hours,
        parent_key
      `,
      )
      .eq("integration_id", integrationId)
      .order("jira_key", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to load jira_issues: ${error.message}`);
    }

    const page = data ?? [];
    for (const row of page) {
      rows.push({
        id: String(row.id),
        jira_key: String(row.jira_key),
        summary: (row.summary as string | null) ?? null,
        status: (row.status as string | null) ?? null,
        labels: Array.isArray(row.labels) ? row.labels.map(String) : [],
        assignee_account_id: (row.assignee_account_id as string | null) ?? null,
        assignee_display_name:
          (row.assignee_display_name as string | null) ?? null,
        story_points:
          row.story_points == null ? null : Number(row.story_points),
        created_at_jira: (row.created_at_jira as string | null) ?? null,
        resolved_at_jira: (row.resolved_at_jira as string | null) ?? null,
        unit_test_delivery_on:
          (row.unit_test_delivery_on as string | null) ?? null,
        due_on: (row.due_on as string | null) ?? null,
        estimate_hours:
          row.estimate_hours == null ? null : Number(row.estimate_hours),
        parent_key: (row.parent_key as string | null) ?? null,
      });
    }

    if (page.length < PAGE_SIZE) {
      break;
    }
    from += PAGE_SIZE;
  }

  return rows;
}

async function loadFlowByIssueId(
  integrationId: string,
  issueIds: string[],
): Promise<Map<string, JiraBridgeFlowRow>> {
  const map = new Map<string, JiraBridgeFlowRow>();
  if (issueIds.length === 0) {
    return map;
  }

  const supabase = await createClient();

  for (const chunk of chunks(issueIds, ID_CHUNK)) {
    const { data, error } = await supabase
      .from("jira_issue_flow_metrics")
      .select(
        `
        issue_id,
        first_develop_at,
        first_staging_at,
        resolved_at_jira,
        develop_reentry_count
      `,
      )
      .eq("integration_id", integrationId)
      .eq("computation_version", JIRA_FLOW_COMPUTATION_VERSION)
      .in("issue_id", chunk);

    if (error) {
      throw new Error(`Failed to load flow metrics: ${error.message}`);
    }

    for (const row of data ?? []) {
      map.set(String(row.issue_id), {
        issue_id: String(row.issue_id),
        first_develop_at: (row.first_develop_at as string | null) ?? null,
        first_staging_at: (row.first_staging_at as string | null) ?? null,
        resolved_at_jira: (row.resolved_at_jira as string | null) ?? null,
        develop_reentry_count: Number(row.develop_reentry_count ?? 0),
      });
    }
  }

  return map;
}

async function loadWorklogHoursByIssueId(
  integrationId: string,
  issueIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (issueIds.length === 0) {
    return map;
  }

  const supabase = await createClient();

  for (const chunk of chunks(issueIds, ID_CHUNK)) {
    const { data, error } = await supabase
      .from("jira_worklogs")
      .select("issue_id, time_spent_seconds")
      .eq("integration_id", integrationId)
      .in("issue_id", chunk);

    if (error) {
      throw new Error(`Failed to load worklogs: ${error.message}`);
    }

    for (const row of data ?? []) {
      const issueId = String(row.issue_id);
      const seconds = Number(row.time_spent_seconds ?? 0);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        continue;
      }
      map.set(issueId, (map.get(issueId) ?? 0) + seconds / 3600);
    }
  }

  return map;
}

/**
 * Materialize Jira Cloud sync (+ flow/worklogs) into a Compilado `imports`
 * batch with `source=jira` so the snapshot resolver can compete Manual vs Jira.
 *
 * One import = one provenance. Never appends into a spreadsheet batch.
 */
export async function materializeJiraCompiladoSnapshot(
  input: MaterializeJiraCompiladoSnapshotInput,
): Promise<MaterializeJiraCompiladoSnapshotResult> {
  const integration = await getJiraIntegration(input.integrationId);
  if (!integration) {
    throw new Error("Integração Jira não encontrada.");
  }

  const supabase = await createClient();
  const { data: teamRow, error: teamError } = await supabase
    .from("teams")
    .select("code")
    .eq("id", integration.team_id)
    .maybeSingle();

  if (teamError) {
    throw new Error(`Failed to load team: ${teamError.message}`);
  }

  const teamCode =
    String(teamRow?.code ?? "").trim().toUpperCase() || "JIRA";

  const issues = await loadIssuesForIntegration(integration.id);
  const issueIds = issues.map((issue) => issue.id);
  const [flowByIssue, worklogHours, developersByAccount] = await Promise.all([
    loadFlowByIssueId(integration.id, issueIds),
    loadWorklogHoursByIssueId(integration.id, issueIds),
    findDevelopersByJiraAccountIds(
      issues
        .map((issue) => issue.assignee_account_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]);

  const stamp = new Date().toISOString();
  const label = `Jira Cloud · ${integration.name} · ${stamp.slice(0, 16).replace("T", " ")}`;

  const importRecord = await createImport({
    importedBy: input.importedBy,
    teamId: integration.team_id,
    source: JIRA_COMPILADO_SOURCE,
    sourceLabel: label,
    notes: [
      `bridge=jira_cloud_v1`,
      `integration_id=${integration.id}`,
      input.syncRunId ? `sync_run_id=${input.syncRunId}` : null,
    ]
      .filter(Boolean)
      .join("; "),
  });

  try {
    await updateImportStatus({
      importId: importRecord.id,
      status: "processing",
      startedAt: stamp,
    });

    const cardRows: JiraCardInsert[] = [];
    const linkedDeveloperIds = new Set<string>();
    let cardsSkippedNoDelivery = 0;
    let cardsUnmappedAssignee = 0;
    let cardsWithDelivery = 0;
    let deliveryMin: string | null = null;
    let deliveryMax: string | null = null;

    for (const issue of issues) {
      const developer =
        issue.assignee_account_id != null
          ? (developersByAccount.get(issue.assignee_account_id) ?? null)
          : null;

      if (issue.assignee_account_id && !developer) {
        cardsUnmappedAssignee += 1;
      }

      const projected = projectJiraIssueToCompiladoCard({
        importId: importRecord.id,
        issue,
        flow: flowByIssue.get(issue.id) ?? null,
        timeSpentHours: worklogHours.get(issue.id) ?? null,
        developerId: developer?.id ?? null,
        syncRunId: input.syncRunId ?? null,
        integrationId: integration.id,
      });

      if (!projected) {
        cardsSkippedNoDelivery += 1;
        continue;
      }

      const delivery = projected.card.unit_test_delivery_on!;
      if (deliveryMin == null || delivery < deliveryMin) {
        deliveryMin = delivery;
      }
      if (deliveryMax == null || delivery > deliveryMax) {
        deliveryMax = delivery;
      }
      cardsWithDelivery += 1;

      if (developer) {
        linkedDeveloperIds.add(developer.id);
      }

      cardRows.push(projected.card);
    }

    if (cardRows.length === 0) {
      const message =
        "Nenhuma issue com Entrega p/ Teste Unitário mapeada (custom field). Configure o de/para do projeto, rode sync full e tente novamente. Staging/resolved não contam para o Compilado.";
      await updateImportStatus({
        importId: importRecord.id,
        status: "failed",
        errorMessage: message,
        completedAt: new Date().toISOString(),
      });
      throw new Error(message);
    }

    for (const developerId of linkedDeveloperIds) {
      await assignDeveloperTeamIfEmpty({
        developerId,
        teamId: integration.team_id,
        teamCode,
      });
    }

    const inserted = await insertJiraCards(cardRows);
    if (deliveryMin && deliveryMax) {
      await buildSnapshotsForImport({
        importId: importRecord.id,
        periodStart: deliveryMin,
        periodEnd: deliveryMax,
        cards: inserted,
      });
    }

    const completed = await updateImportStatus({
      importId: importRecord.id,
      status: "completed",
      recordsCount: inserted.length,
      cardsWithDeliveryCount: cardsWithDelivery,
      periodStart: deliveryMin,
      periodEnd: deliveryMax,
      errorMessage: null,
      completedAt: new Date().toISOString(),
    });

    let archivedOlderCount = 0;
    if (input.archiveOlder !== false) {
      archivedOlderCount = await archiveOlderImportsForTeam({
        teamId: integration.team_id,
        source: JIRA_COMPILADO_SOURCE,
      });
    }

    return {
      importRecord: completed,
      issuesConsidered: issues.length,
      cardsInserted: inserted.length,
      cardsWithDelivery,
      developersLinked: linkedDeveloperIds.size,
      cardsSkippedNoDelivery,
      cardsUnmappedAssignee,
      archivedOlderCount,
      deliveryMin,
      deliveryMax,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao materializar Compilado.";
    try {
      await updateImportStatus({
        importId: importRecord.id,
        status: "failed",
        errorMessage: message,
        completedAt: new Date().toISOString(),
      });
    } catch {
      // ignore secondary failure
    }
    throw error;
  }
}
