import "server-only";

import { getJiraMappingReadiness } from "@/lib/jira/field-mappings";
import { resolveJiraAutoSyncCooldownMinutes } from "@/services/integrations/jira/constants";
import type { JiraIntegration } from "@/types/jira-integration";

export type AutoSyncSkipReason =
  | "disabled"
  | "mappings_incomplete"
  | "active_run"
  | "pipeline_locked"
  | "cooldown";

export type ShouldAutoSyncResult =
  | { ok: true }
  | { ok: false; reason: AutoSyncSkipReason; detail?: string };

/**
 * Pure eligibility gate for gestor auto-sync (no DB side effects).
 */
export function shouldAutoSyncJiraIntegration(input: {
  integration: JiraIntegration;
  now?: Date;
  cooldownMinutes?: number;
  hasActiveRun: boolean;
  pipelineLocked: boolean;
}): ShouldAutoSyncResult {
  const now = input.now ?? new Date();
  const cooldownMinutes =
    input.cooldownMinutes ??
    resolveJiraAutoSyncCooldownMinutes(input.integration.settings);

  if (!input.integration.is_enabled) {
    return { ok: false, reason: "disabled" };
  }

  const readiness = getJiraMappingReadiness(input.integration.field_mappings);
  if (!readiness.ready) {
    return {
      ok: false,
      reason: "mappings_incomplete",
      detail: readiness.pendingLabels.join(", "),
    };
  }

  if (input.hasActiveRun) {
    return { ok: false, reason: "active_run" };
  }

  if (input.pipelineLocked) {
    return { ok: false, reason: "pipeline_locked" };
  }

  const lastOk = input.integration.last_successful_sync_at;
  if (lastOk) {
    const lastMs = Date.parse(lastOk);
    if (Number.isFinite(lastMs)) {
      const ageMinutes = (now.getTime() - lastMs) / 60_000;
      if (ageMinutes < cooldownMinutes) {
        return {
          ok: false,
          reason: "cooldown",
          detail: `${Math.ceil(cooldownMinutes - ageMinutes)} min restantes`,
        };
      }
    }
  }

  return { ok: true };
}
