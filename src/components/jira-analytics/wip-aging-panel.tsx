import { formatDurationMs } from "@/services/analytics/jira/format";

type WipAgingPanelProps = {
  openCount: number;
  avgAgingMs: number | null;
  p50AgingMs: number | null;
  p90AgingMs: number | null;
  maxAgingMs: number | null;
  statusGroups: Array<{ group: string; openCount: number }>;
};

/**
 * Simple WIP aging view — current snapshot only (not historical CFD).
 */
export function WipAgingPanel({
  openCount,
  avgAgingMs,
  p50AgingMs,
  p90AgingMs,
  maxAgingMs,
  statusGroups,
}: WipAgingPanelProps) {
  const openGroups = statusGroups.filter(
    (row) => row.group !== "done" && row.openCount > 0,
  );

  return (
    <section className="ui-card space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="ui-form-section-title">WIP aging</h2>
        <p className="ui-hint m-0">Visão inicial · snapshot atual</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">WIP</p>
          <p className="ui-kpi text-xl">{openCount}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Avg</p>
          <p className="ui-kpi text-xl">{formatDurationMs(avgAgingMs)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">p50 / p90</p>
          <p className="ui-kpi text-xl">
            {formatDurationMs(p50AgingMs)} · {formatDurationMs(p90AgingMs)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Max</p>
          <p className="ui-kpi text-xl">{formatDurationMs(maxAgingMs)}</p>
        </div>
      </div>
      {openGroups.length > 0 ? (
        <div className="flex flex-wrap gap-2 text-sm">
          {openGroups.map((row) => (
            <span
              key={row.group}
              className="rounded border border-border px-2 py-1 text-muted-foreground"
            >
              <span className="font-medium text-foreground">{row.group}</span>{" "}
              {row.openCount}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
