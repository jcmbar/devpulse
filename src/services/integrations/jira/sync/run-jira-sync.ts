import "server-only";

import { getJiraMappingReadiness } from "@/lib/jira/field-mappings";
import { resolveJiraApiToken } from "@/services/integrations/jira/auth";
import { JiraApiError, JiraClient } from "@/services/integrations/jira/client";
import {
  collectIssues,
  collectProjects,
} from "@/services/integrations/jira/collectors/issues";
import {
  createJiraSyncRun,
  getJiraIntegration,
  updateJiraIntegrationCursor,
  updateJiraSyncRun,
  upsertJiraProjects,
  listJiraProjects,
} from "@/services/integrations/jira/repositories/integrations";
import { persistCollectedBundles } from "@/services/integrations/jira/repositories/persist";
import { buildSyncWindow } from "@/services/integrations/jira/sync/build-jql";
import {
  createEmptySyncMetrics,
  JiraPaginationError,
  type JiraSyncRunMetrics,
} from "@/services/integrations/jira/sync/metrics";
import type { JiraSyncRun } from "@/types/jira-integration";

export type RunJiraSyncInput = {
  integrationId: string;
  createdBy: string | null;
  /** Force full window even if cursor exists. */
  forceFull?: boolean;
};

export type RunJiraSyncResult = {
  ok: boolean;
  run: JiraSyncRun;
  error?: string;
};

function allowCursorAdvance(stopReason: JiraSyncRunMetrics["stop_reason"]): boolean {
  return (
    stopReason === "is_last" ||
    stopReason === "empty_next_page_token" ||
    stopReason === "missing_next_page_token" ||
    stopReason === "empty_first_page" ||
    stopReason === "completed"
  );
}

/**
 * Orchestrates one read-only Jira sync:
 * connection → projects → JQL window → issues/changelog/worklogs → upsert → cursor.
 *
 * Cursor advances only on clean pagination stops. Guard failures keep the
 * previous watermark so the next run reprocesses via overlap.
 */
