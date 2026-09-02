import "server-only";

import type { JiraPipelineStepId } from "@/app/app/jira/pipeline-shared";
import {
  JIRA_PIPELINE_LAST_ERROR_KEY,
  JIRA_PIPELINE_LOCK_SETTINGS_KEY,
  JIRA_SYNC_STALE_MINUTES,
  type JiraSyncTriggerSource,
} from "@/services/integrations/jira/constants";
import {
  findActiveJiraSyncRun,
  getJiraIntegration,
  markStaleJiraSyncRunsFailed,
  updateJiraIntegrationSettings,
} from "@/services/integrations/jira/repositories/integrations";
import type { JiraIntegration } from "@/types/jira-integration";

export type PipelineLockPayload = {
  locked_at: string;
  trigger: JiraSyncTriggerSource | string;
  by: string | null;
  step?: JiraPipelineStepId;
};

function readPipelineLock(
  settings: Record<string, unknown>,
): PipelineLockPayload | null {
  const raw = settings[JIRA_PIPELINE_LOCK_SETTINGS_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const lockedAt = typeof obj.locked_at === "string" ? obj.locked_at : null;
  if (!lockedAt) {
    return null;
  }
  const stepRaw = obj.step;
  const step =
    stepRaw === "sync" ||
    stepRaw === "flow" ||
    stepRaw === "daily" ||
    stepRaw === "compilado"
      ? stepRaw
      : undefined;

  return {
    locked_at: lockedAt,
    trigger: typeof obj.trigger === "string" ? obj.trigger : "unknown",
    by: typeof obj.by === "string" ? obj.by : null,
    step,
  };
}

function isLockStale(lock: PipelineLockPayload, now: Date): boolean {
  const lockedMs = Date.parse(lock.locked_at);
  if (!Number.isFinite(lockedMs)) {
    return true;
  }
  const ageMinutes = (now.getTime() - lockedMs) / 60_000;
  return ageMinutes >= JIRA_SYNC_STALE_MINUTES;
}

export function hasPipelineLock(integration: JiraIntegration): boolean {
  const lock = readPipelineLock(integration.settings);
  if (!lock) {
    return false;
  }
  return !isLockStale(lock, new Date());
}

export async function recoverStaleSyncState(integrationId: string): Promise<{
  staleRunsCleared: number;
  staleLockCleared: boolean;
}> {
  const now = new Date();
  const staleBefore = new Date(
    now.getTime() - JIRA_SYNC_STALE_MINUTES * 60_000,
  ).toISOString();

  const staleRunsCleared = await markStaleJiraSyncRunsFailed({
    integrationId,
    staleBeforeIso: staleBefore,
  });

  const integration = await getJiraIntegration(integrationId);
  let staleLockCleared = false;
  if (integration) {
    const lock = readPipelineLock(integration.settings);
    if (lock && isLockStale(lock, now)) {
      const nextSettings = { ...integration.settings };
      delete nextSettings[JIRA_PIPELINE_LOCK_SETTINGS_KEY];
      await updateJiraIntegrationSettings({
        integrationId,
        settings: nextSettings,
      });
      staleLockCleared = true;
    }
  }

  return { staleRunsCleared, staleLockCleared };
}

export type AcquirePipelineLockResult =
  | { ok: true; integration: JiraIntegration }
  | { ok: false; reason: "not_found" | "already_locked" | "active_run" };

/**
 * Soft lease for the full pipeline (sync → flow → daily → compilado).
 * Complements the unique active-run index on jira_sync_runs.
 */
export async function tryAcquirePipelineLock(input: {
  integrationId: string;
  trigger: JiraSyncTriggerSource | string;
  actorUserId: string | null;
}): Promise<AcquirePipelineLockResult> {
  await recoverStaleSyncState(input.integrationId);

  const integration = await getJiraIntegration(input.integrationId);
  if (!integration) {
    return { ok: false, reason: "not_found" };
  }

  if (hasPipelineLock(integration)) {
    return { ok: false, reason: "already_locked" };
  }

  const active = await findActiveJiraSyncRun(input.integrationId);
  if (active) {
    return { ok: false, reason: "active_run" };
  }

  const lock: PipelineLockPayload = {
    locked_at: new Date().toISOString(),
    trigger: input.trigger,
    by: input.actorUserId,
  };

  const updated = await updateJiraIntegrationSettings({
    integrationId: input.integrationId,
    settings: {
      ...integration.settings,
      [JIRA_PIPELINE_LOCK_SETTINGS_KEY]: lock,
    },
  });

  return { ok: true, integration: updated };
}

export async function updatePipelineLockStep(
  integrationId: string,
  step: JiraPipelineStepId,
): Promise<void> {
  const integration = await getJiraIntegration(integrationId);
  if (!integration) {
    return;
  }
  const lock = readPipelineLock(integration.settings);
  if (!lock) {
    return;
  }
  await updateJiraIntegrationSettings({
    integrationId,
    settings: {
      ...integration.settings,
      [JIRA_PIPELINE_LOCK_SETTINGS_KEY]: { ...lock, step },
    },
  });
}

export async function setPipelineLastError(
  integrationId: string,
  error: string,
): Promise<void> {
  const integration = await getJiraIntegration(integrationId);
  if (!integration) {
    return;
  }
  await updateJiraIntegrationSettings({
    integrationId,
    settings: {
      ...integration.settings,
      [JIRA_PIPELINE_LAST_ERROR_KEY]: error,
    },
  });
}

export async function clearPipelineLastError(
  integrationId: string,
): Promise<void> {
  const integration = await getJiraIntegration(integrationId);
  if (!integration) {
    return;
  }
  if (!(JIRA_PIPELINE_LAST_ERROR_KEY in integration.settings)) {
    return;
  }
  const nextSettings = { ...integration.settings };
  delete nextSettings[JIRA_PIPELINE_LAST_ERROR_KEY];
  await updateJiraIntegrationSettings({
    integrationId,
    settings: nextSettings,
  });
}

export async function releasePipelineLock(
  integrationId: string,
): Promise<void> {
  const integration = await getJiraIntegration(integrationId);
  if (!integration) {
    return;
  }
  if (!(JIRA_PIPELINE_LOCK_SETTINGS_KEY in integration.settings)) {
    return;
  }
  const nextSettings = { ...integration.settings };
  delete nextSettings[JIRA_PIPELINE_LOCK_SETTINGS_KEY];
  await updateJiraIntegrationSettings({
    integrationId,
    settings: nextSettings,
  });
}

export async function isIntegrationBusy(
  integrationId: string,
): Promise<boolean> {
  await recoverStaleSyncState(integrationId);
  const integration = await getJiraIntegration(integrationId);
  if (!integration) {
    return false;
  }
  if (hasPipelineLock(integration)) {
    return true;
  }
  const active = await findActiveJiraSyncRun(integrationId);
  return active != null;
}
