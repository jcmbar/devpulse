"use client";

import {
  resolvedSourceLabel,
  type CompiladoResolvedSource,
} from "@/lib/metrics/gestor-data-source";

type CompiladoProvenanceBadgeProps = {
  resolvedSource: CompiladoResolvedSource;
  resolvedAt: string;
  resolutionReason?: string | null;
  jiraCloudNewerThanSnapshot?: boolean;
  jiraCloudSyncAt?: string | null;
};

function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function CompiladoProvenanceBadge({
  resolvedSource,
  resolvedAt,
  resolutionReason,
  jiraCloudNewerThanSnapshot,
  jiraCloudSyncAt,
}: CompiladoProvenanceBadgeProps) {
  return (
    <div className="space-y-2 rounded-[var(--radius-sm)] border border-border/60 bg-muted/25 px-3 py-2.5 text-sm sm:px-4 sm:py-3">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Origem ativa
          </span>
          <span className="inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 text-xs font-medium">
            {resolvedSourceLabel(resolvedSource)}
          </span>
        </div>
        <span className="text-xs text-muted-foreground sm:text-sm">
          Atualizado em{" "}
          <span className="font-medium text-foreground">
            {formatUpdatedAt(resolvedAt)}
          </span>
        </span>
      </div>
      {resolutionReason ? (
        <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
          {resolutionReason}
        </p>
      ) : null}
      {jiraCloudNewerThanSnapshot && jiraCloudSyncAt ? (
        <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200 text-pretty">
          Há sync Jira Cloud mais recente (
          {formatUpdatedAt(jiraCloudSyncAt)}
          ). Se o snapshot ativo for Manual, rode sync/materialização em{" "}
          <span className="font-medium">/app/jira</span> para gerar um lote
          Compilado Jira mais novo.
        </p>
      ) : null}
    </div>
  );
}