export async function runJiraSync(
  input: RunJiraSyncInput,
): Promise<RunJiraSyncResult> {
  const integration = await getJiraIntegration(input.integrationId);
  if (!integration) {
    throw new Error("Integração Jira não encontrada.");
  }
  if (!integration.is_enabled) {
    throw new Error("Integração Jira está desabilitada.");
  }

  const readiness = getJiraMappingReadiness(integration.field_mappings);
  if (!readiness.ready) {
    throw new Error(
      `De/para incompleto para o time/projeto selecionado. Mapeie os campos obrigatórios antes do sync: ${readiness.pendingLabels.join(", ")}.`,
    );
  }

  const working = { ...integration };
  if (input.forceFull) {
    working.sync_cursor_updated_at = null;
  }

  let apiRequests = 0;
  const apiToken = resolveJiraApiToken(integration.api_token_secret_ref);
  const client = new JiraClient({
    baseUrl: integration.base_url,
    email: integration.email,
    apiToken,
    onRequest: () => {
      apiRequests += 1;
    },
  });

  // JQL datetime literals use the authenticated user's timezone.
  const myself = await client.getMyself();
  const window = buildSyncWindow(working, { timeZone: myself.timeZone });

  let run = await createJiraSyncRun({
    integrationId: integration.id,
    mode: window.mode,
    createdBy: input.createdBy,
    jql: window.jql,
    cursorFrom: window.cursorFrom.toISOString(),
    cursorTo: window.cursorTo.toISOString(),
  });

  await updateJiraSyncRun(run.id, {
    status: "running",
    started_at: new Date().toISOString(),
  });

  let metrics = createEmptySyncMetrics({
    overlap_minutes: window.overlapMinutes,
    raw_cursor: window.rawCursor?.toISOString() ?? null,
    jql_timezone: window.jqlTimeZone,
  });

  try {
    const projects = await collectProjects(client);
    const scoped =
      integration.project_keys.length > 0
        ? projects.filter((project) =>
            integration.project_keys.includes(project.key.toUpperCase()),
          )
        : projects;

    const projectIdByKey = await upsertJiraProjects(
      integration.id,
      scoped.map((project) => ({
        jiraId: project.id,
        key: project.key,
        name: project.name,
        style: project.style ?? null,
        rawPayload: project as unknown as Record<string, unknown>,
      })),
    );

    const storedProjects = await listJiraProjects(integration.id);
    const fieldMappingsByProjectKey: Record<string, typeof integration.field_mappings> =
      {};
    for (const project of storedProjects) {
      if (Object.keys(project.field_mappings).length > 0) {
        fieldMappingsByProjectKey[project.key.toUpperCase()] =
          project.field_mappings;
      }
    }

    const collected = await collectIssues({
      client,
      jql: window.jql,
      fieldMappings: integration.field_mappings,
      fieldMappingsByProjectKey,
      includeChangelog: integration.include_changelog,
      includeWorklogs: integration.include_worklogs,
    });

    metrics = {
      ...metrics,
      ...collected.metrics,
      stop_reason: collected.metrics.stop_reason,
      stop_detail: collected.metrics.stop_detail,
    };

    const persisted = await persistCollectedBundles({
      integrationId: integration.id,
      projectIdByKey,
      bundles: collected.bundles,
    });

    metrics.issues_reprocessed = persisted.issuesReprocessed;
    metrics.issues_new = persisted.issuesNew;

    const finishedAt = new Date().toISOString();
    const shouldAdvance = allowCursorAdvance(metrics.stop_reason);
    metrics.cursor_advanced = shouldAdvance;

    if (shouldAdvance) {
      const cursorToPersist =
        collected.maxUpdatedAt ?? window.cursorTo.toISOString();
      await updateJiraIntegrationCursor({
        integrationId: integration.id,
        syncCursorUpdatedAt: cursorToPersist,
        lastSuccessfulSyncAt: finishedAt,
      });
    }

    const status = shouldAdvance ? "completed" : "partial";

    await updateJiraSyncRun(run.id, {
      status,
      finished_at: finishedAt,
      issues_fetched: collected.bundles.length,
      issues_upserted: persisted.issuesUpserted,
      status_events_upserted: persisted.statusEventsUpserted,
      assignee_events_upserted: persisted.assigneeEventsUpserted,
      worklogs_upserted: persisted.worklogsUpserted,
      pages_fetched: collected.pagesFetched,
      api_requests: apiRequests || client.getRequestCount(),
      error_message: shouldAdvance
        ? null
        : metrics.stop_detail ??
          `Sync parcial (${metrics.stop_reason}); cursor não avançou.`,
      error_details: shouldAdvance
        ? null
        : {
            stop_reason: metrics.stop_reason,
            stop_detail: metrics.stop_detail,
          },
      metrics,
    });

    run = {
      ...run,
      status,
      finished_at: finishedAt,
      issues_fetched: collected.bundles.length,
      issues_upserted: persisted.issuesUpserted,
      status_events_upserted: persisted.statusEventsUpserted,
      assignee_events_upserted: persisted.assigneeEventsUpserted,
      worklogs_upserted: persisted.worklogsUpserted,
      pages_fetched: collected.pagesFetched,
      api_requests: apiRequests || client.getRequestCount(),
      metrics,
      error_message: shouldAdvance ? null : metrics.stop_detail,
    };

    return {
      ok: shouldAdvance,
      run,
      error: shouldAdvance
        ? undefined
        : metrics.stop_detail ?? `Sync parcial (${metrics.stop_reason}).`,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();

    if (error instanceof JiraPaginationError) {
      metrics = {
        ...metrics,
        ...error.metrics,
        stop_reason: error.stopReason,
        stop_detail: error.message,
        cursor_advanced: false,
      };

      await updateJiraSyncRun(run.id, {
        status: error.stopReason === "max_pages" ? "partial" : "failed",
        finished_at: finishedAt,
        api_requests: apiRequests,
        error_message: error.message,
        error_details: {
          stop_reason: error.stopReason,
          stop_detail: error.message,
          tokens_seen: error.metrics.tokens_seen ?? null,
          pages_repeated: error.metrics.pages_repeated ?? null,
        },
        metrics,
      });

      return {
        ok: false,
        run: {
          ...run,
          status: error.stopReason === "max_pages" ? "partial" : "failed",
          error_message: error.message,
          api_requests: apiRequests,
          metrics,
        },
        error: error.message,
      };
    }

    const message =
      error instanceof JiraApiError
        ? `Jira API erro ${error.status}: ${error.message}${error.body ? ` | body: ${error.body.slice(0, 280)}` : ""}`
        : error instanceof Error
          ? error.message
          : "Falha desconhecida no sync Jira.";

    metrics = {
      ...metrics,
      stop_reason: "collector_error",
      stop_detail: message,
      cursor_advanced: false,
    };

    const details =
      error instanceof JiraApiError
        ? {
            status: error.status,
            body: error.body.slice(0, 1000),
            stop_reason: "collector_error",
          }
        : { stop_reason: "collector_error" };

    await updateJiraSyncRun(run.id, {
      status: "failed",
      finished_at: finishedAt,
      api_requests: apiRequests,
      error_message: message,
      error_details: details,
      metrics,
    });

    return {
      ok: false,
      run: {
        ...run,
        status: "failed",
        error_message: message,
        api_requests: apiRequests,
        metrics,
      },
      error: message,
    };
  }
}
