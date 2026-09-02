export const JIRA_PIPELINE_STEPS = [
  "sync",
  "flow",
  "daily",
  "compilado",
] as const;

export type JiraPipelineStepId = (typeof JIRA_PIPELINE_STEPS)[number];

export function isJiraPipelineStepId(
  value: string,
): value is JiraPipelineStepId {
  return (JIRA_PIPELINE_STEPS as readonly string[]).includes(value);
}

export type JiraPipelineStepResult = {
  ok: boolean;
  step: JiraPipelineStepId;
  message: string;
  error?: string;
  /** Passed from sync → compilado for provenance. */
  syncRunId?: string | null;
};
