import Link from "next/link";
import { DataTable } from "@/components/surface";
import { MappingBadge } from "@/components/jira-analytics/mapping-badge";
import { formatDurationMs } from "@/services/analytics/jira/format";

export type OldestOpenRow = {
  issue_id: string;
  jira_key: string | null;
  current_status: string | null;
  current_status_group: string | null;
  aging_ms: number | null;
  mapping_warning?: "fuzzy" | "unmapped" | null;
};

type OldestOpenTableProps = {
  rows: OldestOpenRow[];
  auditHref: (issueId: string) => string;
};

export function OldestOpenTable({ rows, auditHref }: OldestOpenTableProps) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="ui-form-section-title">Abertas mais antigas</h2>
        <p className="ui-hint m-0">Ordenado por aging · snapshot atual</p>
      </div>
      <DataTable minWidthClassName="min-w-[720px]">
        <thead>
          <tr>
            <th>Key</th>
            <th>Status</th>
            <th>Grupo</th>
            <th>Aging</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-muted-foreground">
                Nenhuma issue aberta no filtro.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.issue_id}>
                <td className="font-medium">
                  {row.jira_key ?? row.issue_id.slice(0, 8)}
                  <MappingBadge warning={row.mapping_warning} />
                </td>
                <td>{row.current_status ?? "—"}</td>
                <td className="text-muted-foreground">
                  {row.current_status_group ?? "—"}
                </td>
                <td className="tabular-nums">
                  {formatDurationMs(row.aging_ms)}
                </td>
                <td>
                  <Link href={auditHref(row.issue_id)} className="ui-btn-ghost">
                    Auditar
                  </Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
    </section>
  );
}
