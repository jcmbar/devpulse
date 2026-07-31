type StatusGroupRow = {
  group: string;
  openCount: number;
  totalCount: number;
};

type StatusGroupBarsProps = {
  rows: StatusGroupRow[];
};

export function StatusGroupBars({ rows }: StatusGroupBarsProps) {
  const maxOpen = Math.max(1, ...rows.map((row) => row.openCount));

  return (
    <section className="ui-card space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="ui-form-section-title">Distribuição por grupo</h2>
        <p className="ui-hint m-0">
          WIP atual (snapshot) — não é CFD histórico
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem dados de métricas.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const width = Math.round((row.openCount / maxOpen) * 100);
            return (
              <li key={row.group} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{row.group}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {row.openCount} abertas · {row.totalCount} total
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full rounded bg-brand"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
