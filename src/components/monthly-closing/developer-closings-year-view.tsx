"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  listDeveloperYearClosingsAction,
  loadDeveloperClosingMonthDetailAction,
} from "@/app/app/monthly-closing-actions";
import { MonthlyTrendChart } from "@/components/dashboard/monthly-trend-chart";
import {
  MonthlyClosingAttachmentsPanel,
  MonthlyClosingValuesSummary,
} from "@/components/monthly-closing/monthly-closing-attachments";
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
import type { DeveloperCompensation } from "@/types/developer-compensation";
import type { DeveloperPeriodMetrics } from "@/types/developer-period-metrics";
import type { InvoiceIssuer } from "@/types/invoice-issuer";
import type {
  MonthlyClosing,
  MonthlyClosingAttachment,
  MonthlyClosingCardAuditRow,
  MonthlyClosingPresenceDay,
  MonthlyClosingStatus,
} from "@/types/monthly-closing";
import type { TimeBankEntry } from "@/types/time-bank";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

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
  developerCompensation: DeveloperCompensation | null;
  closingInvoiceIssuer?: InvoiceIssuer | null;
  closingHolidays?: ReadonlyArray<{ date: string; name: string }>;
  closingPresenceDays?: ReadonlyArray<MonthlyClosingPresenceDay>;
  mealPixBlockReason?: string | null;
  timeBankBalanceBeforeClosingMinutes?: number;
  recordedTimeBankEntry?: TimeBankEntry | null;
};

type DetailPanelProps = {
  detailRow: DeveloperClosingYearMonthRow | null;
  importId: string | null;
  sourceMode: string | null;
  detailClosing: MonthlyClosing | null;
  detailAuditRows: MonthlyClosingCardAuditRow[];
  detailCanSubmit: boolean;
  detailBlockingCount: number;
  detailAttachments: MonthlyClosingAttachment[];
  developerCompensation: DeveloperCompensation | null;
  closingInvoiceIssuer?: InvoiceIssuer | null;
  closingHolidays?: ReadonlyArray<{ date: string; name: string }>;
  closingPresenceDays?: ReadonlyArray<MonthlyClosingPresenceDay>;
  mealPixBlockReason?: string | null;
  timeBankBalanceBeforeClosingMinutes?: number;
  recordedTimeBankEntry?: TimeBankEntry | null;
  empty?: boolean;
  /** Compact header when rendered inside the desktop drawer. */
  embedded?: boolean;
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
    return "Fechar";
  }
  if (status === "open" && !startedAt) {
    return "Abrir";
  }
  if (status === "open") {
    return "Continuar";
  }
  if (status === "rejected") {
    return "Correção";
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
    avgUtilization: utilCount > 0 ? utilSum / utilCount : null,
  };
}

