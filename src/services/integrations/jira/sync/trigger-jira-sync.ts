import "server-only";

import {
  resolveJiraAutoSyncCooldownMinutes,
  type JiraSyncTriggerSource,
} from "@/services/integrations/jira/constants";
import {
  findActiveJiraSyncRun,
  getJiraIntegration,
  markActiveJiraSyncRunsFailed,
} from "@/services/integrations/jira/repositories/integrations";
import {
  hasPipelineLock,
  recoverStaleSyncState,
  releasePipelineLock,
  tryAcquirePipelineLock,
} from "@/services/integrations/jira/sync/pipeline-lock";
import { runJiraPipelineForIntegration } from "@/services/integrations/jira/sync/run-jira-pipeline";
import { shouldAutoSyncJiraIntegration } from "@/services/integrations/jira/sync/should-auto-sync";

export type TriggerJiraSyncInput = {
  integrationId: string;
  /** When true, ignore cooldown (manual “Sync agora”). */
  force: boolean;
  trigger: JiraSyncTriggerSource;
  actorUserId: string | null;
  forceFull?: boolean;
};

export type TriggerJiraSyncSkipReason =
  | "not_found"
  | "disabled"
  | "mappings_incomplete"
  | "active_run"
  | "pipeline_locked"
  | "cooldown"
  | "already_running";

export type TriggerJiraSyncResult =
  | {
      ok: true;
      started: true;
      syncRunId: string | null;
      message: string;
    }
  | {
      ok: false;
      started: true;
      syncRunId: string | null;
      message: string;
      error?: string;
    }
  | {
      ok: false;
      started: false;
      reason: TriggerJiraSyncSkipReason;
      message: string;
      error?: string;
    };

function isUniqueActiveRunConflict(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("jira_sync_runs_one_active_per_integration") ||
    message.includes("duplicate key") ||
    message.includes("unique constraint")
  );
}

/**
 * Central entry for manual and auto Jira sync.
 * Acquires pipeline lock, runs full pipeline, always releases lock.
 */
export async function triggerJiraSync(
  input: TriggerJiraSyncInput,
): Promise<TriggerJiraSyncResult> {
  const integration = await getJiraIntegration(input.integrationId);
  if (!integration) {
    return {
      ok: false,
      started: false,
      reason: "not_found",
      message: "Integração não encontrada.",
    };
  }

  if (!input.force) {
    const active = await findActiveJiraSyncRun(input.integrationId);
    const gate = shouldAutoSyncJiraIntegration({
      integration,
      hasActiveRun: active != null,
      pipelineLocked: hasPipelineLock(integration),
      cooldownMinutes: resolveJiraAutoSyncCooldownMinutes(integration.settings),
    });
    if (!gate.ok) {
      return {
        ok: false,
        started: false,
        reason: gate.reason,
        message:
          gate.reason === "cooldown"
            ? `Sync recente (cooldown). ${gate.detail ?? ""}`.trim()
            : gate.reason === "mappings_incomplete"
              ? `De/para incompleto: ${gate.detail ?? ""}`
              : gate.reason === "disabled"
                ? "Integração desabilitada."
                : gate.reason === "active_run" ||
                    gate.reason === "pipeline_locked"
                  ? "Já existe uma sincronização em andamento."
                  : "Sync automático ignorado.",
      };
    }
  } else {
    // Manual force: clear leftover pending/running so a stuck row cannot block.
    await recoverStaleSyncState(input.integrationId);
    const active = await findActiveJiraSyncRun(input.integrationId);
    if (active) {
      await markActiveJiraSyncRunsFailed({
        integrationId: input.integrationId,
        reason: "superseded_by_manual_force",
        message: "Sync anterior substituído por sync manual (force).",
      });
    }
  }

  const claimed = await tryAcquirePipelineLock({
    integrationId: input.integrationId,
    trigger: input.trigger,
    actorUserId: input.actorUserId,
  });

  if (!claimed.ok) {
    return {
      ok: false,
      started: false,
      reason:
        claimed.reason === "already_locked" || claimed.reason === "active_run"
          ? "already_running"
          : "not_found",
      message:
        claimed.reason === "not_found"
          ? "Integração não encontrada."
          : "Já existe uma sincronização em andamento.",
    };
  }

  try {
    const result = await runJiraPipelineForIntegration({
      integrationId: input.integrationId,
      createdBy: input.actorUserId,
      forceFull: input.forceFull === true,
      triggerSource: input.trigger,
      cooldownBypassed: input.force,
    });

    if (!result.ok) {
      return {
        ok: false,
        started: true,
        syncRunId: result.syncRunId,
        message: result.message,
        error: result.error,
      };
    }

    return {
      ok: true,
      started: true,
      syncRunId: result.syncRunId,
      message: result.message,
    };
  } catch (error) {
    if (isUniqueActiveRunConflict(error)) {
      return {
        ok: false,
        started: false,
        reason: "already_running",
        message: "Já existe uma sincronização em andamento.",
      };
    }
    return {
      ok: false,
      started: true,
      syncRunId: null,
      message: "Falha na pipeline.",
      error: error instanceof Error ? error.message : "Erro inesperado.",
    };
  } finally {
    await releasePipelineLock(input.integrationId);
  }
}
