"use client";

import { MonthlyTrendChart } from "@/components/dashboard/monthly-trend-chart";
import { MonthlyClosingAttachmentsPanel } from "@/components/monthly-closing/monthly-closing-attachments";
import {
  MonthlyClosingAuditSection,
  MonthlyClosingControls,
  MonthlyClosingStatusBadge,
} from "@/components/monthly-closing/monthly-closing-panel";
import { KpiMetricCard } from "@/components/ui/kpi-metric-card";
import { SectionShell } from "@/components/ui/section-shell";
import { persistFiltersFromHref } from "@/lib/filters/persist-client";
import { formatYearMonthLabel } from "@/lib/metrics/date-range";
import { formatDeliveryIndex } from "@/lib/metrics/developer-period";
import { metricsToTrendPoint } from "@/lib/metrics/monthly-trend";
import { cn } from "@/lib/utils";
import type { DeveloperPeriodMetrics } from "@/types/developer-period-metrics";
import type {
  MonthlyClosing,
  MonthlyClosingAttachment,
  MonthlyClosingCardAuditRow,
  MonthlyClosingStatus,
} from "@/types/monthly-closing";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

function formatHours(value: number): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} h`;
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

function rowStatus(row: DeveloperClosingYearMonthRow): MonthlyClosingStatus {
  return row.closing?.status ?? "open";
}

function actionLabel(
  isOpen: boolean,
  status: MonthlyClosingStatus,
  startedAt: string | null | undefined,
): string {
  if (isOpen) {
    return "Ocultar";
  }
  if (status === "open" && !startedAt) {
    return "Abrir / iniciar";
  }
  if (status === "open") {
    return "Continuar";
  }
  if (status === "rejected") {
    return "Ajustar";
  }
  if (status === "closed") {
    return "Anexos";
  }
  return "Detalhe";
}

function summarizeYear(rows: DeveloperClosingYearMonthRow[]) {
  let open = 0;
  let inReview = 0;
  let rejected = 0;
  let closed = 0;
  let finalized = 0;
  let totalCards = 0;
  let totalTimeSpentHours = 0;
  let utilSum = 0;
  let utilCount = 0;

  for (const row of rows) {
    const status = rowStatus(row);
    if (status === "open") {
      open += 1;
    } else if (status === "in_review") {
      inReview += 1;
    } else if (status === "rejected") {
      rejected += 1;
    } else if (status === "closed") {
      closed += 1;
    } else if (status === "finalized") {
      finalized += 1;
    }

    totalCards += row.metrics.totalCards;
    totalTimeSpentHours += row.metrics.totalTimeSpentHours;
    if (row.metrics.totalCards > 0) {
      utilSum += row.metrics.utilizationRate;
      utilCount += 1;
    }
  }

  return {
    open,
    inReview,
    rejected,
    closed,
    finalized,
    totalCards,
    totalTimeSpentHours,
    avgUtilization:
      utilCount > 0 ? utilSum / utilCount : null,
  };
}

function MonthActionLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("ui-btn-ghost", className)}
      onClick={() => persistFiltersFromHref("developer-home", href)}
    >
      {label}
    </Link>
  );
}

function MonthDetailPanel({
  detailRow,
  importId,
  sourceMode,
  detailClosing,
  detailAuditRows,
  detailCanSubmit,
  detailBlockingCount,
  detailAttachments,
  empty,
}: {
  detailRow: DeveloperClosingYearMonthRow | null;
  importId: string | null;
  sourceMode: string | null;
  detailClosing: MonthlyClosing | null;
  detailAuditRows: MonthlyClosingCardAuditRow[];
  detailCanSubmit: boolean;
  detailBlockingCount: number;
  detailAttachments: MonthlyClosingAttachment[];
  empty?: boolean;
}) {
  if (empty || detailRow == null) {
    return (
      <div className="ui-dashboard-panel flex min-h-[12rem] flex-col items-center justify-center text-center">
        <p className="text-sm font-medium text-foreground">
          Selecione um mês
        </p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          Abra um mês na lista para ver ações, auditoria e documentos do
          fechamento.
        </p>
      </div>
    );
  }

  return (
    <div className="ui-dashboard-panel space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold tracking-tight">
            {formatYearMonthLabel(detailRow.yearMonth)}
          </h3>
          <p className="text-xs text-muted-foreground">
            {detailRow.metrics.totalCards} card(s) · mesma base da aba Cards por
            período
          </p>
          <p className="mt-1 text-sm font-medium tabular-nums text-foreground">
            Total de horas realizadas:{" "}
            {formatHours(detailRow.metrics.totalTimeSpentHours)}
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
  );
}

function MonthListItem({
  row,
  selectedYear,
  importId,
  detailMonth,
}: {
  row: DeveloperClosingYearMonthRow;
  selectedYear: number;
  importId: string | null;
  detailMonth: string | null;
}) {
  const isOpen = detailMonth === row.yearMonth;
  const status = rowStatus(row);
  const href = buildFechamentosHref({
    importId,
    closingYear: selectedYear,
    detailMonth: isOpen ? null : row.yearMonth,
  });

  return (
    <div
      className={cn(
        "rounded-[var(--radius-sm)] border border-border/80 bg-card px-3 py-2.5 transition-colors",
        isOpen && "border-brand/50 bg-brand-soft/30 ring-1 ring-brand/20",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground">
            {formatYearMonthLabel(row.yearMonth)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {row.metrics.totalCards} cards
            {" · "}
            Atraso {row.metrics.delayedCardsNet}
            {" · "}
            Aprov. {formatPercent(row.metrics.utilizationRate)}
            {" · "}
            Índ. {formatDeliveryIndex(row.metrics.deliveryIndex)}
          </p>
          <p className="mt-1 text-xs font-medium tabular-nums text-foreground">
            Total de horas realizadas:{" "}
            {formatHours(row.metrics.totalTimeSpentHours)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <MonthlyClosingStatusBadge
            status={status}
            className="px-1.5 py-0.5 text-[10px]"
          />
          <MonthActionLink
            href={href}
            label={actionLabel(isOpen, status, row.closing?.started_at)}
          />
        </div>
      </div>
    </div>
  );
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

  const summary = summarizeYear(rows);
  const trendPoints = rows.map((row) =>
    metricsToTrendPoint(row.yearMonth, row.metrics),
  );

  const detailProps = {
    detailRow,
    importId,
    sourceMode,
    detailClosing,
    detailAuditRows,
    detailCanSubmit,
    detailBlockingCount,
    detailAttachments,
  };

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

        <div className="ui-kpi-grid--hero">
          <KpiMetricCard
            variant="hero"
            label="Cards no ano"
            value={String(summary.totalCards)}
            tone="info"
            hint="Soma dos meses com Entrega TU"
          />
          <KpiMetricCard
            variant="hero"
            label="Horas realizadas"
            value={formatHours(summary.totalTimeSpentHours)}
            tone="brand"
            hint="Soma do time spent no ano"
          />
          <KpiMetricCard
            variant="hero"
            label="Finalizados"
            value={String(summary.finalized)}
            tone="success"
          />
          <KpiMetricCard
            variant="hero"
            label="Em andamento"
            value={String(summary.inReview + summary.closed)}
            tone="warning"
            hint={
              summary.inReview + summary.closed > 0
                ? `${summary.inReview} em revisão · ${summary.closed} fechado(s)`
                : "Revisão ou fechado (anexos)"
            }
          />
          <KpiMetricCard
            variant="hero"
            label="Ajuste necessário"
            value={String(summary.rejected)}
            tone={summary.rejected > 0 ? "danger" : "neutral"}
          />
          <KpiMetricCard
            variant="hero"
            label="Abertos"
            value={String(summary.open)}
            tone="info"
            hint="Ainda sem envio ao gestor"
          />
          <KpiMetricCard
            variant="hero"
            label="Aproveitamento médio"
            value={
              summary.avgUtilization == null
                ? "—"
                : formatPercent(summary.avgUtilization)
            }
            tone="brand"
            hint="Média dos meses com entrega"
          />
        </div>
      </SectionShell>

      <MonthlyTrendChart
        title={`Acompanhamento ${selectedYear}`}
        description="Evolução mensal com as mesmas métricas da lista de fechamentos."
        points={trendPoints}
      />

      {/* Desktop: lista + detalhe sticky */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start">
        <SectionShell
          title="Meses do ano"
          description="Selecione um mês para ações, auditoria e documentos."
        >
          <div className="space-y-2">
            {rows.map((row) => (
              <MonthListItem
                key={row.yearMonth}
                row={row}
                selectedYear={selectedYear}
                importId={importId}
                detailMonth={detailMonth}
              />
            ))}
          </div>
        </SectionShell>

        <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <MonthDetailPanel {...detailProps} empty={detailRow == null} />
        </div>
      </div>

      {/* Mobile: cards empilhados + detalhe inline */}
      <div className="space-y-3 lg:hidden">
        <SectionShell
          title="Meses do ano"
          description="Toque em um mês para abrir o fechamento."
        >
          <div className="space-y-3">
            {rows.map((row) => {
              const isOpen = detailMonth === row.yearMonth;
              return (
                <div key={row.yearMonth} className="space-y-3">
                  <MonthListItem
                    row={row}
                    selectedYear={selectedYear}
                    importId={importId}
                    detailMonth={detailMonth}
                  />
                  {isOpen ? <MonthDetailPanel {...detailProps} /> : null}
                </div>
              );
            })}
          </div>
        </SectionShell>
      </div>
    </div>
  );
}
