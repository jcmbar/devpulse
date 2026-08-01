import Link from "next/link";
import { MonthlyClosingStatusBadge } from "@/components/monthly-closing/monthly-closing-panel";
import { DataTable } from "@/components/surface";
import { SectionShell } from "@/components/ui/section-shell";
import type { MonthlyClosing, MonthlyClosingStatus } from "@/types/monthly-closing";

export type GestorClosingMatrixDeveloper = {
  id: string;
  fullName: string;
  isActive: boolean;
};

type Cell = {
  closingId: string | null;
  status: MonthlyClosingStatus | null;
};

type GestorClosingsYearMatrixProps = {
  year: number;
  developers: GestorClosingMatrixDeveloper[];
  closings: MonthlyClosing[];
};

function monthKeys(year: number): string[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    return `${year}-${month}`;
  });
}

function shortMonthLabel(yearMonth: string): string {
  const [year, monthPart] = yearMonth.split("-");
  const date = new Date(Number(year), Number(monthPart) - 1, 1);
  if (Number.isNaN(date.getTime())) {
    return yearMonth;
  }
  return new Intl.DateTimeFormat("pt-BR", { month: "short" })
    .format(date)
    .replace(".", "")
    .replace(/^\w/, (char) => char.toUpperCase());
}

function cellHref(cell: Cell): string | null {
  if (cell.closingId == null) {
    return null;
  }
  if (
    cell.status === "in_review" ||
    cell.status === "closed" ||
    cell.status === "finalized" ||
    cell.status === "rejected"
  ) {
    return `/app/gestor/fechamentos/${cell.closingId}`;
  }
  return null;
}

export function GestorClosingsYearMatrix({
  year,
  developers,
  closings,
}: GestorClosingsYearMatrixProps) {
  const months = monthKeys(year);
  const byDeveloperMonth = new Map<string, Cell>();

  for (const closing of closings) {
    byDeveloperMonth.set(`${closing.developer_id}:${closing.year_month}`, {
      closingId: closing.id,
      status: closing.status,
    });
  }

  return (
    <SectionShell
      title="Status por developer"
      description={
        <>
          Matriz do ano{" "}
          <span className="font-medium text-foreground">{year}</span>
          {" · "}
          cada célula mostra o status do fechamento mensal.
        </>
      }
    >
      {developers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum developer para exibir neste filtro de time.
        </p>
      ) : (
        <DataTable minWidthClassName="min-w-[980px]" stickyFirstColumn>
          <thead>
            <tr>
              <th>Developer</th>
              {months.map((month) => (
                <th key={month} className="whitespace-nowrap text-center">
                  {shortMonthLabel(month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {developers.map((developer) => (
              <tr key={developer.id}>
                <td className="font-medium whitespace-nowrap">
                  <Link
                    href={`/app/developers/${developer.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {developer.fullName}
                  </Link>
                  {!developer.isActive ? (
                    <span className="text-muted-foreground"> · inativo</span>
                  ) : null}
                </td>
                {months.map((month) => {
                  const cell = byDeveloperMonth.get(
                    `${developer.id}:${month}`,
                  ) ?? { closingId: null, status: null };
                  const href = cellHref(cell);
                  return (
                    <td key={month} className="text-center align-middle">
                      {cell.status == null ? (
                        <span
                          className="text-xs text-muted-foreground"
                          title="Sem fechamento iniciado"
                        >
                          —
                        </span>
                      ) : href ? (
                        <Link
                          href={href}
                          className="inline-flex"
                          title="Abrir fechamento"
                        >
                          <MonthlyClosingStatusBadge
                            status={cell.status}
                            className="px-1.5 py-0.5 text-[10px]"
                          />
                        </Link>
                      ) : (
                        <MonthlyClosingStatusBadge
                          status={cell.status}
                          className="px-1.5 py-0.5 text-[10px]"
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </SectionShell>
  );
}
