import Link from "next/link";
import { MonthlyClosingStatusBadge } from "@/components/monthly-closing/monthly-closing-panel";
import { DataTable } from "@/components/surface";
import { SectionShell } from "@/components/ui/section-shell";
import { cn } from "@/lib/utils";
import type {
  MonthlyClosing,
  MonthlyClosingAttachmentPresence,
  MonthlyClosingStatus,
} from "@/types/monthly-closing";
import { Banknote, FileText } from "lucide-react";

export type GestorClosingMatrixDeveloper = {
  id: string;
  fullName: string;
  isActive: boolean;
};

type Cell = {
  closingId: string | null;
  status: MonthlyClosingStatus | null;
  hasInvoicePdf: boolean;
  hasBoletoPdf: boolean;
};

type GestorClosingsYearMatrixProps = {
  year: number;
  developers: GestorClosingMatrixDeveloper[];
  closings: MonthlyClosing[];
  attachmentPresence?: Map<string, MonthlyClosingAttachmentPresence>;
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

function showsDocumentIcons(status: MonthlyClosingStatus | null): boolean {
  return status === "closed" || status === "finalized";
}

function DocumentStatusIcons({
  hasInvoicePdf,
  hasBoletoPdf,
}: {
  hasInvoicePdf: boolean;
  hasBoletoPdf: boolean;
}) {
  return (
    <div className="mt-1 flex items-center justify-center gap-1">
      <span
        className={cn(
          "inline-flex size-5 items-center justify-center rounded-[calc(var(--radius-sm)-2px)] border",
          hasInvoicePdf
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            : "border-border bg-muted/40 text-muted-foreground",
        )}
        title={
          hasInvoicePdf ? "Nota fiscal enviada" : "Nota fiscal pendente"
        }
      >
        <FileText className="size-3" strokeWidth={2} aria-hidden />
        <span className="sr-only">
          {hasInvoicePdf ? "Nota fiscal enviada" : "Nota fiscal pendente"}
        </span>
      </span>
      <span
        className={cn(
          "inline-flex size-5 items-center justify-center rounded-[calc(var(--radius-sm)-2px)] border",
          hasBoletoPdf
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            : "border-border bg-muted/40 text-muted-foreground",
        )}
        title={hasBoletoPdf ? "Boleto enviado" : "Boleto pendente"}
      >
        <Banknote className="size-3" strokeWidth={2} aria-hidden />
        <span className="sr-only">
          {hasBoletoPdf ? "Boleto enviado" : "Boleto pendente"}
        </span>
      </span>
    </div>
  );
}

export function GestorClosingsYearMatrix({
  year,
  developers,
  closings,
  attachmentPresence,
}: GestorClosingsYearMatrixProps) {
  const months = monthKeys(year);
  const byDeveloperMonth = new Map<string, Cell>();

  for (const closing of closings) {
    const presence = attachmentPresence?.get(closing.id);
    byDeveloperMonth.set(`${closing.developer_id}:${closing.year_month}`, {
      closingId: closing.id,
      status: closing.status,
      hasInvoicePdf: presence?.hasInvoicePdf ?? false,
      hasBoletoPdf: presence?.hasBoletoPdf ?? false,
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
          apenas pessoas conferidas na Folha neste ano. Em fechado/finalizado,
          ícones de NF e boleto (verde = enviado).
        </>
      }
    >
      {developers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma pessoa conferida na Folha neste ano para o filtro atual.
          Marque como conferido em Folha para aparecer aqui.
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
                  ) ?? {
                    closingId: null,
                    status: null,
                    hasInvoicePdf: false,
                    hasBoletoPdf: false,
                  };
                  const href = cellHref(cell);
                  const docs = showsDocumentIcons(cell.status) ? (
                    <DocumentStatusIcons
                      hasInvoicePdf={cell.hasInvoicePdf}
                      hasBoletoPdf={cell.hasBoletoPdf}
                    />
                  ) : null;

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
                          className="inline-flex flex-col items-center"
                          title="Abrir fechamento"
                        >
                          <MonthlyClosingStatusBadge
                            status={cell.status}
                            className="px-1.5 py-0.5 text-[10px]"
                          />
                          {docs}
                        </Link>
                      ) : (
                        <div className="inline-flex flex-col items-center">
                          <MonthlyClosingStatusBadge
                            status={cell.status}
                            className="px-1.5 py-0.5 text-[10px]"
                          />
                          {docs}
                        </div>
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
