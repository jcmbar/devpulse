"use client";

import { getGestorSyncStatusAction } from "@/app/app/jira/pipeline-actions";
import {
  JIRA_PIPELINE_STEPS,
  type JiraPipelineStepId,
} from "@/app/app/jira/pipeline-shared";
import {
  initialJiraPipelineSteps,
  JIRA_PIPELINE_STEP_LABELS,
  type JiraPipelineStepUiState,
} from "@/components/jira/jira-pipeline-ui";
import { JiraPipelineStepsList } from "@/components/jira/jira-pipeline-steps-list";
import { useJiraPipelineRunner } from "@/components/jira/use-jira-pipeline-runner";
import type { JiraSyncStatusSummary } from "@/types/jira-sync-status";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

type GestorSyncControlsProps = {
  integrationIds: string[];
  integrationId: string;
  teamId: string;
};

function formatRelativeMinutes(iso: string | null, nowMs: number): string | null {
  if (!iso) {
    return null;
  }
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) {
    return null;
  }
  const diffMin = Math.max(0, Math.round((nowMs - then) / 60_000));
  if (diffMin < 1) {
    return "há menos de 1 min";
  }
  if (diffMin === 1) {
    return "há 1 min";
  }
  if (diffMin < 60) {
    return `há ${diffMin} min`;
  }
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) {
    return hours === 1 ? "há 1 h" : `há ${hours} h`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

function pickPrimary(summaries: JiraSyncStatusSummary[]): JiraSyncStatusSummary | null {
  if (summaries.length === 0) {
    return null;
  }
  const running = summaries.find(
    (row) => row.activeRun != null || row.pipelineLocked,
  );
  if (running) {
    return running;
  }
  return summaries[0] ?? null;
}

function remoteStepsFromSummary(
  summary: JiraSyncStatusSummary,
): JiraPipelineStepUiState[] {
  const current: JiraPipelineStepId | null =
    summary.pipelineStep ?? (summary.activeRun ? "sync" : null);

  if (!current) {
    return initialJiraPipelineSteps();
  }

  const currentIdx = JIRA_PIPELINE_STEPS.indexOf(current);
  return JIRA_PIPELINE_STEPS.map((id, idx) => ({
    id,
    label: JIRA_PIPELINE_STEP_LABELS[id],
    status:
      idx < currentIdx ? "done" : idx === currentIdx ? "running" : "pending",
    detail: idx === currentIdx ? "Em andamento…" : null,
  }));
}

export function GestorSyncControls({
  integrationIds,
  integrationId,
  teamId,
}: GestorSyncControlsProps) {
  const router = useRouter();
  const [summaries, setSummaries] = useState<JiraSyncStatusSummary[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [, startStatusTransition] = useTransition();
  const wasRunningRef = useRef(false);
  const busyRef = useRef(false);

  const {
    pending: manualPending,
    steps: manualSteps,
    error: manualError,
    success: manualSuccess,
    started: manualStarted,
    runPipeline,
  } = useJiraPipelineRunner({
    integrationId,
    teamId,
    onComplete: () => router.refresh(),
  });

  const primary = pickPrimary(summaries);
  const remoteBusy =
    primary != null &&
    (primary.activeRun != null || primary.pipelineLocked);
  const isRunning = manualPending || remoteBusy;
  const showSteps = manualStarted || remoteBusy;

  const displaySteps = useMemo(() => {
    if (manualStarted) {
      return manualSteps;
    }
    if (remoteBusy && primary) {
      return remoteStepsFromSummary(primary);
    }
    return manualSteps;
  }, [manualStarted, manualSteps, primary, remoteBusy]);

  useEffect(() => {
    busyRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    if (isRunning) {
      wasRunningRef.current = true;
    } else if (wasRunningRef.current) {
      wasRunningRef.current = false;
      router.refresh();
    }
  }, [isRunning, router]);

  useEffect(() => {
    if (integrationIds.length === 0) {
      return;
    }

    let cancelled = false;
    const refresh = () => {
      startStatusTransition(async () => {
        try {
          const next = await getGestorSyncStatusAction({ integrationIds });
          if (!cancelled) {
            setSummaries(next);
            setNowMs(Date.now());
          }
        } catch {
          // ignore transient poll errors
        }
      });
    };

    refresh();
    const bootTimers = [3_000, 10_000, 25_000].map((ms) =>
      window.setTimeout(refresh, ms),
    );

    const interval = window.setInterval(() => {
      if (busyRef.current) {
        refresh();
      }
    }, 3_000);

    return () => {
      cancelled = true;
      for (const id of bootTimers) {
        window.clearTimeout(id);
      }
      window.clearInterval(interval);
    };
  }, [integrationIds, startStatusTransition]);

  const relative = primary
    ? formatRelativeMinutes(primary.lastSuccessfulSyncAt, nowMs)
    : null;
  const failed =
    primary &&
    !isRunning &&
    primary.latestFailedRun &&
    (!primary.lastSuccessfulSyncAt ||
      Date.parse(primary.latestFailedRun.created_at) >
        Date.parse(primary.lastSuccessfulSyncAt))
      ? primary.latestFailedRun
      : null;

  const runningLabel =
    manualPending && manualStarted
      ? manualSteps.find((step) => step.status === "running")?.label ??
        "Sincronizando…"
      : primary?.pipelineStep
        ? JIRA_PIPELINE_STEP_LABELS[primary.pipelineStep]
        : primary?.activeRun
          ? JIRA_PIPELINE_STEP_LABELS.sync
          : "Sincronizando…";

  return (
    <div className="flex w-full min-w-0 flex-col items-stretch gap-1.5 sm:w-auto sm:min-w-[18rem] sm:items-end">
      {showSteps ? (
        <div className="w-full sm:max-w-md">
          <JiraPipelineStepsList steps={displaySteps} compact />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col gap-0.5 text-xs sm:items-end sm:text-right">
        {isRunning ? (
          <p className="font-medium text-brand">{runningLabel}…</p>
        ) : relative ? (
          <p className="text-muted-foreground">
            Última sincronização: {relative}
          </p>
        ) : primary ? (
          <p className="text-muted-foreground">Ainda sem sync bem-sucedida</p>
        ) : integrationIds.length > 0 ? (
          <p className="text-muted-foreground">Verificando sincronização…</p>
        ) : null}
        {failed?.error_message ? (
          <p className="max-w-xs text-danger" title={failed.error_message}>
            Última falha: {failed.error_message}
          </p>
        ) : null}
        {summaries.length > 1 && isRunning ? (
          <p className="text-muted-foreground">
            {summaries.filter((s) => s.activeRun || s.pipelineLocked).length}/
            {summaries.length} integrações
          </p>
        ) : null}
      </div>

      <button
        type="button"
        disabled={manualPending || remoteBusy}
        onClick={() => runPipeline()}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-semibold text-brand-on shadow-[var(--shadow-sm)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {manualPending || remoteBusy ? "Sincronizando…" : "Rodar Sync Agora"}
      </button>

      {manualError ? (
        <p className="text-xs text-danger sm:max-w-xs sm:text-right">
          {manualError}
        </p>
      ) : null}
      {manualSuccess && !manualError ? (
        <p className="text-xs text-success sm:max-w-xs sm:text-right">
          {manualSuccess}
        </p>
      ) : null}
    </div>
  );
}
