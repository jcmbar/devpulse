import "server-only";

import { revalidatePath } from "next/cache";
import {
  recomputeJiraFlowDailyFacts,
  recomputeJiraFlowMetrics,
} from "@/services/analytics/jira";
import { materializeJiraCompiladoSnapshot } from "@/services/compilado/materialize-jira-snapshot";
import type { JiraSyncTriggerSource } from "@/services/integrations/jira/constants";
import { getJiraIntegration } from "@/services/integrations/jira/repositories/integrations";
import { runJiraSync } from "@/services/integrations/jira/sync/run-jira-sync";

export type RunJiraPipelineInput = {
  integrationId: string;
  createdBy: string | null;
  forceFull?: boolean;
  triggerSource: JiraSyncTriggerSource | string;
  cooldownBypassed?: boolean;
};

export type RunJiraPipelineResult = {
  ok: boolean;
  syncRunId: string | null;
  step: "sync" | "flow" | "daily" | "compilado" | null;
  message: string;
  error?: string;
};

function revalidateJiraSurfaces() {
  revalidatePath("/app/jira");
  revalidatePath("/app/jira/analytics");
  revalidatePath("/app/gestor");
  revalidatePath("/app");
}

/**
 * Full Jira → analytics → Compilado pipeline for one integration.
 * Caller owns concurrency lock / eligibility.
 */
export async function runJiraPipelineForIntegration(
  input: RunJiraPipelineInput,
): Promise<RunJiraPipelineResult> {
  const integration = await getJiraIntegration(input.integrationId);
  if (!integration) {
    return {
      ok: false,
      syncRunId: null,
      step: null,
      message: "Integração não encontrada.",
      error: "Integração Jira não encontrada.",
    };
  }

  if (!integration.is_enabled) {
    return {
      ok: false,
      syncRunId: null,
      step: "sync",
      message: "Integração desabilitada.",
      error: "Habilite a integração antes de sincronizar.",
    };
  }

  let syncRunId: string | null = null;

  try {
    const syncResult = await runJiraSync({
      integrationId: integration.id,
      createdBy: input.createdBy,
      forceFull: input.forceFull === true,
      triggerSource: input.triggerSource,
      cooldownBypassed: input.cooldownBypassed === true,
    });
    syncRunId = syncResult.run.id;

    if (!syncResult.ok) {
      return {
        ok: false,
        syncRunId,
        step: "sync",
        message: "Sync interrompido.",
        error: syncResult.error ?? "Sync falhou.",
      };
    }

    const flowResult = await recomputeJiraFlowMetrics({
      integrationId: integration.id,
    });
    if (!flowResult.ok) {
      return {
        ok: false,
        syncRunId,
        step: "flow",
        message: "Falha no recompute de fluxo.",
        error: flowResult.error ?? "Falha ao recalcular métricas.",
      };
    }

    const dailyResult = await recomputeJiraFlowDailyFacts({
      integrationId: integration.id,
      triggerSource: input.triggerSource,
      createdBy: input.createdBy,
    });
    if (!dailyResult.ok) {
      return {
        ok: false,
        syncRunId,
        step: "daily",
        message: "Falha nos fatos diários.",
        error: dailyResult.error ?? "Falha ao recalcular fatos diários.",
      };
    }

    const materialized = await materializeJiraCompiladoSnapshot({
      integrationId: integration.id,
      importedBy: input.createdBy,
      syncRunId,
    });

    revalidateJiraSurfaces();

    return {
      ok: true,
      syncRunId,
      step: "compilado",
      message: `Pipeline OK · sync ${syncResult.run.mode} · ${syncResult.run.issues_upserted} issues · Compilado ${materialized.cardsInserted} cards · ${materialized.justificationsCopied} justificativa(s) copiada(s)`,
    };
  } catch (error) {
    return {
      ok: false,
      syncRunId,
      step: null,
      message: "Falha na pipeline.",
      error:
        error instanceof Error ? error.message : "Erro inesperado na pipeline.",
    };
  }
}
