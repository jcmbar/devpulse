import Link from "next/link";
import { MonthlyClosingStatusBadge } from "@/components/monthly-closing/monthly-closing-panel";
import { DataTable } from "@/components/surface";
import { SectionShell } from "@/components/ui/section-shell";
import { formatYearMonthLabel } from "@/lib/metrics/date-range";
import type { MonthlyClosing } from "@/types/monthly-closing";
import { AlertTriangle } from "lucide-react";

type ClosingReviewRow = MonthlyClosing & {
  developer_name: string;
  team_name: string | null;
  item_count: number;
};

export function GestorClosingsInReviewSection({
  closings,
  driftClosings = [],
}: {
  closings: ClosingReviewRow[];
  driftClosings?: ClosingReviewRow[];
}) {
  return (
    <div className="space-y-4">
      {driftClosings.length > 0 ? (
        <SectionShell
          title="Alertas pós-finalização"
          description="Mudanças no Jira detectadas após finalize — apenas ciência."
        >
          <ul className="space-y-2">
            {driftClosings.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-[var(--radius-sm)] border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300"
                    strokeWidth={2}
                  />
                  <div>
                    <p className="font-medium">
                      {row.developer_name} ·{" "}
                      {formatYearMonthLabel(row.year_month)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Houve alteração no Jira após a finalização deste
                      fechamento. Apenas para ciência.
                    </p>
                  </div>
                </div>
                <Link
                  href={`/app/gestor/fechamentos/${row.id}`}
                  className="text-sm font-medium text-brand underline-offset-4 hover:underline"
                >
                  Ver
                </Link>
              </li>
            ))}
          </ul>
        </SectionShell>
      ) : null}

      <SectionShell
        title="Fechamentos em andamento"
        description="Em revisão (aprovar) ou fechados (validar anexos e finalizar)."
      >
        {closings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum fechamento em andamento no momento.
          </p>
        ) : (
          <DataTable minWidthClassName="min-w-[720px]">
            <thead>
              <tr>
                <th>Developer</th>
                <th>Mês</th>
                <th className="hidden sm:table-cell">Time</th>
                <th>Cards</th>
                <th>Status</th>
                <th className="hidden md:table-cell">Atualizado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {closings.map((row) => (
                <tr key={row.id}>
                  <td className="font-medium">{row.developer_name}</td>
                  <td className="whitespace-nowrap">
                    {formatYearMonthLabel(row.year_month)}
                  </td>
                  <td className="hidden sm:table-cell">
                    {row.team_name ?? "—"}
                  </td>
                  <td>{row.item_count}</td>
                  <td>
                    <MonthlyClosingStatusBadge status={row.status} />
                  </td>
                  <td className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                    {row.submitted_at
                      ? new Date(row.submitted_at).toLocaleString("pt-BR")
                      : "—"}
                  </td>
                  <td className="text-right">
                    <Link
                      href={`/app/gestor/fechamentos/${row.id}`}
                      className="text-sm font-medium text-brand underline-offset-4 hover:underline"
                    >
                      {row.status === "in_review"
                        ? "Revisar / decidir"
                        : "Validar / finalizar"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </SectionShell>
    </div>
  );
}
