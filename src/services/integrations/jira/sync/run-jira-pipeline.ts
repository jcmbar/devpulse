import "server-only";

import type { JiraSyncTriggerSource } from "@/services/integrations/jira/constants";
import { getJiraIntegration } from "@/services/integrations/jira/repositories/integrations";
import { updatePipelineLockStep } from "@/services/integrations/jira/sync/pipeline-lock";
import { runJiraPipelinePostSyncSteps } from "@/services/integrations/jira/sync/run-jira-pipeline-post-sync";
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
    await updatePipelineLockStep(integration.id, "sync");

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

    const postSync = await runJiraPipelinePostSyncSteps({
      integrationId: integration.id,
      createdBy: input.createdBy,
      syncRunId,
      triggerSource: input.triggerSource,
    });

    if (!postSync.ok) {
      return {
        ok: false,
        syncRunId,
        step: postSync.step,
        message: postSync.message,
        error: postSync.error,
      };
    }

    return {
      ok: true,
      syncRunId,
      step: "compilado",
      message: `Pipeline OK · sync ${syncResult.run.mode} · ${syncResult.run.issues_upserted} issues · ${postSync.message}`,
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
