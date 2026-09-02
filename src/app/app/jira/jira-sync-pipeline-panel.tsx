"use client";

import { FormCheck, FormFeedback, FormSectionHeader } from "@/components/ui/form";
import { JiraPipelineStepsList } from "@/components/jira/jira-pipeline-steps-list";
import { useJiraPipelineRunner } from "@/components/jira/use-jira-pipeline-runner";
import Link from "next/link";

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
  const {
    pending,
    forceFull,
    setForceFull,
    steps,
    error,
    success,
    started,
    runPipeline,
  } = useJiraPipelineRunner({ integrationId, teamId });

  const canRun = enabled && mappingReady;

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

      {started ? <JiraPipelineStepsList steps={steps} /> : null}
    </div>
  );
}
