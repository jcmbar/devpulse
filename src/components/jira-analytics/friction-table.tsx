import Link from "next/link";
import { DataTable } from "@/components/surface";

export type FrictionRow = {
  issue_id: string;
  jira_key: string | null;
  current_status: string | null;
  current_status_group: string | null;
  reopen_count: number;
  develop_reentry_count: number;
  assignee_change_count: number;
  is_open: boolean;
};

type FrictionTableProps = {
  rows: FrictionRow[];
  auditHref: (issueId: string) => string;
};

export function FrictionTable({ rows, auditHref }: FrictionTableProps) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="ui-form-section-title">Reopens / retrabalho</h2>
        <p className="ui-hint m-0">
          Resolvidas no período + abertas com friction · retrabalho = reentrada
          Develop (~proxy)
        </p>
      </div>
      <DataTable minWidthClassName="min-w-[760px]">
        <thead>
          <tr>
            <th>Key</th>
            <th>Estado</th>
            <th>Grupo</th>
            <th>Reopen</th>
            <th>Retrabalho</th>
            <th>Assignee Δ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-muted-foreground">
                Sem reopen/retrabalho no filtro.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.issue_id}>
                <td className="font-medium">
                  {row.jira_key ?? row.issue_id.slice(0, 8)}
                </td>
                <td className="text-muted-foreground">
                  {row.is_open ? "aberta" : "resolvida"} ·{" "}
                  {row.current_status ?? "—"}
                </td>
                <td className="text-muted-foreground">
                  {row.current_status_group ?? "—"}
                </td>
                <td className="tabular-nums">{row.reopen_count}</td>
                <td className="tabular-nums">{row.develop_reentry_count}</td>
                <td className="tabular-nums">{row.assignee_change_count}</td>
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
