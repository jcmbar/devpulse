import { CfdChart } from "@/components/jira-analytics/cfd-chart";
import { HistoryCoverageBadge } from "@/components/jira-analytics/history-coverage-badge";
import { HistoryEmptyState } from "@/components/jira-analytics/history-empty-state";
import type { FlowDashboardHistory } from "@/services/analytics/jira";

type FlowHistorySectionProps = {
  history: FlowDashboardHistory;
};

/**
 * CFD / WIP history block driven only by read-model `history`.
 * Empty / approximate / exact states are explicit — never fabricates series.
 */
export function FlowHistorySection({ history }: FlowHistorySectionProps) {
  const hasSeries =
    history.source === "daily_facts" && history.wipByDay.length > 0;

  if (!hasSeries) {
    return (
      <HistoryEmptyState
        reason={
          history.source === "daily_facts"
            ? "Há cobertura registrada, mas nenhum ponto de WIP no período filtrado."
            : undefined
        }
      />
    );
  }

  const latest = history.wipByDay[history.wipByDay.length - 1];
  const earliest = history.wipByDay[0];

  return (
    <section className="ui-card space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="ui-form-section-title">CFD / WIP histórico</h2>
          <p className="ui-hint m-0">
            Série diária UTC · {earliest.day} → {latest.day} ·{" "}
            {history.wipByDay.length} dias no filtro
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 sm:min-w-[12rem]">
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground">WIP (último dia)</p>
            <p className="ui-kpi text-xl tabular-nums">{latest.totalOpen}</p>
          </div>
          <HistoryCoverageBadge
            confidence={history.confidence}
            source={history.source}
            coverageFrom={history.coverageFrom}
            coverageTo={history.coverageTo}
          />
        </div>
      </div>

      <CfdChart days={history.wipByDay} />
    </section>
  );
}
