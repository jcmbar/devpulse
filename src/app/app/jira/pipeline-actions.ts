"use server";

import { revalidatePath } from "next/cache";
import { requireTeamAccess } from "@/lib/auth/permissions";
import {
  recomputeJiraFlowDailyFacts,
  recomputeJiraFlowMetrics,
} from "@/services/analytics/jira";
import { materializeJiraCompiladoSnapshot } from "@/services/compilado/materialize-jira-snapshot";
import {
  getJiraIntegration,
  getJiraSyncStatusSummary,
  runJiraSync,
  triggerJiraSync,
} from "@/services/integrations/jira";
import type { JiraSyncStatusSummary } from "@/types/jira-sync-status";
import { scheduleEligibleJiraAutoSyncs } from "@/services/integrations/jira/sync/schedule-eligible-auto-syncs";
import type {
  JiraPipelineStepId,
  JiraPipelineStepResult,
} from "@/app/app/jira/pipeline-shared";

async function requireIntegrationPair(input: {
  integrationId: string;
  teamId: string;
}) {
  const integration = await getJiraIntegration(input.integrationId);
  if (!integration) {
    throw new Error("Integração não encontrada.");
  }
  if (!input.teamId || integration.team_id !== input.teamId) {
    throw new Error(
      "O contexto do time mudou. Recarregue a tela antes de executar a operação.",
    );
  }
  return integration;
}

function revalidateJiraSurfaces() {
  revalidatePath("/app/jira");
  revalidatePath("/app/jira/analytics");
  revalidatePath("/app/gestor");
  revalidatePath("/app");
}

/**
 * One step of the Jira → Compilado pipeline.
 * The client runs steps in order and renders per-step progress.
 */
export async function runJiraPipelineStepAction(input: {
  integrationId: string;
  teamId: string;
  step: JiraPipelineStepId;
  forceFull?: boolean;
  syncRunId?: string | null;
}): Promise<JiraPipelineStepResult> {
  const context = await requireTeamAccess();

  try {
    const integration = await requireIntegrationPair({
      integrationId: input.integrationId,
      teamId: input.teamId,
    });

    switch (input.step) {
      case "sync": {
        if (!integration.is_enabled) {
          return {
            ok: false,
            step: "sync",
            message: "Integração desabilitada.",
            error: "Habilite a integração antes de sincronizar.",
          };
        }

        const result = await runJiraSync({
          integrationId: integration.id,
          createdBy: context.profile.id,
          forceFull: input.forceFull === true,
          triggerSource: "manual",
          cooldownBypassed: true,
        });

        revalidatePath("/app/jira");
        revalidatePath("/app/jira/analytics");

        if (!result.ok) {
          return {
            ok: false,
            step: "sync",
            message: "Sync interrompido.",
            error: result.error ?? "Sync falhou.",
            syncRunId: result.run.id,
          };
        }

        return {
          ok: true,
          step: "sync",
          syncRunId: result.run.id,
          message: `Sync ${result.run.mode} · ${result.run.issues_upserted} issues · ${result.run.status_events_upserted} status · ${result.run.worklogs_upserted} worklogs · ${result.run.api_requests} reqs`,
        };
      }

      case "flow": {
        const result = await recomputeJiraFlowMetrics({
          integrationId: integration.id,
        });
        revalidatePath("/app/jira/analytics");

        if (!result.ok) {
          return {
            ok: false,
            step: "flow",
            message: "Falha no recompute de fluxo.",
            error: result.error ?? "Falha ao recalcular métricas.",
          };
        }

        return {
          ok: true,
          step: "flow",
          message: `Flow_v1 · ${result.metricsUpserted}/${result.issuesProcessed} issues`,
          syncRunId: input.syncRunId ?? null,
        };
      }

      case "daily": {
        const result = await recomputeJiraFlowDailyFacts({
          integrationId: integration.id,
          triggerSource: "manual",
          createdBy: context.profile.id,
        });
        revalidatePath("/app/jira/analytics");

        if (!result.ok) {
          return {
            ok: false,
            step: "daily",
            message: "Falha nos fatos diários.",
            error: result.error ?? "Falha ao recalcular fatos diários.",
          };
        }

        return {
          ok: true,
          step: "daily",
          message: `Fatos · ${result.rowsWritten} rows · ${result.daysProcessed} dias (${result.fromDay} → ${result.toDay})`,
          syncRunId: input.syncRunId ?? null,
        };
      }

      case "compilado": {
        const materialized = await materializeJiraCompiladoSnapshot({
          integrationId: integration.id,
          importedBy: context.profile.id,
          syncRunId: input.syncRunId ?? null,
        });
        revalidateJiraSurfaces();

        return {
          ok: true,
          step: "compilado",
          message: `Compilado · ${materialized.cardsInserted} cards · ${materialized.developersLinked} devs · ${materialized.justificationsCopied} justificativa(s) preservada(s) · ${materialized.deliveryMin ?? "—"} → ${materialized.deliveryMax ?? "—"}`,
          syncRunId: input.syncRunId ?? null,
        };
      }

      default:
        return {
          ok: false,
          step: input.step,
          message: "Etapa desconhecida.",
          error: `Etapa inválida: ${String(input.step)}`,
        };
    }
  } catch (error) {
    return {
      ok: false,
      step: input.step,
      message: "Falha na etapa.",
      error:
        error instanceof Error ? error.message : "Erro inesperado na pipeline.",
      syncRunId: input.syncRunId ?? null,
    };
  }
}