function MonthDetailContent({
  detailRow,
  importId,
  sourceMode,
  detailClosing,
  detailAuditRows,
  detailCanSubmit,
  detailBlockingCount,
  detailAttachments,
  developerCompensation,
  closingInvoiceIssuer = null,
  closingHolidays = [],
  closingPresenceDays = [],
  mealPixBlockReason = null,
  timeBankBalanceBeforeClosingMinutes = 0,
  recordedTimeBankEntry = null,
  empty,
  embedded = false,
  loading = false,
}: DetailPanelProps & { loading?: boolean }) {
  if (empty || detailRow == null) {
    return (
      <div
        className={cn(
          "flex min-h-[10rem] flex-col items-center justify-center text-center",
          !embedded && "ui-dashboard-panel",
        )}
      >
        <p className="text-sm font-medium text-foreground">
          Selecione um mês
        </p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Clique em Abrir no mês desejado para ver ações, auditoria e documentos
          do fechamento.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "space-y-4",
        !embedded && "ui-dashboard-panel ring-1 ring-brand/15",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {!embedded ? (
            <p className="text-[11px] font-semibold tracking-[0.08em] text-brand uppercase">
              Detalhe do mês
            </p>
          ) : null}
          <h3
            className={cn(
              "font-semibold tracking-tight",
              embedded ? "text-lg" : "mt-0.5 text-base",
            )}
          >
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
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {!loading ? (
            <MonthlyClosingControls
              yearMonth={detailRow.yearMonth}
              importId={importId}
              sourceMode={sourceMode}
              closing={detailClosing}
              canSubmit={detailCanSubmit}
              blockingCount={detailBlockingCount}
              compensation={developerCompensation}
              workedHours={detailRow.metrics.totalTimeSpentHours}
              holidays={closingHolidays}
              presenceDays={closingPresenceDays}
              mealPixBlockReason={mealPixBlockReason}
              timeBankBalanceBeforeClosingMinutes={
                timeBankBalanceBeforeClosingMinutes
              }
              recordedTimeBankEntry={recordedTimeBankEntry}
            />
          ) : (
            <>
              <MonthlyClosingStatusBadge status={rowStatus(detailRow)} />
              <p className="text-xs text-muted-foreground">Carregando ações…</p>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="rounded-[var(--radius-sm)] border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
          Carregando auditoria e documentos…
        </div>
      ) : (
        <>
          {detailClosing ? (
            <MonthlyClosingValuesSummary
              closing={detailClosing}
              timeBankBalanceBeforeClosingMinutes={
                timeBankBalanceBeforeClosingMinutes
              }
              recordedTimeBankEntry={recordedTimeBankEntry}
            />
          ) : null}

          <MonthlyClosingAuditSection
            closing={detailClosing}
            auditRows={detailAuditRows}
          />

          {detailClosing ? (
            <MonthlyClosingAttachmentsPanel
              closing={detailClosing}
              attachments={detailAttachments}
              invoiceIssuer={closingInvoiceIssuer}
              requireMealPixReceipt={
                developerCompensation?.require_meal_pix_receipt ?? false
              }
              timeBankBalanceBeforeClosingMinutes={
                timeBankBalanceBeforeClosingMinutes
              }
              recordedTimeBankEntry={recordedTimeBankEntry}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function MonthDetailDrawer({
  open,
  onClose,
  detailProps,
  loading,
  error,
}: {
  open: boolean;
  onClose: () => void;
  detailProps: DetailPanelProps;
  loading: boolean;
  error?: string | null;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    setVisible(false);
    const timeout = window.setTimeout(() => setMounted(false), 320);
    return () => window.clearTimeout(timeout);
  }, [open]);

  // Paint off-canvas (right), then slide into place (right → left).
  useEffect(() => {
    if (!mounted || !open) {
      return;
    }
    setVisible(false);
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setVisible(true);
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mounted, open]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    closeRef.current?.focus();
  }, [visible]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!mounted) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 hidden lg:block" role="presentation">
      <button
        type="button"
        aria-label="Fechar detalhe do mês"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/20 transition-opacity duration-300 ease-out",
          visible ? "opacity-100" : "opacity-0",
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute top-0 right-0 flex h-full w-full max-w-xl flex-col border-l border-border bg-[var(--surface-elevated)] shadow-[var(--shadow-md)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
        style={{
          transform: visible ? "translateX(0)" : "translateX(100%)",
        }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-brand uppercase">
              Fechamento do mês
            </p>
            <h2
              id={titleId}
              className="truncate text-lg font-semibold tracking-tight"
            >
              {detailProps.detailRow
                ? formatYearMonthLabel(detailProps.detailRow.yearMonth)
                : "Detalhe"}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Fechar painel"
          >
            <X className="size-4" strokeWidth={1.9} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {error ? (
            <p className="mb-3 text-sm text-danger">{error}</p>
          ) : null}
          <MonthDetailContent
            {...detailProps}
            embedded
            empty={false}
            loading={loading}
          />
        </div>
      </aside>
    </div>
  );
}

function MonthGridCard({
  row,
  isOpen,
  onToggle,
}: {
  row: DeveloperClosingYearMonthRow;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const status = rowStatus(row);
  const needsCorrection = status === "rejected" && !isOpen;
  const openLabel = actionLabel(isOpen, status, row.closing?.started_at);
  const bandStatus = needsCorrection ? "rejected" : status;

  return (
    <div
      aria-current={isOpen ? "true" : undefined}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-border/80 bg-card shadow-[var(--shadow-sm)] transition",
        isOpen && "border-brand/55 ring-1 ring-brand/30",
        needsCorrection && "ui-closing-attention bg-rose-500/5",
      )}
    >
      <div
        className={cn(
          "ui-closing-month-band",
          bandStatus === "open" && "ui-closing-month-band--open",
          bandStatus === "in_review" && "ui-closing-month-band--in_review",
          bandStatus === "rejected" && "ui-closing-month-band--rejected",
          bandStatus === "closed" && "ui-closing-month-band--closed",
          bandStatus === "finalized" && "ui-closing-month-band--finalized",
        )}
      >
        <p className="ui-kpi-hero__band-label">
          {shortMonthLabel(row.yearMonth)}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-[10px] text-muted-foreground">
            {formatYearMonthLabel(row.yearMonth)}
          </p>
          <MonthlyClosingStatusBadge
            status={status}
            className={cn(
              "shrink-0 px-1.5 py-0.5 text-[10px]",
              needsCorrection && "animate-pulse",
            )}
          />
        </div>

        <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px] tabular-nums">
          <div>
            <dt className="text-muted-foreground">Cards</dt>
            <dd className="font-semibold text-foreground">
              {row.metrics.totalCards}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Atraso</dt>
            <dd className="font-semibold text-foreground">
              {row.metrics.delayedCardsNet}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Aprov.</dt>
            <dd className="font-semibold text-foreground">
              {formatPercent(row.metrics.utilizationRate)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Índ.</dt>
            <dd className="font-semibold text-foreground">
              {formatDeliveryIndex(row.metrics.deliveryIndex)}
            </dd>
          </div>
        </dl>

        <div className="mt-auto flex items-end justify-between gap-2 border-t border-border/60 pt-2">
          <p className="min-w-0 text-[11px] font-medium tabular-nums text-foreground">
            {formatHours(row.metrics.totalTimeSpentHours)}
            <span className="ml-1 font-normal text-muted-foreground">
              realizadas
            </span>
          </p>
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              "shrink-0 px-2.5 py-1 text-[11px] font-semibold",
              isOpen
                ? "ui-btn-ghost"
                : needsCorrection
                  ? "ui-closing-attention-btn rounded-[var(--radius-sm)]"
                  : "ui-btn-primary",
            )}
          >
            {openLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function YearKpiGrid({ summary }: { summary: ReturnType<typeof summarizeYear> }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-2 xl:grid-cols-2">
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
        className="col-span-2"
      />
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
  developerCompensation,
  closingInvoiceIssuer = null,
  closingHolidays = [],
  closingPresenceDays = [],
  mealPixBlockReason = null,
  timeBankBalanceBeforeClosingMinutes = 0,
  recordedTimeBankEntry = null,
}: DeveloperClosingsYearViewProps) {
  const router = useRouter();
  const [, startDetailTransition] = useTransition();
  const [draftYear, setDraftYear] = useState(selectedYear);
  const [panelMonth, setPanelMonth] = useState<string | null>(detailMonth);
  const [loadedMonth, setLoadedMonth] = useState<string | null>(detailMonth);
  const [clientClosing, setClientClosing] = useState<MonthlyClosing | null>(
    detailClosing,
  );
  const [clientAuditRows, setClientAuditRows] =
    useState<MonthlyClosingCardAuditRow[]>(detailAuditRows);
  const [clientCanSubmit, setClientCanSubmit] = useState(detailCanSubmit);
  const [clientBlockingCount, setClientBlockingCount] =
    useState(detailBlockingCount);
  const [clientAttachments, setClientAttachments] =
    useState<MonthlyClosingAttachment[]>(detailAttachments);
  const [clientIssuer, setClientIssuer] = useState<InvoiceIssuer | null>(
    closingInvoiceIssuer,
  );
  const [clientHolidays, setClientHolidays] = useState(closingHolidays);
  const [clientPresenceDays, setClientPresenceDays] = useState(
    closingPresenceDays,
  );
  const [clientMealPixBlock, setClientMealPixBlock] = useState(
    mealPixBlockReason,
  );
  const [clientCompensation, setClientCompensation] = useState(
    developerCompensation,
  );
  const [clientTimeBankBalanceBefore, setClientTimeBankBalanceBefore] = useState(
    timeBankBalanceBeforeClosingMinutes,
  );
  const [clientRecordedTimeBankEntry, setClientRecordedTimeBankEntry] =
    useState<TimeBankEntry | null>(recordedTimeBankEntry);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Live closings by month — keeps grid badges/actions fresh without RSC remount. */
  const [closingOverrides, setClosingOverrides] = useState<
    Record<string, MonthlyClosing>
  >(() => {
    const seed: Record<string, MonthlyClosing> = {};
    for (const row of rows) {
      if (row.closing) {
        seed[row.yearMonth] = row.closing;
      }
    }
    return seed;
  });

  const mergeClosingOverrides = useCallback(
    (incoming: MonthlyClosing[]) => {
      setClosingOverrides((prev) => {
        const next = { ...prev };
        for (const closing of incoming) {
          const current = next[closing.year_month];
          if (!current || closing.updated_at >= current.updated_at) {
            next[closing.year_month] = closing;
          }
        }
        return next;
      });
    },
    [],
  );

  const displayRows = useMemo(
    () =>
      rows.map((row) => {
        const override = closingOverrides[row.yearMonth];
        if (!override) {
          return row;
        }
        return { ...row, closing: override };
      }),
    [rows, closingOverrides],
  );

  const activeRow =
    panelMonth != null
      ? (displayRows.find((row) => row.yearMonth === panelMonth) ?? null)
      : null;
  const detailSynced = panelMonth != null && panelMonth === loadedMonth;
  const loadingDetail = panelMonth != null && !detailSynced;

  const summary = summarizeYear(displayRows);
  const trendPoints = displayRows.map((row) =>
    metricsToTrendPoint(row.yearMonth, row.metrics),
  );

  const syncUrl = useCallback(
    (nextMonth: string | null) => {
      const href = buildFechamentosHref({
        importId,
        closingYear: selectedYear,
        detailMonth: nextMonth,
      });
      persistFiltersFromHref("developer-home", href);
      // Soft URL update — avoids RSC remount / black flash behind the drawer.
      window.history.pushState(null, "", href);
    },
    [importId, selectedYear],
  );

  const applyServerDetail = useCallback(
    (yearMonth: string) => {
      setLoadedMonth(yearMonth);
      setClientClosing(detailClosing);
      setClientAuditRows(detailAuditRows);
      setClientCanSubmit(detailCanSubmit);
      setClientBlockingCount(detailBlockingCount);
      setClientAttachments(detailAttachments);
      setClientIssuer(closingInvoiceIssuer);
      setClientHolidays(closingHolidays);
      setClientPresenceDays(closingPresenceDays);
      setClientMealPixBlock(mealPixBlockReason);
      setClientCompensation(developerCompensation);
      setClientTimeBankBalanceBefore(timeBankBalanceBeforeClosingMinutes);
      setClientRecordedTimeBankEntry(recordedTimeBankEntry);
      setLoadError(null);
    },
    [
      detailClosing,
      detailAuditRows,
      detailCanSubmit,
      detailBlockingCount,
      detailAttachments,
      closingInvoiceIssuer,
      closingHolidays,
      closingPresenceDays,
      mealPixBlockReason,
      developerCompensation,
      timeBankBalanceBeforeClosingMinutes,
      recordedTimeBankEntry,
    ],
  );

  // Hydrate from SSR only when the server-selected detail month changes (deep link).
  useEffect(() => {
    setDraftYear(selectedYear);
  }, [selectedYear]);

  useEffect(() => {
    if (detailMonth && detailMonth === panelMonth) {
      applyServerDetail(detailMonth);
      if (detailClosing) {
        mergeClosingOverrides([detailClosing]);
      }
    }
    // Intentionally not depending on applyServerDetail identity — avoids
    // overwriting a fresh client fetch when unrelated RSC props churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailMonth]);

  const panelMonthRef = useRef(panelMonth);
  const clientClosingRef = useRef(clientClosing);
  useEffect(() => {
    panelMonthRef.current = panelMonth;
    clientClosingRef.current = clientClosing;
  }, [panelMonth, clientClosing]);

  // Keep year-grid statuses in sync with DB (gestor reject/approve) without page flash.
  useEffect(() => {
    let cancelled = false;

    function refreshYearClosings() {
      void listDeveloperYearClosingsAction({ year: selectedYear }).then(
        (result) => {
          if (cancelled || !result.ok) {
            return;
          }
          mergeClosingOverrides(result.closings);
          const openClosing =
            panelMonthRef.current != null
              ? result.closings.find(
                  (row) => row.year_month === panelMonthRef.current,
                )
              : null;
          if (
            openClosing &&
            clientClosingRef.current?.status !== openClosing.status
          ) {
            setLoadedMonth(null);
          }
        },
      );
    }

    refreshYearClosings();

    function onFocus() {
      refreshYearClosings();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        refreshYearClosings();
      }
    }

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [selectedYear, mergeClosingOverrides]);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const next = params.get("detailMonth");
      const yearMonth =
        next && /^\d{4}-\d{2}$/.test(next) ? next : null;
      setPanelMonth(yearMonth);
      if (!yearMonth) {
        setLoadedMonth(null);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const fetchMonthDetail = useCallback((yearMonth: string) => {
    setLoadError(null);
    startDetailTransition(async () => {
      const result = await loadDeveloperClosingMonthDetailAction({
        yearMonth,
        importId,
      });
      if (panelMonthRef.current !== yearMonth) {
        return;
      }
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setLoadedMonth(yearMonth);
      setClientClosing(result.detail.closing);
      setClientAuditRows(result.detail.auditRows);
      setClientCanSubmit(result.detail.canSubmit);
      setClientBlockingCount(result.detail.blockingCount);
      setClientAttachments(result.detail.attachments);
      setClientIssuer(result.detail.invoiceIssuer);
      setClientHolidays(result.detail.holidays);
      setClientPresenceDays(result.detail.presenceDays);
      setClientMealPixBlock(result.detail.mealPixBlockReason);
      setClientCompensation(result.detail.compensation);
      setClientTimeBankBalanceBefore(
        result.detail.timeBankBalanceBeforeClosingMinutes,
      );
      setClientRecordedTimeBankEntry(result.detail.recordedTimeBankEntry);
      if (result.detail.closing) {
        mergeClosingOverrides([result.detail.closing]);
      }
    });
  }, [importId, mergeClosingOverrides]);

  useEffect(() => {
    if (!panelMonth || panelMonth === loadedMonth) {
      return;
    }
    fetchMonthDetail(panelMonth);
  }, [panelMonth, loadedMonth, fetchMonthDetail]);

  function openMonth(yearMonth: string) {
    // Reload detail without RSC remount (no router.refresh — avoids black flash).
    setLoadedMonth(null);
    setPanelMonth(yearMonth);
    syncUrl(yearMonth);
  }

  function closeMonth() {
    setPanelMonth(null);
    setLoadedMonth(null);
    syncUrl(null);
  }

  function toggleMonth(yearMonth: string) {
    if (panelMonth === yearMonth) {
      closeMonth();
      return;
    }
    openMonth(yearMonth);
  }

  const detailProps: DetailPanelProps = {
    detailRow: activeRow,
    importId,
    sourceMode,
    detailClosing: detailSynced ? clientClosing : null,
    detailAuditRows: detailSynced ? clientAuditRows : [],
    detailCanSubmit: detailSynced ? clientCanSubmit : false,
    detailBlockingCount: detailSynced ? clientBlockingCount : 0,
    detailAttachments: detailSynced ? clientAttachments : [],
    developerCompensation: clientCompensation,
    closingInvoiceIssuer: detailSynced ? clientIssuer : null,
    closingHolidays: detailSynced ? clientHolidays : [],
    closingPresenceDays: detailSynced ? clientPresenceDays : [],
    mealPixBlockReason: detailSynced ? clientMealPixBlock : null,
    timeBankBalanceBeforeClosingMinutes: detailSynced
      ? clientTimeBankBalanceBefore
      : 0,
    recordedTimeBankEntry: detailSynced ? clientRecordedTimeBankEntry : null,
  };

  const yearSelect = (
    <div className="mb-3 flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Ano
        </label>
        <select
          className="ui-select max-w-[8rem] py-1.5"
          value={String(draftYear)}
          onChange={(event) => setDraftYear(Number(event.target.value))}
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="ui-btn-secondary py-1.5 text-xs"
        disabled={draftYear === selectedYear}
        onClick={() => {
          setPanelMonth(null);
          const href = buildFechamentosHref({
            importId,
            closingYear: draftYear,
          });
          persistFiltersFromHref("developer-home", href);
          router.push(href);
        }}
      >
        Aplicar
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Mobile: stacked KPIs + chart */}
      <div className="space-y-4 lg:hidden">
        <SectionShell
          title="Fechamentos do ano"
          description="Resumo mensal (mesma lógica dos cards por período) e status do fechamento administrativo."
        >
          {yearSelect}
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
          compact
          title={`Acompanhamento ${selectedYear}`}
          description="Evolução mensal com as mesmas métricas da grade de fechamentos."
          points={trendPoints}
        />
      </div>

      {/* Desktop: KPIs left + chart right */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-stretch">
        <SectionShell
          title="Fechamentos do ano"
          description="Resumo anual e status do fechamento."
          className="h-full"
          bodyClassName="flex h-full flex-col"
        >
          {yearSelect}
          <YearKpiGrid summary={summary} />
        </SectionShell>

        <MonthlyTrendChart
          compact
          className="h-full"
          title={`Acompanhamento ${selectedYear}`}
          description="Evolução mensal com as mesmas métricas da grade."
          points={trendPoints}
        />
      </div>

      <SectionShell
        title="Meses do ano"
        description="Os 12 meses em vista rápida. Clique em Abrir para ver o detalhe do fechamento."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {displayRows.map((row) => (
            <MonthGridCard
              key={row.yearMonth}
              row={row}
              isOpen={panelMonth === row.yearMonth}
              onToggle={() => toggleMonth(row.yearMonth)}
            />
          ))}
        </div>
      </SectionShell>

      {/* Mobile detail below */}
      <section className="space-y-2 lg:hidden">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            {activeRow
              ? `Fechamento · ${formatYearMonthLabel(activeRow.yearMonth)}`
              : "Fechamento do mês"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Ações, auditoria e documentos do mês selecionado.
          </p>
        </div>
        <MonthDetailContent
          {...detailProps}
          empty={activeRow == null}
          loading={loadingDetail}
        />
        {loadError ? (
          <p className="text-sm text-danger">{loadError}</p>
        ) : null}
      </section>

      {/* Desktop contextual drawer — opens instantly; detail loads without remount */}
      <MonthDetailDrawer
        open={activeRow != null}
        onClose={closeMonth}
        loading={loadingDetail}
        error={loadError}
        detailProps={{ ...detailProps, empty: false }}
      />
    </div>
  );
}
