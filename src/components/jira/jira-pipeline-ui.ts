import {
  JIRA_PIPELINE_STEPS,
  type JiraPipelineStepId,
} from "@/app/app/jira/pipeline-shared";

export type JiraPipelineStepUiStatus =
  | "pending"
  | "running"
  | "done"
  | "error"
  | "skipped";

export type JiraPipelineStepUiState = {
  id: JiraPipelineStepId;
  label: string;
  status: JiraPipelineStepUiStatus;
  detail: string | null;
};

export const JIRA_PIPELINE_STEP_LABELS: Record<JiraPipelineStepId, string> = {
  sync: "1. Sync Jira",
  flow: "2. Recalcular métricas de fluxo",
  daily: "3. Recalcular fatos diários",
  compilado: "4. Materializar snapshot Compilado",
};

export function initialJiraPipelineSteps(): JiraPipelineStepUiState[] {
  return JIRA_PIPELINE_STEPS.map((id) => ({
    id,
    label: JIRA_PIPELINE_STEP_LABELS[id],
    status: "pending",
    detail: null,
  }));
}

export function jiraPipelineStepStatusLabel(
  status: JiraPipelineStepUiStatus,
): string {
  switch (status) {
    case "pending":
      return "Aguardando";
    case "running":
      return "Executando";
    case "done":
      return "Concluída";
    case "error":
      return "Erro";
    case "skipped":
      return "Não executada";
  }
}

export function jiraPipelineStepStatusClass(
  status: JiraPipelineStepUiStatus,
): string {
  switch (status) {
    case "pending":
      return "text-muted-foreground";
    case "running":
      return "text-sky-800 dark:text-sky-200";
    case "done":
      return "text-emerald-700 dark:text-emerald-300";
    case "error":
      return "text-amber-800 dark:text-amber-200";
    case "skipped":
      return "text-muted-foreground";
  }
}
