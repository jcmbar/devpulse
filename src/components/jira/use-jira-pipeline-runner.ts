"use client";

import {
  abortManualJiraPipelineAction,
  beginManualJiraPipelineAction,
  getJiraPipelineStatusAction,
  runJiraPipelineStepAction,
  scheduleJiraPipelinePostSyncAction,
} from "@/app/app/jira/pipeline-actions";
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function stepsFromPipelineStep(
  current: JiraPipelineStepId | null,
  detail: string | null,
): JiraPipelineStepUiState[] {
  if (!current) {
    return initialJiraPipelineSteps();
  }

  const currentIdx = JIRA_PIPELINE_STEPS.indexOf(current);
  return JIRA_PIPELINE_STEPS.map((id, idx) => ({
    id,
    label: JIRA_PIPELINE_STEP_LABELS[id],
    status:
      idx < currentIdx ? "done" : idx === currentIdx ? "running" : "pending",
    detail: idx === currentIdx ? detail : null,
  }));
}

export function useJiraPipelineRunner({
  integrationId,
  teamId,
  onComplete,
}: UseJiraPipelineRunnerInput) {
  const router = useRouter();
  const [transitionPending, startTransition] = useTransition();
  const [polling, setPolling] = useState(false);
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
      try {
        const begin = await beginManualJiraPipelineAction({
          integrationId,
          teamId,
        });
        if (!begin.ok) {
          setStarted(false);
          setError(begin.error);
          return;
        }

        patchStep("sync", { status: "running", detail: "Em andamento…" });

        const syncResult = await runJiraPipelineStepAction({
          integrationId,
          teamId,
          step: "sync",
          forceFull,
        });

        if (!syncResult.ok) {
          await abortManualJiraPipelineAction({ integrationId, teamId });
          patchStep("sync", {
            status: "error",
            detail: syncResult.error ?? syncResult.message,
          });
          setError(
            `Falhou em “${JIRA_PIPELINE_STEP_LABELS.sync}”: ${syncResult.error ?? syncResult.message}`,
          );
          return;
        }

        patchStep("sync", {
          status: "done",
          detail: syncResult.message,
        });

        setSteps(
          stepsFromPipelineStep("flow", "Em andamento em segundo plano…"),
        );
        setPolling(true);

        await scheduleJiraPipelinePostSyncAction({
          integrationId,
          teamId,
          syncRunId: syncResult.syncRunId ?? null,
        });

        const pollStartedAt = Date.now();
        const pollTimeoutMs = 20 * 60_000;
        let pipelineError: string | null = null;

        while (Date.now() - pollStartedAt < pollTimeoutMs) {
          await sleep(2_500);

          const status = await getJiraPipelineStatusAction({ integrationId });
          if (!status) {
            pipelineError = "Integração não encontrada durante o acompanhamento.";
            break;
          }

          if (status.pipelineLastError) {
            pipelineError = status.pipelineLastError;
            break;
          }

          if (status.pipelineStep) {
            setSteps(
              stepsFromPipelineStep(
                status.pipelineStep,
                "Em andamento em segundo plano…",
              ),
            );
          }

          if (!status.pipelineLocked && !status.activeRun) {
            setSteps(
              JIRA_PIPELINE_STEPS.map((id) => ({
                id,
                label: JIRA_PIPELINE_STEP_LABELS[id],
                status: "done" as const,
                detail: id === "compilado" ? "Concluída em segundo plano." : null,
              })),
            );
            setSuccess("Pipeline concluída. Atualizando painel…");
            router.refresh();
            onComplete?.();
            return;
          }
        }

        if (pipelineError) {
          const failedStep =
            (await getJiraPipelineStatusAction({ integrationId }))
              ?.pipelineStep ?? "flow";
          const failedIdx = JIRA_PIPELINE_STEPS.indexOf(failedStep);
          setSteps(
            JIRA_PIPELINE_STEPS.map((id, idx) => ({
              id,
              label: JIRA_PIPELINE_STEP_LABELS[id],
              status:
                idx < failedIdx
                  ? ("done" as const)
                  : idx === failedIdx
                    ? ("error" as const)
                    : ("skipped" as const),
              detail:
                idx === failedIdx
                  ? pipelineError
                  : idx > failedIdx
                    ? "Etapa anterior falhou."
                    : null,
            })),
          );
          setError(
            `Falhou em “${JIRA_PIPELINE_STEP_LABELS[failedStep]}”: ${pipelineError}`,
          );
          return;
        }

        setError(
          "A pipeline demorou mais que o esperado. Recarregue a página para ver o status atual.",
        );
      } catch (cause) {
        await abortManualJiraPipelineAction({ integrationId, teamId }).catch(
          () => undefined,
        );
        setError(
          cause instanceof Error
            ? cause.message
            : "Falha inesperada ao executar a pipeline.",
        );
      } finally {
        setPolling(false);
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
    pending: transitionPending || polling,
    forceFull,
    setForceFull,
    steps,
    error,
    success,
    started,
    runPipeline,
  };
}
