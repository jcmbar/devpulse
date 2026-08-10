"use client";

import { getGestorSyncStatusAction } from "@/app/app/jira/pipeline-actions";
import type { JiraSyncStatusSummary } from "@/types/jira-sync-status";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

type GestorSyncStatusProps = {
  /** Seed from SSR when available; empty + integrationIds defers status off the critical path. */
  initialSummaries?: JiraSyncStatusSummary[];
  /** When provided (and summaries empty), fetch status right after paint. */
  integrationIds?: string[];
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

export function GestorSyncStatus({
  initialSummaries = [],
  integrationIds: integrationIdsProp,
}: GestorSyncStatusProps) {
  const router = useRouter();
  const [summaries, setSummaries] = useState(initialSummaries);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [, startTransition] = useTransition();
  const wasRunningRef = useRef(false);
  const busyRef = useRef(false);

  const integrationIds = useMemo(() => {
    if (integrationIdsProp && integrationIdsProp.length > 0) {
      return integrationIdsProp;
    }
    return initialSummaries.map((row) => row.integrationId);
  }, [initialSummaries, integrationIdsProp]);

  const primary = pickPrimary(summaries);
  const isRunning =
    primary != null &&
    (primary.activeRun != null || primary.pipelineLocked);

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
      startTransition(async () => {
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

    // Immediate paint for deferred SSR path; then catch late auto-sync.
    refresh();
    const bootTimers = [3_000, 10_000, 25_000].map((ms) =>
      window.setTimeout(refresh, ms),
    );

    const interval = window.setInterval(() => {
      if (busyRef.current) {
        refresh();
      }
    }, 15_000);

    return () => {
      cancelled = true;
      for (const id of bootTimers) {
        window.clearTimeout(id);
      }
      window.clearInterval(interval);
    };
  }, [integrationIds, startTransition]);

  if (!primary) {
    if (integrationIds.length === 0) {
      return null;
    }
    return (
      <p className="text-xs text-muted-foreground sm:text-right">
        Verificando sincronização…
      </p>
    );
  }

  const relative = formatRelativeMinutes(primary.lastSuccessfulSyncAt, nowMs);
  const failed =
    !isRunning &&
    primary.latestFailedRun &&
    (!primary.lastSuccessfulSyncAt ||
      Date.parse(primary.latestFailedRun.created_at) >
        Date.parse(primary.lastSuccessfulSyncAt))
      ? primary.latestFailedRun
      : null;

  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs sm:items-end sm:text-right">
      {isRunning ? (
        <p className="font-medium text-brand">Sincronizando…</p>
      ) : relative ? (
        <p className="text-muted-foreground">
          Última sincronização: {relative}
        </p>
      ) : (
        <p className="text-muted-foreground">Ainda sem sync bem-sucedida</p>
      )}
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
  );
}
