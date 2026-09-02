"use client";

import { runJiraPipelineStepAction } from "@/app/app/jira/pipeline-actions";
import {
  JIRA_PIPELINE_STEPS,
  type JiraPipelineStepId,
} from "@/app/app/jira/pipeline-shared";
import {
  initialJiraPipelineSteps,
  JIRA_PIPELINE_STEP_LABELS,
  type JiraPipelineStepUiState,
} from "@/components/jira/jira-pipeline-ui";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

type UseJiraPipelineRunnerInput = {
  integrationId: string;
  teamId: string;
  onComplete?: () => void;
};

export function useJiraPipelineRunner({
  integrationId,
  teamId,
  onComplete,
}: UseJiraPipelineRunnerInput) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [forceFull, setForceFull] = useState(false);
  const [steps, setSteps] = useState<JiraPipelineStepUiState[]>(
    initialJiraPipelineSteps,
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const patchStep = useCallback(
    (stepId: JiraPipelineStepId, patch: Partial<JiraPipelineStepUiState>) => {
      setSteps((current) =>
        current.map((step) =>
          step.id === stepId ? { ...step, ...patch } : step,
        ),
      );
    },
    [],
  );

  const runPipeline = useCallback(() => {
    setError(null);
    setSuccess(null);
    setStarted(true);
    setSteps(initialJiraPipelineSteps());

    startTransition(async () => {
      let syncRunId: string | null = null;
      let failed = false;

      for (const stepId of JIRA_PIPELINE_STEPS) {
        if (failed) {
          patchStep(stepId, {
            status: "skipped",
            detail: "Etapa anterior falhou.",
          });
          continue;
        }

        patchStep(stepId, { status: "running", detail: "Em andamento…" });

        const result = await runJiraPipelineStepAction({
          integrationId,
          teamId,
          step: stepId,
          forceFull,
          syncRunId,
        });

        if (result.syncRunId) {
          syncRunId = result.syncRunId;
        }

        if (!result.ok) {
          failed = true;
          patchStep(stepId, {
            status: "error",
            detail: result.error ?? result.message,
          });
          setError(
            `Falhou em “${JIRA_PIPELINE_STEP_LABELS[stepId]}”: ${result.error ?? result.message}`,
          );
          continue;
        }

        patchStep(stepId, {
          status: "done",
          detail: result.message,
        });
      }

      if (!failed) {
        setSuccess("Pipeline concluída. Atualizando painel…");
        router.refresh();
        onComplete?.();
      }
    });
  }, [
    forceFull,
    integrationId,
    onComplete,
    patchStep,
    router,
    startTransition,
    teamId,
  ]);

  return {
    pending,
    forceFull,
    setForceFull,
    steps,
    error,
    success,
    started,
    runPipeline,
  };
}
