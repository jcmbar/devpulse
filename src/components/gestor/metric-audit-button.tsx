"use client";

import {
  loadGestorDeveloperCardsAuditAction,
  lookupGestorKeysOutsidePeriodAction,
  type GestorKeyLookupHit,
} from "@/app/app/gestor/audit-actions";
import { decideDelayJustificationAction } from "@/app/app/gestor/delay-justification-actions";
import { EmptyState } from "@/components/surface";
import { cn } from "@/lib/utils";
import type { CompiladoDateRange } from "@/lib/metrics/date-range";
import { formatDateRangeLabel } from "@/lib/metrics/date-range";
import type { GestorCardMetricKind } from "@/lib/metrics/developer-period";
import { buildGestorAnaliticoHref } from "@/lib/metrics/gestor-analitico-href";
import type { CompiladoSourceMode } from "@/lib/metrics/gestor-data-source";
import { compiladoSourceModeLabel } from "@/lib/metrics/gestor-data-source";
import {
  compareKeysToAuditSet,
  GESTOR_KEY_COMPARE_PRESET_LUIS,
  normalizeJiraKey,
  parseJiraKeys,
  summarizeKeyCompare,
  type GestorKeyCompareBucket,
  type GestorKeyCompareResult,
} from "@/lib/metrics/gestor-key-compare";
import type {
  GestorCardAuditItem,
  GestorDeveloperCardsAudit,
} from "@/services/gestor/developer-cards-audit";
import type { DelayJustificationStatus } from "@/types/delay-justification";
import { AlertTriangle, ChevronDown, Inbox, Loader2, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";

export type GestorAuditFilterContext = {
  importId: string | null;
  from: string;
  to: string;
  mode: CompiladoDateRange["mode"];
  month: string | null;
  source: CompiladoSourceMode;
};

type GestorMetricAuditButtonProps = {
  metric: GestorCardMetricKind;
  /** Card count for the metric (drawer expected size / empty check). */
  count: number;
  /** Optional visible label (e.g. sum of delay days while metric lists delayed cards). */
  displayValue?: number | string;
  /** Tooltip on the ranking cell (e.g. bruto · acatado · líquido). */
  title?: string;
  developerId: string;
  developerName: string;
  filterContext: GestorAuditFilterContext;
  /** When false, render a plain number (future columns stay dormant). */
  enabled?: boolean;
  className?: string;
  /**
   * Delay justifications awaiting gestor decision (`status=pending`).
   * When > 0, shows AlertTriangle that opens the same audit drawer.
   */
  pendingDecisionCount?: number;
};

const METRIC_LABEL: Record<GestorCardMetricKind, string> = {
  cards: "Cards",
  onTime: "No prazo",
  delayed: "Atraso",
  rework: "Retrabalho",
};

const SUSPICION_KIND_LABEL: Record<string, string> = {
  missing_unit_test_delivery: "Entrega TU ausente",
  outside_period: "Entrega TU fora do período",
  missing_delay_days: "delay_days ausente",
  metric_mismatch: "Classificação vs métrica",
  import_mismatch: "Lote divergente",
};

const BUCKET_LABEL: Record<GestorKeyCompareBucket, string> = {
  only_devpulse: "Só DevPulse",
  only_jira: "Só Jira",
  inspect: "Inspeção",
};

const JUSTIFICATION_STATUS_LABEL: Record<DelayJustificationStatus, string> = {
  pending: "Pendente",
  accepted: "Acatado",
  rejected: "Rejeitado",
};

function formatDays(value: number | null): string {
  if (value == null) {
    return "—";
  }
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} d`;
}

function formatHours(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} h`;
}

function formatIsoOrNull(value: string | null): string {
  return value ?? "null";
}

