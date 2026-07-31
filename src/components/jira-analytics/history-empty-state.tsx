import Link from "next/link";

type HistoryEmptyStateProps = {
  /** Optional deeper reason shown under the title. */
  reason?: string;
};

/**
 * Honest empty state when daily facts were not materialized.
 * No fake CFD from current snapshot.
 */
export function HistoryEmptyState({ reason }: HistoryEmptyStateProps) {
  return (
    <section className="ui-card space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="ui-form-section-title">CFD / WIP histórico</h2>
        <p className="ui-hint m-0">Requer fatos diários materializados</p>
      </div>
      <div className="rounded-[var(--radius-sm)] border border-dashed border-border/80 bg-muted/30 px-4 py-6 sm:px-6">
        <p className="text-sm font-medium text-foreground">
          Sem cobertura histórica ainda
        </p>
        <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
          {reason ??
            "Não há fatos diários (`jira_flow_daily_facts`) para esta integração no período. O dashboard não inventa CFD a partir do snapshot atual."}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Em{" "}
          <Link href="/app/jira" className="font-medium text-foreground underline-offset-2 hover:underline">
            /app/jira
          </Link>
          , use <span className="font-medium text-foreground">Recalcular fatos diários (histórico)</span>{" "}
          e volte aqui.
        </p>
      </div>
    </section>
  );
}
