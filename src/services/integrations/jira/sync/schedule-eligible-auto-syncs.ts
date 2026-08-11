import "server-only";

import { after } from "next/server";
import { runWithServiceRole } from "@/lib/supabase/service-role-context";
import type { JiraSyncTriggerSource } from "@/services/integrations/jira/constants";
import {
  findActiveJiraSyncRun,
  listJiraIntegrations,
} from "@/services/integrations/jira/repositories/integrations";
import { hasPipelineLock } from "@/services/integrations/jira/sync/pipeline-lock";
import { shouldAutoSyncJiraIntegration } from "@/services/integrations/jira/sync/should-auto-sync";
import { triggerJiraSync } from "@/services/integrations/jira/sync/trigger-jira-sync";

export type ScheduleEligibleJiraAutoSyncsResult = {
  scheduled: number;
  skipped: number;
  integrationIds: string[];
};

async function scheduleEligibleJiraAutoSyncsInner(input: {
  teamId?: string | null;
  trigger: Extract<JiraSyncTriggerSource, "auto_gestor_load" | "auto_cron">;
  actorUserId: string | null;
}): Promise<ScheduleEligibleJiraAutoSyncsResult> {
  const all = await listJiraIntegrations();
  const scoped = input.teamId
    ? all.filter((row) => row.team_id === input.teamId && row.is_enabled)
    : all.filter((row) => row.is_enabled);

  const eligibleIds: string[] = [];
  let skipped = 0;

  for (const integration of scoped) {
    const active = await findActiveJiraSyncRun(integration.id);
    const gate = shouldAutoSyncJiraIntegration({
      integration,
      hasActiveRun: active != null,
      pipelineLocked: hasPipelineLock(integration),
    });
    if (!gate.ok) {
      skipped += 1;
      continue;
    }
    eligibleIds.push(integration.id);
  }

  if (eligibleIds.length > 0) {
    const { trigger, actorUserId } = input;
    const useServiceRole = trigger === "auto_cron";
    after(async () => {
      const runPipelines = async () => {
        for (const integrationId of eligibleIds) {
          try {
            await triggerJiraSync({
              integrationId,
              force: false,
              trigger,
              actorUserId,
              forceFull: false,
            });
          } catch (error) {
            console.error(
              "[scheduleEligibleJiraAutoSyncs] pipeline failed",
              trigger,
              integrationId,
              error,
            );
          }
        }
      };
      if (useServiceRole) {
        await runWithServiceRole(runPipelines);
      } else {
        await runPipelines();
      }
    });
  }

  return {
    scheduled: eligibleIds.length,
    skipped,
    integrationIds: eligibleIds,
  };
}

/**
 * Select eligible Jira integrations and run their pipeline in the background
 * (same gate as Gestor auto-sync: enabled, mappings ready, no active run/lock,
 * outside cooldown). Returns immediately after scheduling via `after()`.
 *
 * `auto_cron` runs under the service role (no user session / RLS bypass).
 */
export async function scheduleEligibleJiraAutoSyncs(input: {
  /** When set, only that team's integrations. When null/omitted, all enabled. */
  teamId?: string | null;
  trigger: Extract<JiraSyncTriggerSource, "auto_gestor_load" | "auto_cron">;
  actorUserId: string | null;
}): Promise<ScheduleEligibleJiraAutoSyncsResult> {
  if (input.trigger === "auto_cron") {
    return runWithServiceRole(() => scheduleEligibleJiraAutoSyncsInner(input));
  }
  return scheduleEligibleJiraAutoSyncsInner(input);
}
