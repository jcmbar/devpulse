import Link from "next/link";
import { MonthlyClosingStatusBadge } from "@/components/monthly-closing/monthly-closing-panel";
import { DataTable } from "@/components/surface";
import { SectionShell } from "@/components/ui/section-shell";
import { formatYearMonthLabel } from "@/lib/metrics/date-range";
import type { MonthlyClosing } from "@/types/monthly-closing";

type ClosingReviewRow = MonthlyClosing & {
  developer_name: string;
  team_name: string | null;
  item_count: number;
};

export function GestorClosingsInReviewSection({
  closings,
}: {
  closings: ClosingReviewRow[];
}) {
  return (
    <SectionShell
      title="Fechamentos em revisão"
      description="Snapshots enviados pelos developers aguardando análise do gestor (Fase 1)."
    >
      {closings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum fechamento em revisão no momento.
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
              <th className="hidden md:table-cell">Enviado em</th>
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
                    Abrir snapshot
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </SectionShell>
  );
}
