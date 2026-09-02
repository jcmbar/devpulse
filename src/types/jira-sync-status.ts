import type { JiraPipelineStepId } from "@/app/app/jira/pipeline-shared";
import type { JiraSyncRun } from "@/types/jira-integration";

/** Serializable sync status for Gestor UI (auto-sync + manual). */
export type JiraSyncStatusSummary = {
  integrationId: string;
  teamId: string;
  integrationName: string;
  isEnabled: boolean;
  lastSuccessfulSyncAt: string | null;
  activeRun: JiraSyncRun | null;
  latestRun: JiraSyncRun | null;
  latestFailedRun: JiraSyncRun | null;
  pipelineLocked: boolean;
  pipelineStep: JiraPipelineStepId | null;
};
