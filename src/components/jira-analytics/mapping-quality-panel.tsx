import { DataTable } from "@/components/surface";
import { formatDurationMs } from "@/services/analytics/jira/format";

export type MappingQualityRow = {
  status: string;
  matchedBy: string;
  group: string;
  issueCount: number;
  dwellMs: number;
};

type MappingQualityPanelProps = {
  strict: boolean;
  summary: {
    distinctStatuses: number;
    exactCount: number;
    fuzzyCount: number;
    unmappedCount: number;
  };
  recommendations: string[];
  attentionRows: MappingQualityRow[];
};

export function MappingQualityPanel({
  strict,
  summary,
  recommendations,
  attentionRows,
}: MappingQualityPanelProps) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="ui-form-section-title">
          Qualidade do mapeamento{" "}
          <span className="text-sm font-normal text-muted-foreground">
            {strict ? "(strict)" : "(fuzzy permitido)"}
          </span>
        </h2>
        <p className="ui-hint m-0">
          Confiança dos grupos de status — aliases em settings.status_groups
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="ui-panel">
          <p className="text-xs text-muted-foreground">Distinct</p>
          <p className="ui-kpi text-xl">{summary.distinctStatuses}</p>
        </div>
        <div className="ui-panel">
          <p className="text-xs text-muted-foreground">Exact</p>
          <p className="ui-kpi text-xl">{summary.exactCount}</p>
        </div>
        <div className="ui-panel">
          <p className="text-xs text-muted-foreground">Fuzzy</p>
          <p
            className={`ui-kpi text-xl ${summary.fuzzyCount > 0 ? "text-amber-700 dark:text-amber-400" : ""}`}
          >
            {summary.fuzzyCount}
          </p>
        </div>
        <div className="ui-panel">
          <p className="text-xs text-muted-foreground">Unmapped</p>
          <p
            className={`ui-kpi text-xl ${summary.unmappedCount > 0 ? "text-danger" : ""}`}
          >
            {summary.unmappedCount}
          </p>
        </div>
      </div>
      {recommendations.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {recommendations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {attentionRows.length > 0 ? (
        <DataTable minWidthClassName="min-w-[640px]">
          <thead>
            <tr>
              <th>Status</th>
              <th>Match</th>
              <th>Grupo</th>
              <th>Issues*</th>
              <th>Dwell</th>
            </tr>
          </thead>
          <tbody>
            {attentionRows.map((row) => (
              <tr key={`${row.matchedBy}-${row.status}`}>
                <td className="font-medium">{row.status}</td>
                <td>
                  <span
                    className={
                      row.matchedBy === "unmapped"
                        ? "text-danger"
                        : "text-amber-700 dark:text-amber-400"
                    }
                  >
                    {row.matchedBy}
                  </span>
                </td>
                <td>{row.group}</td>
                <td className="tabular-nums">{row.issueCount}</td>
                <td className="tabular-nums">
                  {formatDurationMs(row.dwellMs)}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      ) : (
        <p className="text-sm text-muted-foreground">
          Todos os status observados casam por exact.
        </p>
      )}
      <p className="ui-hint">
        *Contagem aproximada por ocorrência em dwell/current.
      </p>
    </section>
  );
}
