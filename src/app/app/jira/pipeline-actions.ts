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
  runJiraSync,
} from "@/services/integrations/jira";
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
          message: `Compilado · ${materialized.cardsInserted} cards · ${materialized.developersLinked} devs · ${materialized.deliveryMin ?? "—"} → ${materialized.deliveryMax ?? "—"}`,
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
