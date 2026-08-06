"use client";

import { DataTable, EmptyState, Surface } from "@/components/surface";
import { cn } from "@/lib/utils";
import { buildGestorAnaliticoHref } from "@/lib/metrics/gestor-analitico-href";
import {
  computeUtilizationBreakdown,
  formatDeliveryIndex,
} from "@/lib/metrics/developer-period";
import {
  formatDeliveryIndexTooltip,
  formatUtilizationBreakdownTooltip,
} from "@/lib/metrics/metric-calc-explain";
import type { GestorAnalyticalCardRow } from "@/services/gestor/analytical-base";
import { Inbox } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

export type AnalyticalBaseFilterState = {
  developerId: string;
  status: string;
  /** Empty = all cards in period (sintético Cards). */
  classification: "" | "onTime" | "delayed" | "rework" | "incomplete";
  q: string;
};

type AnalyticalBaseViewProps = {
  rows: GestorAnalyticalCardRow[];
  developers: Array<{ id: string; fullName: string }>;
  statuses: string[];
  context: {
    importId: string | null;
    from: string;
    to: string;
    month: string | null;
    source: string;
  };
  initialFilters: AnalyticalBaseFilterState;
};

function formatIso(value: string | null): string {
  return value ?? "—";
}

function formatDays(value: number | null): string {
  if (value == null) {
    return "—";
  }
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** Same rules as `cardMatchesMetric` / ranking columns. */
function rowMatchesClassification(
  row: GestorAnalyticalCardRow,
  classification: AnalyticalBaseFilterState["classification"],
): boolean {
  if (!classification) {
    return true;
  }
  switch (classification) {
    case "onTime":
      return row.isOnTime === true;
    case "delayed":
      return row.isDelayed === true;
    case "rework":
      return row.isRework;
    case "incomplete":
      return row.isOnTime == null && row.isDelayed == null;
  }
}

export function AnalyticalBaseView({
  rows,
  developers,
  statuses,
  context,
  initialFilters,
}: AnalyticalBaseViewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [developerId, setDeveloperId] = useState(initialFilters.developerId);
  const [status, setStatus] = useState(initialFilters.status);
  const [classification, setClassification] = useState(
    initialFilters.classification,
  );
  const [q, setQ] = useState(initialFilters.q);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (developerId && row.developerId !== developerId) {
        return false;
      }
      if (status && row.status !== status) {
        return false;
      }
      if (!rowMatchesClassification(row, classification)) {
        return false;
      }
      if (needle) {
        const hay = `${row.jiraKey} ${row.summary ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) {
          return false;
        }
      }
      return true;
    });
  }, [rows, developerId, status, classification, q]);

  const totals = useMemo(() => {
    let onTime = 0;
    let delayedGross = 0;
    let delayedNet = 0;
    let reworkCards = 0;
    let reworkWeightTotal = 0;
    for (const row of filtered) {
      if (row.isOnTime === true) {
        onTime += 1;
      }
      if (row.isDelayed === true) {
        delayedGross += 1;
        if (!row.delayAccepted) {
          delayedNet += 1;
        }
      }
      if (row.isRework) {
        reworkCards += 1;
        reworkWeightTotal += row.reworkWeight || 1;
      }
    }
    const utilization = computeUtilizationBreakdown({
      totalCards: filtered.length,
      delayedCardsNet: delayedNet,
      reworkWeightTotal,
    });
    return {
      cards: filtered.length,
      onTime,
      delayed: delayedGross,
      delayedNet,
      rework: reworkCards,
      reworkWeightTotal,
      utilization,
    };
  }, [filtered]);

  function syncUrl(next: AnalyticalBaseFilterState) {
    const href = buildGestorAnaliticoHref({
      importId: context.importId,
      from: context.month ? null : context.from,
      to: context.month ? null : context.to,
      month: context.month,
      source: context.source,
      developerId: next.developerId || null,
      status: next.status || null,
      classification: next.classification || null,
      q: next.q || null,
    });
    startTransition(() => {
      router.replace(href);
    });
  }

  function updateFilters(patch: Partial<AnalyticalBaseFilterState>) {
    const next: AnalyticalBaseFilterState = {
      developerId,
      status,
      classification,
      q,
      ...patch,
    };
    if (patch.developerId !== undefined) {
      setDeveloperId(patch.developerId);
    }
    if (patch.status !== undefined) {
      setStatus(patch.status);
    }
    if (patch.classification !== undefined) {
      setClassification(patch.classification);
    }
    if (patch.q !== undefined) {
      setQ(patch.q);
    }
    syncUrl(next);
  }

  return (
    <div className="space-y-4">
      <div className="ui-card space-y-4 px-4 py-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold tracking-tight">
            Filtros da base
          </h2>
          <p className="text-xs text-muted-foreground">
            Combináveis sobre o mesmo recorte do sintético (Entrega TU no
            período + lote ativo). Totais abaixo acompanham o filtro.
            {pending ? " Atualizando URL…" : null}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1.5 text-xs">
            <span className="font-semibold text-muted-foreground">Developer</span>
            <select
              value={developerId}
              onChange={(event) =>
                updateFilters({ developerId: event.target.value })
              }
              className="ui-select"
            >
              <option value="">Todos</option>
              {developers.map((developer) => (
                <option key={developer.id} value={developer.id}>
                  {developer.fullName}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="font-semibold text-muted-foreground">Status</span>
            <select
              value={status}
              onChange={(event) => updateFilters({ status: event.target.value })}
              className="ui-select"
            >
              <option value="">Todos</option>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="font-semibold text-muted-foreground">
              Classificação
            </span>
            <select
              value={classification}
              onChange={(event) =>
                updateFilters({
                  classification: event.target
                    .value as AnalyticalBaseFilterState["classification"],
                })
              }
              className="ui-select"
            >
              <option value="">Cards (todos do período)</option>
              <option value="onTime">No prazo</option>
              <option value="delayed">Atraso</option>
              <option value="rework">Retrabalho</option>
              <option value="incomplete">Atenção (dados faltantes)</option>
            </select>
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="font-semibold text-muted-foreground">
              Busca (key / summary)
            </span>
            <input
              type="search"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onBlur={() => updateFilters({ q })}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  updateFilters({ q });
                }
              }}
              placeholder="AP-7516 ou texto…"
              className="ui-input"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Surface className="space-y-1" interactive>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Cards (filtrados)
          </p>
          <p className="ui-kpi text-2xl tracking-tight">{totals.cards}</p>
        </Surface>
        <Surface className="space-y-1" interactive>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            No prazo
          </p>
          <p className="ui-kpi text-2xl tracking-tight">{totals.onTime}</p>
        </Surface>
        <Surface className="space-y-1" interactive>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Atraso
          </p>
          <p className="ui-kpi text-2xl tracking-tight">{totals.delayedNet}</p>
          {totals.delayed !== totals.delayedNet ? (
            <p className="text-xs text-muted-foreground">
              bruto {totals.delayed}
            </p>
          ) : null}
        </Surface>
        <Surface className="space-y-1" interactive>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Retrabalho
          </p>
          <p className="ui-kpi text-2xl tracking-tight">
            {totals.reworkWeightTotal}
          </p>
        </Surface>
        <Surface className="space-y-1" interactive>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Aproveitamento
          </p>
          <p
            className="ui-kpi text-2xl tracking-tight"
            title={formatUtilizationBreakdownTooltip({
              totalCards: totals.cards,
              delayedCardsNet: totals.delayedNet,
              reworkWeightTotal: totals.reworkWeightTotal,
              utilizationRate: totals.utilization.utilizationRate,
            })}
          >
            {(totals.utilization.utilizationRate * 100).toLocaleString("pt-BR", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 1,
            })}
            %
          </p>
          <p className="text-xs text-muted-foreground">
            C {totals.cards} · P {totals.utilization.utilizationPenalty} ·
            C_aprov {totals.utilization.utilizedCardEquivalents}
          </p>
          <p
            className="text-xs text-muted-foreground"
            title={formatDeliveryIndexTooltip({
              totalCards: totals.cards,
              utilizationRate: totals.utilization.utilizationRate,
              deliveryIndex: totals.utilization.deliveryIndex,
            })}
          >
            Índice {formatDeliveryIndex(totals.utilization.deliveryIndex)}{" "}
            (Q×√C)
          </p>
        </Surface>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nenhum card com estes filtros"
          description="Ajuste developer, status, classificação ou busca. O recorte de período/fonte/lote fica nos filtros do topo."
        />
      ) : (
        <DataTable minWidthClassName="min-w-[1100px]">
          <thead>
            <tr>
              <th>Chave</th>
              <th>Summary</th>
              <th>Developer</th>
              <th>Status</th>
              <th>Entrega TU</th>
              <th>Início</th>
              <th>Prazo</th>
              <th>Concluído</th>
              <th>Delay</th>
              <th>Classificação</th>
              <th>Lote / fonte</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td className="align-top whitespace-nowrap font-mono text-sm font-medium">
                  {row.jiraKey}
                </td>
                <td
                  className="align-top max-w-[220px] truncate"
                  title={row.summary ?? undefined}
                >
                  {row.summary ?? "—"}
                </td>
                <td className="align-top whitespace-nowrap">{row.developerName}</td>
                <td className="align-top whitespace-nowrap text-sm">
                  {row.status ?? "—"}
                </td>
                <td className="align-top whitespace-nowrap font-mono text-xs">
                  <div>{formatIso(row.unitTestDeliveryOn)}</div>
                  <p className="mt-1 max-w-[180px] font-sans text-[10px] leading-snug text-muted-foreground">
                    {row.inclusionReason}
                  </p>
                </td>
                <td className="align-top whitespace-nowrap font-mono text-xs">
                  {formatIso(row.startedOn)}
                </td>
                <td className="align-top whitespace-nowrap font-mono text-xs">
                  {formatIso(row.dueOn)}
                </td>
                <td className="align-top whitespace-nowrap font-mono text-xs">
                  {formatIso(row.completedOn)}
                </td>
                <td
                  className={cn(
                    "align-top whitespace-nowrap font-mono text-xs",
                    row.delayDays == null && "text-muted-foreground",
                  )}
                >
                  {formatDays(row.delayDays)}
                </td>
                <td className="align-top text-xs">
                  <div className="flex max-w-[160px] flex-wrap gap-1">
                    {row.classificationLabels.map((label) => (
                      <span
                        key={label}
                        className="inline-flex rounded border border-border bg-muted/40 px-1.5 py-0.5"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="align-top text-xs text-muted-foreground">
                  <p className="font-mono text-[11px] break-all">{row.importId}</p>
                  <p className="mt-0.5">{row.sourceLabel}</p>
                  {row.batchLabel ? (
                    <p className="mt-0.5">{row.batchLabel}</p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