export type TriggerJiraSyncActionResult = {
  ok: boolean;
  started: boolean;
  message: string;
  error?: string;
  reason?: string;
  syncRunId?: string | null;
};

/**
 * Manual full pipeline (bypasses cooldown, respects lock).
 */
export async function triggerJiraSyncAction(input: {
  integrationId: string;
  teamId: string;
  forceFull?: boolean;
}): Promise<TriggerJiraSyncActionResult> {
  const context = await requireTeamAccess();
  await requireIntegrationPair({
    integrationId: input.integrationId,
    teamId: input.teamId,
  });

  const result = await triggerJiraSync({
    integrationId: input.integrationId,
    force: true,
    trigger: "manual",
    actorUserId: context.profile.id,
    forceFull: input.forceFull === true,
  });

  if (result.ok) {
    return {
      ok: true,
      started: true,
      message: result.message,
      syncRunId: result.syncRunId,
    };
  }

  if (result.started) {
    return {
      ok: false,
      started: true,
      message: result.message,
      error: result.error,
      syncRunId: result.syncRunId,
    };
  }

  return {
    ok: false,
    started: false,
    message: result.message,
    error: result.error,
    reason: result.reason,
  };
}

export type RequestGestorAutoSyncResult = {
  scheduled: number;
  skipped: number;
  integrationIds: string[];
};

/**
 * Fire-and-forget auto-sync for gestor page load.
 * Schedules eligible integrations via `after()` so the action returns immediately.
 */
export async function requestGestorAutoSyncAction(input: {
  /** When set, only that team's integration. When null, all enabled. */
  teamId: string | null;
}): Promise<RequestGestorAutoSyncResult> {
  const context = await requireTeamAccess();
  return scheduleEligibleJiraAutoSyncs({
    teamId: input.teamId,
    trigger: "auto_gestor_load",
    actorUserId: context.profile.id,
  });
}

export async function getGestorSyncStatusAction(input: {
  integrationIds: string[];
}): Promise<JiraSyncStatusSummary[]> {
  await requireTeamAccess();
  const summaries: JiraSyncStatusSummary[] = [];
  for (const id of input.integrationIds) {
    const summary = await getJiraSyncStatusSummary(id);
    if (summary) {
      summaries.push(summary);
    }
  }
  return summaries;
}
