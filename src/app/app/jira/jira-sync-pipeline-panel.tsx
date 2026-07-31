"use client";

import { runJiraPipelineStepAction } from "@/app/app/jira/pipeline-actions";
import {
  JIRA_PIPELINE_STEPS,
  type JiraPipelineStepId,
} from "@/app/app/jira/pipeline-shared";
import { FormCheck, FormFeedback, FormSectionHeader } from "@/components/ui/form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type StepUiStatus = "pending" | "running" | "done" | "error" | "skipped";

type StepUiState = {
  id: JiraPipelineStepId;
  label: string;
  status: StepUiStatus;
  detail: string | null;
};

const STEP_META: Record<JiraPipelineStepId, string> = {
  sync: "1. Sync Jira",
  flow: "2. Recalcular métricas de fluxo",
  daily: "3. Recalcular fatos diários",
  compilado: "4. Materializar snapshot Compilado",
};

function initialSteps(): StepUiState[] {
  return JIRA_PIPELINE_STEPS.map((id) => ({
    id,
    label: STEP_META[id],
    status: "pending",
    detail: null,
  }));
}

function statusLabel(status: StepUiStatus): string {
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

function statusClass(status: StepUiStatus): string {
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

type JiraSyncPipelinePanelProps = {
  integrationId: string;
  teamId: string;
  enabled: boolean;
  mappingReady?: boolean;
  mappingPendingLabels?: string[];
};

export function JiraSyncPipelinePanel({
  integrationId,
  teamId,
  enabled,
  mappingReady = true,
  mappingPendingLabels = [],
}: JiraSyncPipelinePanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [forceFull, setForceFull] = useState(false);
  const [steps, setSteps] = useState<StepUiState[]>(initialSteps);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const canRun = enabled && mappingReady;

  function patchStep(
    stepId: JiraPipelineStepId,
    patch: Partial<StepUiState>,
  ) {
    setSteps((current) =>
      current.map((step) =>
        step.id === stepId ? { ...step, ...patch } : step,
      ),
    );
  }

  function runPipeline() {
    if (!canRun) {
      return;
    }
    setError(null);
    setSuccess(null);
    setStarted(true);
    setSteps(initialSteps());

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
            `Falhou em “${STEP_META[stepId]}”: ${result.error ?? result.message}`,
          );
          continue;
        }

        patchStep(stepId, {
          status: "done",
          detail: result.message,
        });
      }

      if (!failed) {
        setSuccess(
          "Pipeline concluída. Dados prontos para Gestor/Home (snapshot Compilado) e analytics de fluxo.",
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <FormSectionHeader
        title="Operações"
        description={
          <>
            “Rodar sync agora” executa sync → fluxo → fatos diários → Compilado.
            {" · "}
            <Link
              href={`/app/jira/analytics?integrationId=${integrationId}&teamId=${teamId}`}
              className="underline-offset-4 hover:underline"
            >
              Abrir dashboard
            </Link>
          </>
        }
      />

      <FormCheck>
        <input
          type="checkbox"
          className="ui-checkbox mt-0.5"
          checked={forceFull}
          disabled={pending}
          onChange={(event) => setForceFull(event.target.checked)}
        />
        <span>Forçar sync full (ignora cursor)</span>
      </FormCheck>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || !canRun}
          onClick={() => runPipeline()}
          className="ui-btn-primary"
        >
          {pending ? "Executando pipeline…" : "Rodar sync agora"}
        </button>
        {!enabled ? (
          <p className="text-xs text-muted-foreground">
            Habilite a integração antes de sincronizar.
          </p>
        ) : !mappingReady ? (
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Complete o de/para obrigatório antes do sync
            {mappingPendingLabels.length > 0
              ? `: ${mappingPendingLabels.join(", ")}`
              : "."}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Incremental se houver cursor; full na primeira execução (ou com a
            opção acima).
          </p>
        )}
      </div>

      <FormFeedback error={error} success={success} />

      {started ? (
        <ol className="space-y-2 rounded-[var(--radius-sm)] border border-border/70 bg-muted/20 p-3">
          {steps.map((step) => (
            <li
              key={step.id}
              className="flex flex-col gap-0.5 border-b border-border/40 pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
            >
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{step.label}</p>
                {step.detail ? (
                  <p className="text-xs text-muted-foreground">{step.detail}</p>
                ) : null}
              </div>
              <p
                className={`shrink-0 text-xs font-medium ${statusClass(step.status)}`}
              >
                {statusLabel(step.status)}
                {step.status === "running" ? "…" : ""}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
