import "server-only";

import { revalidatePath } from "next/cache";
import {
  recomputeJiraFlowDailyFacts,
  recomputeJiraFlowMetrics,
} from "@/services/analytics/jira";
import { materializeJiraCompiladoSnapshot } from "@/services/compilado/materialize-jira-snapshot";
import type { JiraPipelineStepId } from "@/app/app/jira/pipeline-shared";
import type { JiraSyncTriggerSource } from "@/services/integrations/jira/constants";
import { getJiraIntegration } from "@/services/integrations/jira/repositories/integrations";
import { updatePipelineLockStep } from "@/services/integrations/jira/sync/pipeline-lock";

export type RunJiraPipelinePostSyncResult = {
  ok: boolean;
  syncRunId: string | null;
  step: JiraPipelineStepId | null;
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
 * flow → daily → compilado. Caller owns the pipeline lock.
 */
export async function runJiraPipelinePostSyncSteps(input: {
  integrationId: string;
  createdBy: string | null;
  syncRunId: string | null;
  triggerSource: JiraSyncTriggerSource | string;
}): Promise<RunJiraPipelinePostSyncResult> {
  const integration = await getJiraIntegration(input.integrationId);
  if (!integration) {
    return {
      ok: false,
      syncRunId: input.syncRunId,
      step: "flow",
      message: "Integração não encontrada.",
      error: "Integração Jira não encontrada.",
    };
  }

  await updatePipelineLockStep(integration.id, "flow");

  const flowResult = await recomputeJiraFlowMetrics({
    integrationId: integration.id,
  });
  if (!flowResult.ok) {
    return {
      ok: false,
      syncRunId: input.syncRunId,
      step: "flow",
      message: "Falha no recompute de fluxo.",
      error: flowResult.error ?? "Falha ao recalcular métricas.",
    };
  }

  await updatePipelineLockStep(integration.id, "daily");

  const dailyResult = await recomputeJiraFlowDailyFacts({
    integrationId: integration.id,
    triggerSource: input.triggerSource,
    createdBy: input.createdBy,
  });
  if (!dailyResult.ok) {
    return {
      ok: false,
      syncRunId: input.syncRunId,
      step: "daily",
      message: "Falha nos fatos diários.",
      error: dailyResult.error ?? "Falha ao recalcular fatos diários.",
    };
  }

  await updatePipelineLockStep(integration.id, "compilado");

  const materialized = await materializeJiraCompiladoSnapshot({
    integrationId: integration.id,
    importedBy: input.createdBy,
    syncRunId: input.syncRunId,
  });

  revalidateJiraSurfaces();

  return {
    ok: true,
    syncRunId: input.syncRunId,
    step: "compilado",
    message: `Compilado · ${materialized.cardsInserted} cards · flow ${flowResult.metricsUpserted}/${flowResult.issuesProcessed} issues · ${materialized.justificationsCopied} justificativa(s)`,
  };
}
