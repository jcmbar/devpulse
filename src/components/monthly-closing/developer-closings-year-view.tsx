"use client";

import { MonthlyClosingAttachmentsPanel } from "@/components/monthly-closing/monthly-closing-attachments";
import {
  MonthlyClosingAuditSection,
  MonthlyClosingControls,
  MonthlyClosingStatusBadge,
} from "@/components/monthly-closing/monthly-closing-panel";
import { DataTable } from "@/components/surface";
import { SectionShell } from "@/components/ui/section-shell";
import { formatYearMonthLabel } from "@/lib/metrics/date-range";
import { formatDeliveryIndex } from "@/lib/metrics/developer-period";
import type { DeveloperPeriodMetrics } from "@/types/developer-period-metrics";
import type {
  MonthlyClosing,
  MonthlyClosingAttachment,
  MonthlyClosingCardAuditRow,
} from "@/types/monthly-closing";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { persistFiltersFromHref } from "@/lib/filters/persist-client";

export type DeveloperClosingYearMonthRow = {
  yearMonth: string;
  metrics: DeveloperPeriodMetrics;
  closing: MonthlyClosing | null;
};

type DeveloperClosingsYearViewProps = {
  years: number[];
  selectedYear: number;
  importId: string | null;
  sourceMode: string | null;
  rows: DeveloperClosingYearMonthRow[];
  detailMonth: string | null;
  detailClosing: MonthlyClosing | null;
  detailAuditRows: MonthlyClosingCardAuditRow[];
  detailCanSubmit: boolean;
  detailBlockingCount: number;
  detailAttachments: MonthlyClosingAttachment[];
};

function formatPercent(value: number | null): string {
  if (value == null) {
    return "—";
  }
  return `${(value * 100).toLocaleString("pt-BR", {
    maximumFractionDigits: 0,
  })}%`;
}

function buildFechamentosHref(input: {
  importId: string | null;
  closingYear: number;
  detailMonth?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("tab", "fechamentos");
  if (input.importId) {
    params.set("importId", input.importId);
  }
  params.set("closingYear", String(input.closingYear));
  if (input.detailMonth) {
    params.set("detailMonth", input.detailMonth);
  }
  return `/app?${params.toString()}`;
}

export function DeveloperClosingsYearView({
  years,
  selectedYear,
  importId,
  sourceMode,
  rows,
  detailMonth,
  detailClosing,
  detailAuditRows,
  detailCanSubmit,
  detailBlockingCount,
  detailAttachments,
}: DeveloperClosingsYearViewProps) {
  const router = useRouter();
  const detailRow =
    detailMonth != null
      ? (rows.find((row) => row.yearMonth === detailMonth) ?? null)
      : null;

  return (
    <div className="space-y-4">
      <SectionShell
        title="Fechamentos do ano"
        description="Resumo mensal (mesma lógica dos cards por período) e status do fechamento administrativo."
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Ano
          </label>
          <select
            className="ui-select max-w-[8rem] py-1.5"
            value={String(selectedYear)}
            onChange={(event) => {
              const href = buildFechamentosHref({
                importId,
                closingYear: Number(event.target.value),
              });
              persistFiltersFromHref("developer-home", href);
              router.push(href);
            }}
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <DataTable minWidthClassName="min-w-[760px]">
          <thead>
            <tr>
              <th>Mês</th>
              <th>Cards</th>
              <th className="hidden sm:table-cell">Atraso líq.</th>
              <th className="hidden md:table-cell">Retrabalho</th>
              <th className="hidden lg:table-cell">Aprov.</th>
              <th className="hidden lg:table-cell">Índice</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isOpen = detailMonth === row.yearMonth;
              const status = row.closing?.status ?? "open";
              return (
                <tr
                  key={row.yearMonth}
                  className={isOpen ? "bg-muted/30" : undefined}
                >
                  <td className="whitespace-nowrap font-medium">
                    {formatYearMonthLabel(row.yearMonth)}
                  </td>
                  <td>{row.metrics.totalCards}</td>
                  <td className="hidden sm:table-cell">
                    {row.metrics.delayedCardsNet}
                  </td>
                  <td className="hidden md:table-cell">
                    {row.metrics.reworkWeightTotal > 0
                      ? row.metrics.reworkWeightTotal
                      : row.metrics.reworkCards}
                  </td>
                  <td className="hidden lg:table-cell">
                    {formatPercent(row.metrics.utilizationRate)}
                  </td>
                  <td className="hidden lg:table-cell">
                    {formatDeliveryIndex(row.metrics.deliveryIndex)}
                  </td>
                  <td>
                    <MonthlyClosingStatusBadge status={status} />
                  </td>
                  <td className="text-right">
                    <div className="ui-inline-actions justify-end">
                      <Link
                        href={buildFechamentosHref({
                          importId,
                          closingYear: selectedYear,
                          detailMonth: isOpen ? null : row.yearMonth,
                        })}
                        className="ui-btn-ghost"
                      >
                        {isOpen
                          ? "Ocultar"
                          : status === "open" && !row.closing?.started_at
                            ? "Abrir / iniciar"
                            : status === "open"
                              ? "Continuar"
                              : status === "rejected"
                                ? "Ajustar"
                                : status === "closed"
                                  ? "Anexos"
                                  : "Detalhe"}
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </SectionShell>

      {detailRow ? (
        <div className="space-y-4 rounded-[var(--radius)] border border-border bg-[var(--surface)] p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-base font-semibold tracking-tight">
                {formatYearMonthLabel(detailRow.yearMonth)}
              </h3>
              <p className="text-xs text-muted-foreground">
                {detailRow.metrics.totalCards} card(s) · mesma base da aba Cards
                por período
              </p>
            </div>
            <MonthlyClosingControls
              yearMonth={detailRow.yearMonth}
              importId={importId}
              sourceMode={sourceMode}
              closing={detailClosing}
              canSubmit={detailCanSubmit}
              blockingCount={detailBlockingCount}
            />
          </div>

          <MonthlyClosingAuditSection
            closing={detailClosing}
            auditRows={detailAuditRows}
          />

          {detailClosing ? (
            <MonthlyClosingAttachmentsPanel
              closing={detailClosing}
              attachments={detailAttachments}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