export function GestorMetricAuditButton({
  metric,
  count,
  displayValue,
  title,
  developerId,
  developerName,
  filterContext,
  enabled = true,
  className,
  pendingDecisionCount = 0,
}: GestorMetricAuditButtonProps) {
  const [open, setOpen] = useState(false);
  const visible = displayValue ?? count;
  const hasPendingDecision = pendingDecisionCount > 0;

  if (!enabled || (count <= 0 && !hasPendingDecision)) {
    return (
      <span className={className} title={title}>
        {visible}
      </span>
    );
  }

  function openDrawer() {
    setOpen(true);
  }

  return (
    <>
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={openDrawer}
          className={cn(
            "font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            className,
          )}
          title={
            title ??
            `Auditar ${METRIC_LABEL[metric].toLowerCase()} de ${developerName}`
          }
        >
          {visible}
        </button>
        {hasPendingDecision ? (
          <button
            type="button"
            onClick={openDrawer}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-warning transition hover:bg-warning/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/40"
            title="Justificativa pendente de decisão"
            aria-label={`Justificativa pendente de decisão (${pendingDecisionCount}) — abrir auditoria de ${METRIC_LABEL[metric].toLowerCase()}`}
          >
            <AlertTriangle className="size-3.5" strokeWidth={2} />
          </button>
        ) : null}
      </span>
      {open ? (
        <GestorCardsAuditDrawer
          open={open}
          onClose={() => setOpen(false)}
          metric={metric}
          developerId={developerId}
          developerName={developerName}
          expectedCount={Math.max(count, pendingDecisionCount)}
          filterContext={filterContext}
          pendingDecisionCount={pendingDecisionCount}
        />
      ) : null}
    </>
  );
}

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  metric: GestorCardMetricKind;
  developerId: string;
  developerName: string;
  expectedCount: number;
  filterContext: GestorAuditFilterContext;
  pendingDecisionCount?: number;
};

