import { formatDurationMs } from "@/services/analytics/jira/format";

export type DashboardKpiValues = {
  throughput: number;
  leadP50Ms: number | null;
  leadP90Ms: number | null;
  agingAvgMs: number | null;
  agingP50Ms: number | null;
  agingP90Ms: number | null;
  reopenCount: number;
  reworkCount: number;
  assigneeChangeCount: number;
  openCount: number;
  completedCount: number;
};

type KpiCardsProps = {
  values: DashboardKpiValues;
};

type KpiItem = {
  label: string;
  value: string;
  hint?: string;
  /** operational = contagem/duração objetiva; semantic = proxy de qualidade */
  kind: "operational" | "semantic";
};

function buildItems(values: DashboardKpiValues): KpiItem[] {
  return [
    {
      label: "Throughput",
      value: String(values.throughput),
      hint: "concluídas no período",
      kind: "operational",
    },
    {
      label: "Lead time p50",
      value: formatDurationMs(values.leadP50Ms),
      kind: "operational",
    },
    {
      label: "Lead time p90",
      value: formatDurationMs(values.leadP90Ms),
      kind: "operational",
    },
    {
      label: "Aging avg",
      value: formatDurationMs(values.agingAvgMs),
      hint: "abertas agora",
      kind: "operational",
    },
    {
      label: "Aging p50 / p90",
      value: `${formatDurationMs(values.agingP50Ms)} · ${formatDurationMs(values.agingP90Ms)}`,
      kind: "operational",
    },
    {
      label: "Reopens",
      value: String(values.reopenCount),
      hint: "soma no período",
      kind: "operational",
    },
    {
      label: "Retrabalho",
      value: String(values.reworkCount),
      hint: "reentrada em Develop",
      kind: "semantic",
    },
    {
      label: "Trocas de assignee",
      value: String(values.assigneeChangeCount),
      kind: "operational",
    },
    {
      label: "Abertas",
      value: String(values.openCount),
      kind: "operational",
    },
    {
      label: "Concluídas",
      value: String(values.completedCount),
      hint: "no período",
      kind: "operational",
    },
  ];
}

export function KpiCards({ values }: KpiCardsProps) {
  const items = buildItems(values);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="ui-form-section-title">KPIs</h2>
        <p className="ui-hint m-0">
          <span className="text-foreground/80">operacional</span> = contagem /
          duração · <span className="text-foreground/80">semântico</span> =
          proxy (retrabalho ≠ tag Compilado)
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item) => (
          <div key={item.label} className="ui-panel space-y-1">
            <p className="text-xs text-muted-foreground">
              {item.label}
              {item.kind === "semantic" ? (
                <span className="ml-1 text-[10px] uppercase tracking-wide opacity-70">
                  ~proxy
                </span>
              ) : null}
            </p>
            <p className="ui-kpi text-xl leading-tight">{item.value}</p>
            {item.hint ? (
              <p className="text-[11px] text-muted-foreground">{item.hint}</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
