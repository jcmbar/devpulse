import {
  jiraPipelineStepStatusClass,
  jiraPipelineStepStatusLabel,
  type JiraPipelineStepUiState,
} from "@/components/jira/jira-pipeline-ui";

type JiraPipelineStepsListProps = {
  steps: JiraPipelineStepUiState[];
  compact?: boolean;
};

export function JiraPipelineStepsList({
  steps,
  compact = false,
}: JiraPipelineStepsListProps) {
  return (
    <ol
      className={
        compact
          ? "space-y-1 rounded-[var(--radius-sm)] border border-border/70 bg-muted/20 p-2"
          : "space-y-2 rounded-[var(--radius-sm)] border border-border/70 bg-muted/20 p-3"
      }
    >
      {steps.map((step) => (
        <li
          key={step.id}
          className={
            compact
              ? "flex flex-col gap-0.5 border-b border-border/40 pb-1 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
              : "flex flex-col gap-0.5 border-b border-border/40 pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
          }
        >
          <div className="min-w-0 space-y-0.5">
            <p className={compact ? "text-xs font-medium" : "text-sm font-medium"}>
              {step.label}
            </p>
            {step.detail ? (
              <p className="text-xs text-muted-foreground">{step.detail}</p>
            ) : null}
          </div>
          <p
            className={`shrink-0 text-xs font-medium ${jiraPipelineStepStatusClass(step.status)}`}
          >
            {jiraPipelineStepStatusLabel(step.status)}
            {step.status === "running" ? "…" : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