function GestorCardsAuditDrawer({
  open,
  onClose,
  metric,
  developerId,
  developerName,
  expectedCount,
  filterContext,
  pendingDecisionCount = 0,
}: DrawerProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();
  const [lookupPending, startLookupTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<GestorDeveloperCardsAudit | null>(null);

  const [onlyDevPulseText, setOnlyDevPulseText] = useState("");
  const [onlyJiraText, setOnlyJiraText] = useState("");
  const [compareActive, setCompareActive] = useState(false);
  const [filterMarkedOnly, setFilterMarkedOnly] = useState(false);
  const [lookupHits, setLookupHits] = useState<GestorKeyLookupHit[] | null>(
    null,
  );
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    closeRef.current?.focus();
  }, [open]);

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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    setAudit(null);
    setCompareActive(false);
    setFilterMarkedOnly(false);
    setLookupHits(null);
    setLookupError(null);
    startTransition(async () => {
      const result = await loadGestorDeveloperCardsAuditAction({
        developerId,
        importId: filterContext.importId,
        from: filterContext.from,
        to: filterContext.to,
        mode: filterContext.mode,
        month: filterContext.month,
        source: filterContext.source,
        metric,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAudit(result.data);
    });
  }, [
    open,
    developerId,
    filterContext.importId,
    filterContext.from,
    filterContext.to,
    filterContext.mode,
    filterContext.month,
    filterContext.source,
    metric,
  ]);

  const compareResults = useMemo(() => {
    if (!audit || !compareActive) {
      return [] as GestorKeyCompareResult[];
    }
    return compareKeysToAuditSet({
      auditKeys: audit.cards.map((card) => card.jiraKey),
      onlyDevPulseKeys: parseJiraKeys(onlyDevPulseText),
      onlyJiraKeys: parseJiraKeys(onlyJiraText),
    });
  }, [audit, compareActive, onlyDevPulseText, onlyJiraText]);

  const compareSummary = useMemo(
    () => summarizeKeyCompare(compareResults),
    [compareResults],
  );

  const compareByKey = useMemo(() => {
    const map = new Map<string, GestorKeyCompareResult>();
    for (const row of compareResults) {
      map.set(row.key, row);
    }
    return map;
  }, [compareResults]);

  const sortedCards = useMemo(() => {
    if (!audit) {
      return [] as GestorCardAuditItem[];
    }
    if (!compareActive || compareByKey.size === 0) {
      return audit.cards;
    }
    return [...audit.cards].sort((a, b) => {
      const aMark = compareByKey.has(normalizeJiraKey(a.jiraKey)) ? 0 : 1;
      const bMark = compareByKey.has(normalizeJiraKey(b.jiraKey)) ? 0 : 1;
      if (aMark !== bMark) {
        return aMark - bMark;
      }
      return a.jiraKey.localeCompare(b.jiraKey, "en");
    });
  }, [audit, compareActive, compareByKey]);

  const visibleCards = useMemo(() => {
    if (!filterMarkedOnly || !compareActive) {
      return sortedCards;
    }
    return sortedCards.filter((card) =>
      compareByKey.has(normalizeJiraKey(card.jiraKey)),
    );
  }, [sortedCards, filterMarkedOnly, compareActive, compareByKey]);

  const absentResults = useMemo(
    () => compareResults.filter((row) => row.presence === "absent"),
    [compareResults],
  );

  function applyLuisPreset() {
    setOnlyDevPulseText(GESTOR_KEY_COMPARE_PRESET_LUIS.onlyDevPulse.join("\n"));
    setOnlyJiraText(GESTOR_KEY_COMPARE_PRESET_LUIS.onlyJira.join("\n"));
    setCompareActive(true);
    setFilterMarkedOnly(true);
    setLookupHits(null);
    setLookupError(null);
  }

  function runCompare() {
    setCompareActive(true);
    setLookupHits(null);
    setLookupError(null);
  }

  function clearCompare() {
    setOnlyDevPulseText("");
    setOnlyJiraText("");
    setCompareActive(false);
    setFilterMarkedOnly(false);
    setLookupHits(null);
    setLookupError(null);
  }

  function investigateAbsent() {
    if (!audit?.importId || absentResults.length === 0) {
      return;
    }
    setLookupError(null);
    startLookupTransition(async () => {
      const result = await lookupGestorKeysOutsidePeriodAction({
        developerId,
        importId: audit.importId!,
        from: filterContext.from,
        to: filterContext.to,
        keysText: absentResults.map((row) => row.key).join("\n"),
      });
      if (!result.ok) {
        setLookupError(result.error);
        setLookupHits(null);
        return;
      }
      setLookupHits(result.hits);
    });
  }

  if (!open) {
    return null;
  }

  const dateRangeLabel = formatDateRangeLabel({
    start: filterContext.from,
    end: filterContext.to,
    mode: filterContext.mode,
    month: filterContext.month,
  });
  const cards = audit?.cards ?? null;
  const mismatch = audit != null && expectedCount !== audit.expectedCount;
  const suspiciousCount = audit?.suspicionSummary.suspiciousCardCount ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button
        type="button"
        aria-label="Fechar auditoria"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-4xl flex-col border-l border-border bg-[var(--surface-elevated)] shadow-[var(--shadow-md)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Auditoria · {METRIC_LABEL[metric]}
            </p>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              {developerName}
            </h2>
            <Link
              href={buildGestorAnaliticoHref({
                importId: filterContext.importId,
                from:
                  filterContext.mode === "custom" ? filterContext.from : null,
                to: filterContext.mode === "custom" ? filterContext.to : null,
                month:
                  filterContext.mode === "month" ? filterContext.month : null,
                source: filterContext.source,
                developerId,
                classification: metric === "cards" ? null : metric,
              })}
              className="inline-flex text-sm font-medium text-brand underline-offset-4 hover:underline"
            >
              Abrir visão analítica →
            </Link>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            aria-label="Fechar"
          >
            <X className="size-4" strokeWidth={1.9} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {pendingDecisionCount > 0 &&
          (metric === "delayed" || metric === "rework") ? (
            <div className="mb-4 flex items-start gap-2 rounded-[var(--radius-sm)] border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-warning"
                strokeWidth={2}
                aria-hidden
              />
              <p className="text-pretty text-foreground">
                <span className="font-medium">
                  {pendingDecisionCount} justificativa
                  {pendingDecisionCount === 1 ? "" : "s"} de{" "}
                  {metric === "rework" ? "retrabalho" : "atraso"} pendente
                  {pendingDecisionCount === 1 ? "" : "s"}
                </span>
                . Revise cada card e registre Aceitar ou Rejeitar.
              </p>
            </div>
          ) : null}

          {pending && audit == null && !error ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando cards…
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-danger/30 bg-[var(--danger-foreground)] px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}

          {audit ? (
            <div className="mb-4 space-y-2">
              <p className="text-sm text-muted-foreground">
                {dateRangeLabel}
                <span className="text-muted-foreground/80">
                  {" "}
                  · {compiladoSourceModeLabel(audit.dataSource)}
                </span>
              </p>

              <details className="group rounded-[var(--radius-sm)] border border-border bg-muted/20">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden">
                  <span>Detalhes da auditoria</span>
                  <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180"
                    strokeWidth={1.9}
                    aria-hidden
                  />
                </summary>
                <div className="border-t border-border px-3 py-3 text-sm">
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                        Período auditado
                      </dt>
                      <dd>
                        {dateRangeLabel}
                        <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                          {audit.dateRange.start} → {audit.dateRange.end}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                        Fonte
                      </dt>
                      <dd>{compiladoSourceModeLabel(audit.dataSource)}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                        Snapshot / lote
                      </dt>
                      <dd>
                        {audit.importId ? (
                          <>
                            <span className="font-mono text-xs">
                              {audit.importId}
                            </span>
                            {audit.batchLabel ? (
                              <span className="mt-0.5 block text-muted-foreground">
                                {audit.batchLabel}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          "Nenhum lote resolvido"
                        )}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                        Regra de inclusão
                      </dt>
                      <dd>
                        {audit.inclusionRule}
                        <span className="mt-0.5 block text-muted-foreground">
                          Filtro:{" "}
                          <code className="text-xs">
                            {audit.inclusionField} ∈ [{audit.dateRange.start},{" "}
                            {audit.dateRange.end}]
                          </code>
                        </span>
                      </dd>
                    </div>
                    {metric === "delayed" ? (
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                          Atraso (ranking)
                        </dt>
                        <dd className="text-muted-foreground">
                          Lista = atrasos brutos. Painel exibe líquido: bruto{" "}
                          {audit.periodMetrics.delayedCardsGross} · acatado{" "}
                          {audit.periodMetrics.delayedCardsAccepted} · líquido{" "}
                          {audit.periodMetrics.delayedCardsNet}.
                        </dd>
                      </div>
                    ) : null}
                    {metric === "rework" ? (
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                          Retrabalho (ranking)
                        </dt>
                        <dd className="text-muted-foreground">
                          Lista = retrabalhos brutos. Peso líquido na
                          penalidade: {audit.periodMetrics.reworkWeightTotal}{" "}
                          (bruto {audit.periodMetrics.reworkCards} card
                          {audit.periodMetrics.reworkCards === 1 ? "" : "s"} ·
                          acatado {audit.periodMetrics.reworkCardsAccepted}).
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              </details>

              <details className="group rounded-[var(--radius-sm)] border border-border bg-muted/20">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden">
                  <span>Ferramentas avançadas · inspeção de chaves</span>
                  <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180"
                    strokeWidth={1.9}
                    aria-hidden
                  />
                </summary>
                <div className="space-y-3 border-t border-border px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Cole chaves do comparativo Jira × DevPulse. Não altera o
                      ranking — só marca presença/ausência nesta auditoria.
                    </p>
                    <button
                      type="button"
                      onClick={applyLuisPreset}
                      className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      Carregar caso Luis
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5 text-xs">
                      <span className="font-semibold tracking-wide text-rose-800 dark:text-rose-200">
                        Só no DevPulse (esperado presente)
                      </span>
                      <textarea
                        value={onlyDevPulseText}
                        onChange={(event) => {
                          setOnlyDevPulseText(event.target.value);
                          setCompareActive(false);
                        }}
                        rows={4}
                        placeholder="AP-7368&#10;AP-7416&#10;…"
                        className="w-full resize-y rounded-md border border-border bg-[var(--surface)] px-2.5 py-2 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      />
                    </label>
                    <label className="space-y-1.5 text-xs">
                      <span className="font-semibold tracking-wide text-violet-800 dark:text-violet-200">
                        Só no Jira (esperado ausente)
                      </span>
                      <textarea
                        value={onlyJiraText}
                        onChange={(event) => {
                          setOnlyJiraText(event.target.value);
                          setCompareActive(false);
                        }}
                        rows={4}
                        placeholder="AP-7516"
                        className="w-full resize-y rounded-md border border-border bg-[var(--surface)] px-2.5 py-2 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={runCompare}
                      className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-brand-on hover:opacity-90"
                    >
                      <Search className="size-3.5" strokeWidth={1.9} />
                      Comparar com auditoria
                    </button>
                    <button
                      type="button"
                      onClick={clearCompare}
                      className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                    >
                      Limpar
                    </button>
                    {compareActive ? (
                      <label className="ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={filterMarkedOnly}
                          onChange={(event) =>
                            setFilterMarkedOnly(event.target.checked)
                          }
                          className="size-3.5 rounded border-border"
                        />
                        Mostrar só chaves marcadas
                      </label>
                    ) : null}
                  </div>

                  {compareActive && compareResults.length > 0 ? (
                    <div className="space-y-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs">
                      <p>
                        <span className="font-semibold">
                          {compareSummary.presentCount}
                        </span>{" "}
                        presentes ·{" "}
                        <span className="font-semibold">
                          {compareSummary.absentCount}
                        </span>{" "}
                        ausentes nesta auditoria
                      </p>
                      <p className="text-muted-foreground">
                        Só DevPulse: {compareSummary.onlyDevPulsePresent}{" "}
                        presentes / {compareSummary.onlyDevPulseAbsent} ausentes
                        · Só Jira: {compareSummary.onlyJiraPresent} presentes
                        (inesperado) / {compareSummary.onlyJiraAbsent} ausentes
                        (esperado)
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {compareResults.map((row) => (
                          <span
                            key={`${row.bucket}-${row.key}`}
                            className={cn(
                              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono",
                              row.bucket === "only_devpulse" &&
                                row.presence === "present" &&
                                "border-rose-500/40 bg-rose-500/15 text-rose-950 dark:text-rose-100",
                              row.bucket === "only_devpulse" &&
                                row.presence === "absent" &&
                                "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100",
                              row.bucket === "only_jira" &&
                                row.presence === "absent" &&
                                "border-violet-500/40 bg-violet-500/15 text-violet-950 dark:text-violet-100",
                              row.bucket === "only_jira" &&
                                row.presence === "present" &&
                                "border-danger/40 bg-[var(--danger-foreground)] text-danger",
                              row.bucket === "inspect" &&
                                "border-border bg-muted/50",
                            )}
                            title={`${BUCKET_LABEL[row.bucket]} · ${row.presence}`}
                          >
                            {row.key}
                            <span className="font-sans text-[10px] opacity-80">
                              {row.presence === "present" ? "✓" : "✗"}
                            </span>
                          </span>
                        ))}
                      </div>

                      {absentResults.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                          <button
                            type="button"
                            onClick={investigateAbsent}
                            disabled={lookupPending || !audit.importId}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 font-medium hover:bg-muted disabled:opacity-50"
                          >
                            {lookupPending ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : null}
                            Investigar ausentes no lote
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {lookupError ? (
                    <p className="text-xs text-danger">{lookupError}</p>
                  ) : null}

                  {lookupHits && lookupHits.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Lookup fora do período ({lookupHits.length})
                      </p>
                      <div className="space-y-2">
                        {lookupHits.map((hit) => (
                          <AbsentKeyCard key={hit.key} hit={hit} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </details>
            </div>
          ) : null}

          {mismatch ? (
            <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
              Contagem do ranking ({expectedCount}) difere do recálculo no
              servidor ({audit?.expectedCount}). Revise filtros ou recarregue o
              dashboard.
            </div>
          ) : null}

          {audit && suspiciousCount > 0 ? (
            <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={1.9} />
                <div className="space-y-1">
                  <p className="font-medium">
                    {suspiciousCount} card
                    {suspiciousCount === 1 ? "" : "s"} com sinal de atenção
                  </p>
                  <ul className="list-inside list-disc text-xs opacity-90">
                    {Object.entries(audit.suspicionSummary.byKind).map(
                      ([kind, count]) => (
                        <li key={kind}>
                          {SUSPICION_KIND_LABEL[kind] ?? kind}: {count}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}

          {cards != null && !error ? (
            cards.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Nenhum card neste total"
                description={`Não há cards de ${METRIC_LABEL[metric].toLowerCase()} para ${developerName} com os filtros atuais do Gestor.`}
              />
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold tracking-tight">
                    Cards para análise
                  </h3>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {visibleCards.length}
                    {filterMarkedOnly ? ` de ${cards.length}` : ""} card
                    {visibleCards.length === 1 ? "" : "s"}
                    {" · "}
                    {formatHours(
                      visibleCards.reduce(
                        (sum, card) => sum + (card.timeSpentHours ?? 0),
                        0,
                      ),
                    )}{" "}
                    realizadas
                  </p>
                </div>
                <div className="space-y-3">
                  {visibleCards.map((card) => (
                    <AuditDecisionCard
                      key={card.id}
                      card={card}
                      metric={metric}
                      onJustificationDecided={() => {
                        startTransition(async () => {
                          const result =
                            await loadGestorDeveloperCardsAuditAction({
                              developerId,
                              importId: filterContext.importId,
                              from: filterContext.from,
                              to: filterContext.to,
                              mode: filterContext.mode,
                              month: filterContext.month,
                              source: filterContext.source,
                              metric,
                            });
                          if (result.ok) {
                            setAudit(result.data);
                          }
                        });
                      }}
                      compare={
                        compareByKey.get(normalizeJiraKey(card.jiraKey)) ??
                        null
                      }
                    />
                  ))}
                </div>
              </div>
            )
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function AbsentKeyCard({ hit }: { hit: GestorKeyLookupHit }) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-xs",
        hit.found
          ? "border-violet-500/35 bg-violet-500/10"
          : "border-border bg-muted/30",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-sm font-semibold">{hit.key}</p>
        <p className="text-muted-foreground">
          {!hit.found
            ? "Não está no lote"
            : hit.inImportOtherDeveloper
              ? "No lote · outro developer"
              : hit.inDeveloperImport
                ? "No lote · este developer"
                : "Encontrado"}
        </p>
      </div>
      <p className="mt-1 text-muted-foreground">{hit.inclusionNote}</p>
      {hit.found ? (
        <dl className="mt-2 grid gap-1 font-mono sm:grid-cols-2">
          <div>
            <dt className="inline text-muted-foreground">unit_test_delivery_on </dt>
            <dd className="inline">{formatIsoOrNull(hit.unitTestDeliveryOn)}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">started_on </dt>
            <dd className="inline">{formatIsoOrNull(hit.startedOn)}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">due_on </dt>
            <dd className="inline">{formatIsoOrNull(hit.dueOn)}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">completed_on </dt>
            <dd className="inline">{formatIsoOrNull(hit.completedOn)}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">delay_days </dt>
            <dd className="inline">
              {hit.delayDays == null ? "null" : formatDays(hit.delayDays)}
            </dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">import_id </dt>
            <dd className="inline break-all">
              {hit.importId ?? "null"}
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}

function AuditDecisionCard({
  card,
  compare,
  metric,
  onJustificationDecided,
}: {
  card: GestorCardAuditItem;
  compare: GestorKeyCompareResult | null;
  metric: GestorCardMetricKind;
  onJustificationDecided: () => void;
}) {
  const hasWarning = card.suspicions.some((item) => item.severity === "warning");
  const showDecision = metric === "delayed" || metric === "rework";
  const justification = card.justification;
  const isPendingDecision = justification?.status === "pending";

  return (
    <article
      className={cn(
        "overflow-hidden rounded-[var(--radius)] border border-border bg-[var(--surface)] shadow-[var(--shadow-sm)]",
        compare?.bucket === "only_devpulse" &&
          "border-rose-500/40 ring-1 ring-rose-500/20",
        compare?.bucket === "only_jira" &&
          "border-violet-500/40 ring-1 ring-violet-500/20",
        !compare &&
          card.isSuspicious &&
          (hasWarning
            ? "border-amber-500/35"
            : "border-sky-500/30"),
        isPendingDecision && "border-warning/45",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {compare || card.isSuspicious ? (
              <AlertTriangle
                className={cn(
                  "size-3.5 shrink-0",
                  compare?.bucket === "only_devpulse" &&
                    "text-rose-700 dark:text-rose-300",
                  compare?.bucket === "only_jira" &&
                    "text-violet-700 dark:text-violet-300",
                  !compare && hasWarning && "text-amber-700 dark:text-amber-300",
                  !compare && !hasWarning && "text-sky-700 dark:text-sky-300",
                )}
                strokeWidth={1.9}
                aria-hidden
              />
            ) : null}
            <h4 className="font-mono text-base font-semibold tracking-tight">
              {card.jiraKey}
            </h4>
            {compare ? (
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
                  compare.bucket === "only_devpulse"
                    ? "border-rose-500/40 bg-rose-500/15 text-rose-950 dark:text-rose-100"
                    : "border-violet-500/40 bg-violet-500/15 text-violet-950 dark:text-violet-100",
                )}
              >
                {BUCKET_LABEL[compare.bucket]}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-pretty text-foreground">
            {card.summary ?? "Sem resumo"}
          </p>
        </div>
        {showDecision && justification ? (
          <span
            className={cn(
              "inline-flex shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold tracking-wide",
              justification.status === "pending" &&
                "border-amber-500/40 bg-amber-500/15 text-amber-950 dark:text-amber-100",
              justification.status === "accepted" &&
                "border-emerald-500/40 bg-emerald-500/15 text-emerald-950 dark:text-emerald-100",
              justification.status === "rejected" &&
                "border-rose-500/40 bg-rose-500/15 text-rose-950 dark:text-rose-100",
            )}
          >
            {JUSTIFICATION_STATUS_LABEL[justification.status]}
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 border-b border-border px-4 py-3 sm:grid-cols-2 lg:grid-cols-5">
        <ObjectiveField
          label="Prazo"
          value={formatIsoOrNull(card.dueOn)}
          mono
        />
        <ObjectiveField
          label="Entrega TU"
          value={formatIsoOrNull(card.unitTestDeliveryOn)}
          mono
          emphasize={
            !card.unitTestDeliveryOn || !card.inPeriodByUnitTestDelivery
          }
        />
        <ObjectiveField
          label="Horas realizadas"
          value={formatHours(card.timeSpentHours)}
          mono
        />
        <ObjectiveField
          label="Atraso"
          value={
            card.delayDays == null ? "—" : formatDays(card.delayDays)
          }
          mono
        />
        <div className="space-y-1">
          <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            Classificação
          </p>
          <div className="flex flex-wrap gap-1">
            {card.classificationLabels.length > 0 ? (
              card.classificationLabels.map((label) => (
                <span
                  key={label}
                  className="inline-flex rounded border border-border bg-muted/40 px-1.5 py-0.5 text-xs"
                >
                  {label}
                </span>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </div>
        </div>
      </div>

      {card.suspicions.length > 0 ? (
        <div className="flex flex-wrap gap-1 border-b border-border px-4 py-2">
          {card.suspicions.map((suspicion) => (
            <span
              key={suspicion.kind}
              className={cn(
                "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wide",
                suspicion.severity === "warning"
                  ? "border-amber-500/40 bg-amber-500/15 text-amber-950 dark:text-amber-100"
                  : "border-sky-500/30 bg-sky-500/10 text-sky-950 dark:text-sky-100",
              )}
            >
              {suspicion.label}
            </span>
          ))}
        </div>
      ) : null}

      {showDecision ? (
        <GestorDecisionPanel
          card={card}
          onDecided={onJustificationDecided}
        />
      ) : null}
    </article>
  );
}

function ObjectiveField({
  label,
  value,
  mono = false,
  emphasize = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasize?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "text-sm font-medium",
          mono && "font-mono",
          emphasize && "text-amber-800 dark:text-amber-200",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function GestorDecisionPanel({
  card,
  onDecided,
}: {
  card: GestorCardAuditItem;
  onDecided: () => void;
}) {
  const justification = card.justification;
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const noteId = useId();

  if (!justification) {
    return (
      <div className="px-4 py-3 text-sm text-muted-foreground">
        Sem pedido de justificativa neste card.
      </div>
    );
  }

  function decide(decision: "accepted" | "rejected") {
    if (!justification) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await decideDelayJustificationAction({
        requestId: justification.id,
        decision,
        reviewerNote: note,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNote("");
      onDecided();
    });
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <section className="space-y-1.5">
        <h5 className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          Justificativa do developer
        </h5>
        <p className="rounded-[var(--radius-sm)] border border-border bg-muted/25 px-3 py-2.5 text-sm text-pretty leading-relaxed">
          {justification.developerNote}
        </p>
      </section>

      {justification.reviewerNote && justification.status !== "pending" ? (
        <section className="space-y-1.5">
          <h5 className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            Decisão registrada
          </h5>
          <p className="text-sm text-pretty text-muted-foreground leading-relaxed">
            {justification.reviewerNote}
          </p>
        </section>
      ) : null}

      {justification.status === "pending" ? (
        <section className="space-y-3 rounded-[var(--radius-sm)] border border-brand/25 bg-brand-soft/40 px-3 py-3 dark:bg-brand/10">
          <div className="space-y-1">
            <h5 className="text-sm font-semibold tracking-tight">
              Sua decisão
            </h5>
            <p className="text-xs text-muted-foreground">
              Nota obrigatória para Aceitar ou Rejeitar.
            </p>
          </div>
          <label htmlFor={noteId} className="sr-only">
            Nota do gestor
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder="Explique o motivo da decisão…"
            className="w-full resize-y rounded-md border border-border bg-[var(--surface-elevated)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !note.trim()}
              onClick={() => decide("accepted")}
              className="inline-flex min-h-9 items-center justify-center rounded-[var(--radius-sm)] border border-emerald-500/45 bg-emerald-500/15 px-3.5 text-sm font-semibold text-emerald-950 disabled:opacity-50 dark:text-emerald-100"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Aceitar
            </button>
            <button
              type="button"
              disabled={pending || !note.trim()}
              onClick={() => decide("rejected")}
              className="inline-flex min-h-9 items-center justify-center rounded-[var(--radius-sm)] border border-rose-500/45 bg-rose-500/15 px-3.5 text-sm font-semibold text-rose-950 disabled:opacity-50 dark:text-rose-100"
            >
              Rejeitar
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
