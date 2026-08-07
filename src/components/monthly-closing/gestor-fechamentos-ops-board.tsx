"use client";

import {
  GestorClosingOpsDrawer,
  type ClosingOpsDrawerTarget,
} from "@/components/monthly-closing/gestor-closing-ops-drawer";
import { OperationalEmailSendButton } from "@/components/monthly-closing/operational-email-send-button";
import { GestorTeamFilter } from "@/components/gestor-team-filter";
import { KpiMetricCard } from "@/components/ui/kpi-metric-card";
import { FilterBar } from "@/components/ui/section-shell";
import {
  buildFechamentoOpsCell,
  docStateLabel,
  emailDispatchToDocState,
  FECHAMENTO_OPS_STATUS_LABELS,
  FECHAMENTO_OPS_STATUS_ORDER,
  mealPixToDocState,
  opsStatusToneClass,
  yearCellTone,
  type FechamentoOpsCellData,
  type FechamentoOpsDeveloperData,
  type FechamentoOpsStatus,
} from "@/lib/fechamentos/ops-status";
import { formatYearMonthLabel } from "@/lib/metrics/date-range";
import { formatDateTimeShortBrazil } from "@/lib/datetime/format-brazil";
import { cn } from "@/lib/utils";
import type { Team } from "@/types/team";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

export type { FechamentoOpsCellData, FechamentoOpsDeveloperData };

type BoardProps = {
  year: number;
  month: number;
  view: "month" | "year";
  statusFilter: FechamentoOpsStatus | "all";
  query: string;
  years: number[];
  teams: Team[];
  selectedTeamId: string | null;
  teamParam?: string;
  developers: FechamentoOpsDeveloperData[];
  sendTypeIds: {
    financeiroId: string | null;
    rhId: string | null;
    colaboradorId: string | null;
  };
};

function padMonth(month: number): string {
  return String(month).padStart(2, "0");
}

function yearMonthKey(year: number, month: number): string {
  return `${year}-${padMonth(month)}`;
}

function monthKeys(year: number): string[] {
  return Array.from({ length: 12 }, (_, index) =>
    yearMonthKey(year, index + 1),
  );
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

function buildHref(input: {
  teamId?: string;
  closingYear?: number;
  closingMonth?: number;
  view?: "month" | "year";
  status?: string;
  q?: string;
}): string {
  const params = new URLSearchParams();
  if (input.teamId) {
    params.set("teamId", input.teamId);
  }
  if (input.closingYear != null) {
    params.set("closingYear", String(input.closingYear));
  }
  if (input.closingMonth != null) {
    params.set("closingMonth", String(input.closingMonth));
  }
  if (input.view && input.view !== "month") {
    params.set("view", input.view);
  }
  if (input.status && input.status !== "all") {
    params.set("status", input.status);
  }
  if (input.q?.trim()) {
    params.set("q", input.q.trim());
  }
  const query = params.toString();
  return query
    ? `/app/gestor/fechamentos?${query}`
    : "/app/gestor/fechamentos";
}

function CompactDocState({
  label,
  state,
}: {
  label: string;
  state: ReturnType<typeof mealPixToDocState>;
}) {
  const tone =
    state === "erro" || state === "recusado" || state === "ausente"
      ? "text-rose-800 dark:text-rose-200"
      : state === "enviado" || state === "aceito"
        ? "text-emerald-800 dark:text-emerald-200"
        : state === "pronto" || state === "pendente"
          ? "text-amber-800 dark:text-amber-200"
          : "text-muted-foreground";

  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className={cn("truncate text-xs font-semibold", tone)}>
        {docStateLabel(state)}
      </p>
    </div>
  );
}

function YearCellDot({
  tone,
  title,
  onClick,
}: {
  tone: "green" | "yellow" | "red" | "gray";
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "mx-auto flex size-6 items-center justify-center rounded-full border transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
        tone === "green" &&
          "border-emerald-500/50 bg-emerald-500/80 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]",
        tone === "yellow" &&
          "border-amber-500/50 bg-amber-400/90",
        tone === "red" && "border-rose-500/50 bg-rose-500/85",
        tone === "gray" && "border-border bg-muted/70",
      )}
      aria-label={title}
    />
  );
}

export function GestorFechamentosOpsBoard({
  year,
  month,
  view,
  statusFilter,
  query,
  years,
  teams,
  selectedTeamId,
  teamParam,
  developers,
  sendTypeIds,
}: BoardProps) {
  const router = useRouter();
  const [refreshPending, startRefresh] = useTransition();
  const [drawerTarget, setDrawerTarget] =
    useState<ClosingOpsDrawerTarget | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const selectedYearMonth = yearMonthKey(year, month);
  const months = monthKeys(year);

  const monthRows = useMemo(() => {
    const rows = developers.map((dev) => {
      const existing = dev.cellsByMonth[selectedYearMonth];
      const cell =
        existing ??
        buildFechamentoOpsCell({
          yearMonth: selectedYearMonth,
          closing: null,
          presence: null,
          financeiro: null,
          rh: null,
          colaborador: null,
          requireMealPix: dev.requireMealPix,
        });
      return { developer: dev, cell };
    });

    const q = query.trim().toLowerCase();
    return rows
      .filter(({ developer }) => {
        if (q && !developer.fullName.toLowerCase().includes(q)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const orderA = FECHAMENTO_OPS_STATUS_ORDER.indexOf(a.cell.opsStatus);
        const orderB = FECHAMENTO_OPS_STATUS_ORDER.indexOf(b.cell.opsStatus);
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return a.developer.fullName.localeCompare(
          b.developer.fullName,
          "pt-BR",
        );
      });
  }, [developers, selectedYearMonth, query]);

  const visibleMonthRows = useMemo(() => {
    if (statusFilter === "all") {
      return monthRows;
    }
    return monthRows.filter(({ cell }) => cell.opsStatus === statusFilter);
  }, [monthRows, statusFilter]);

  const kpis = useMemo(() => {
    const counts: Record<FechamentoOpsStatus | "total", number> = {
      total: monthRows.length,
      erro: 0,
      pendente: 0,
      em_analise: 0,
      pronto: 0,
      finalizado: 0,
    };
    for (const row of monthRows) {
      counts[row.cell.opsStatus] += 1;
    }
    return counts;
  }, [monthRows]);

  function openCell(
    developer: FechamentoOpsDeveloperData,
    cell: FechamentoOpsCellData,
  ) {
    setDrawerTarget({
      developerId: developer.id,
      developerName: developer.fullName,
      yearMonth: cell.yearMonth,
      closingId: cell.closingId,
      opsStatus: cell.opsStatus,
      requireMealPix: cell.requireMealPix,
      financeiro: cell.financeiro,
      rh: cell.rh,
      colaborador: cell.colaborador,
    });
    setDrawerOpen(true);
  }

  const preservedParams = {
    closingYear: String(year),
    closingMonth: String(month),
    view: view === "year" ? "year" : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    q: query.trim() || undefined,
  };

  return (
    <>
      <FilterBar>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="ui-filter-bar__fields min-w-0 flex-1 md:grid-cols-2 xl:grid-cols-5">
            <div className="ui-filter-bar__field">
              <p className="ui-filter-bar__label">Mês</p>
              <select
                className="ui-select w-full min-w-0"
                value={month}
                aria-label="Mês"
                onChange={(event) => {
                  router.push(
                    buildHref({
                      teamId: teamParam,
                      closingYear: year,
                      closingMonth: Number(event.target.value),
                      view,
                      status: statusFilter,
                      q: query,
                    }),
                  );
                }}
              >
                {Array.from({ length: 12 }, (_, index) => {
                  const value = index + 1;
                  const label = shortMonthLabel(yearMonthKey(year, value));
                  return (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="ui-filter-bar__field">
              <p className="ui-filter-bar__label">Ano</p>
              <select
                className="ui-select w-full min-w-0"
                value={year}
                aria-label="Ano"
                onChange={(event) => {
                  router.push(
                    buildHref({
                      teamId: teamParam,
                      closingYear: Number(event.target.value),
                      closingMonth: month,
                      view,
                      status: statusFilter,
                      q: query,
                    }),
                  );
                }}
              >
                {years.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="ui-filter-bar__field">
              <p className="ui-filter-bar__label">Time</p>
              <GestorTeamFilter
                basePath="/app/gestor/fechamentos"
                teams={teams}
                selectedTeamId={selectedTeamId}
                preservedParams={preservedParams}
                persistScope="gestor-fechamentos"
                embedded
              />
            </div>
            <div className="ui-filter-bar__field">
              <p className="ui-filter-bar__label">Status</p>
              <select
                className="ui-select w-full min-w-0"
                value={statusFilter}
                aria-label="Status"
                onChange={(event) => {
                  router.push(
                    buildHref({
                      teamId: teamParam,
                      closingYear: year,
                      closingMonth: month,
                      view,
                      status: event.target.value,
                      q: query,
                    }),
                  );
                }}
              >
                <option value="all">Todos</option>
                {FECHAMENTO_OPS_STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {FECHAMENTO_OPS_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
            <div className="ui-filter-bar__field">
              <p className="ui-filter-bar__label">Developer</p>
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const nextQ = String(form.get("q") ?? "");
                  router.push(
                    buildHref({
                      teamId: teamParam,
                      closingYear: year,
                      closingMonth: month,
                      view,
                      status: statusFilter,
                      q: nextQ,
                    }),
                  );
                }}
              >
                <input
                  name="q"
                  defaultValue={query}
                  placeholder="Buscar…"
                  className="ui-input min-w-0 flex-1"
                  aria-label="Buscar developer"
                />
                <button type="submit" className="ui-btn-secondary text-sm">
                  Buscar
                </button>
              </form>
            </div>
          </div>
          <button
            type="button"
            className="ui-btn-secondary shrink-0 self-end"
            disabled={refreshPending}
            onClick={() => {
              startRefresh(() => {
                router.refresh();
              });
            }}
          >
            <RefreshCw
              className={cn("size-3.5", refreshPending && "animate-spin")}
            />
            Atualizar
          </button>
        </div>
      </FilterBar>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiMetricCard label="Total" value={kpis.total} tone="neutral" />
        <KpiMetricCard
          label="Pendentes"
          value={kpis.pendente}
          tone="warning"
        />
        <KpiMetricCard
          label="Em análise"
          value={kpis.em_analise}
          tone="info"
        />
        <KpiMetricCard label="Prontos" value={kpis.pronto} tone="brand" />
        <KpiMetricCard
          label="Finalizados"
          value={kpis.finalizado}
          tone="success"
        />
        <KpiMetricCard label="Erro" value={kpis.erro} tone="danger" />
      </div>

      <div
        role="tablist"
        aria-label="Visões de fechamento"
        className="flex flex-wrap gap-1 border-b border-border"
      >
        <Link
          role="tab"
          aria-selected={view === "month"}
          href={buildHref({
            teamId: teamParam,
            closingYear: year,
            closingMonth: month,
            view: "month",
            status: statusFilter,
            q: query,
          })}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-semibold transition",
            view === "month"
              ? "border-brand text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          Fechamento do mês
        </Link>
        <Link
          role="tab"
          aria-selected={view === "year"}
          href={buildHref({
            teamId: teamParam,
            closingYear: year,
            closingMonth: month,
            view: "year",
            status: statusFilter,
            q: query,
          })}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-semibold transition",
            view === "year"
              ? "border-brand text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          Histórico anual
        </Link>
      </div>

      {view === "month" ? (
        <section className="ui-dashboard-panel space-y-3">
          <div>
            <h2 className="text-base font-semibold">
              Fechamento · {formatYearMonthLabel(selectedYearMonth)}
            </h2>
            <p className="text-sm text-muted-foreground">
              Painel operacional do mês — comprovantes, envios e criticidade.
            </p>
          </div>

          <div className="overflow-auto rounded-[var(--radius-md)] border border-border">
            <table className="w-full min-w-[68rem] border-collapse text-sm">
              <thead className="sticky top-0 z-20 bg-[var(--surface-elevated)]">
                <tr className="border-b border-border text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  <th className="sticky left-0 z-30 bg-[var(--surface-elevated)] px-3 py-2.5 shadow-[1px_0_0_var(--border)]">
                    Developer
                  </th>
                  <th className="px-3 py-2.5">Status geral</th>
                  <th className="px-3 py-2.5">Comprovante</th>
                  <th className="px-3 py-2.5">Financeiro</th>
                  <th className="px-3 py-2.5">Envio RH</th>
                  <th className="px-3 py-2.5">Recibo colaborador</th>
                  <th className="px-3 py-2.5">Última atualização</th>
                  <th className="px-3 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visibleMonthRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      Nenhum developer para os filtros atuais.
                    </td>
                  </tr>
                ) : (
                  visibleMonthRows.map(({ developer, cell }) => {
                    const comprovante = mealPixToDocState(
                      cell.presence,
                      cell.requireMealPix,
                    );
                    const financeiroReady =
                      cell.closingStatus === "finalized" &&
                      Boolean(cell.presence?.hasInvoicePdf) &&
                      Boolean(cell.presence?.hasBoletoPdf);
                    const financeiroState = emailDispatchToDocState(
                      cell.financeiro,
                      financeiroReady,
                    );
                    const rhReady =
                      Boolean(cell.closingId) &&
                      cell.requireMealPix &&
                      Boolean(cell.presence?.hasMealPixReceipt);
                    const rhState = emailDispatchToDocState(
                      cell.rh,
                      rhReady,
                    );
                    const colaboradorReady =
                      cell.closingStatus === "finalized" &&
                      Boolean(cell.closingId);
                    const colaboradorState = emailDispatchToDocState(
                      cell.colaborador,
                      colaboradorReady,
                    );
                    const reciboAnexaDocs =
                      Boolean(cell.presence?.hasInvoicePdf) &&
                      Boolean(cell.presence?.hasBoletoPdf);

                    return (
                      <tr
                        key={developer.id}
                        className="group cursor-pointer border-b border-border/70 transition hover:bg-muted/40"
                        onClick={() => openCell(developer, cell)}
                      >
                        <td className="sticky left-0 z-10 bg-[var(--surface-elevated)] px-3 py-2.5 shadow-[1px_0_0_var(--border)] group-hover:bg-muted/40">
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {developer.fullName}
                            </p>
                            {!developer.isActive ? (
                              <p className="text-[11px] text-muted-foreground">
                                Inativo
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                              opsStatusToneClass(cell.opsStatus),
                            )}
                          >
                            {FECHAMENTO_OPS_STATUS_LABELS[cell.opsStatus]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <CompactDocState
                            label="PIX"
                            state={comprovante}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <CompactDocState
                            label="Envio"
                            state={financeiroState}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <CompactDocState
                            label="Envio"
                            state={
                              cell.requireMealPix ? rhState : "na"
                            }
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="space-y-0.5">
                            <CompactDocState
                              label="Envio"
                              state={
                                cell.closingStatus === "finalized"
                                  ? colaboradorState
                                  : "indisponivel"
                              }
                            />
                            {cell.closingStatus === "finalized" ? (
                              <p className="text-[10px] text-muted-foreground">
                                {reciboAnexaDocs
                                  ? "Anexa NF + boleto"
                                  : "Sem NF/boleto anexos"}
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">
                          {cell.lastUpdatedAt
                            ? formatDateTimeShortBrazil(cell.lastUpdatedAt)
                            : "—"}
                        </td>
                        <td
                          className="px-3 py-2.5 text-right"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                            {cell.closingId && financeiroReady ? (
                              <OperationalEmailSendButton
                                typeCode="financeiro"
                                closingId={cell.closingId}
                                enabled
                                status={cell.financeiro}
                                errorMessage={cell.financeiroError}
                                compact
                              />
                            ) : null}
                            {cell.closingId && cell.requireMealPix ? (
                              <OperationalEmailSendButton
                                typeCode="rh"
                                closingId={cell.closingId}
                                enabled={rhReady}
                                status={cell.rh}
                                compact
                              />
                            ) : null}
                            {cell.closingId ? (
                              <OperationalEmailSendButton
                                typeCode="colaborador"
                                closingId={cell.closingId}
                                enabled={colaboradorReady}
                                status={cell.colaborador}
                                compact
                                titleExtra={
                                  colaboradorReady
                                    ? reciboAnexaDocs
                                      ? "NF e boleto serão anexados"
                                      : "Sem NF/boleto no fechamento"
                                    : null
                                }
                              />
                            ) : null}
                            {cell.closingId ? (
                              <Link
                                href={`/app/gestor/fechamentos/${cell.closingId}`}
                                className="ui-btn-secondary px-2 py-1 text-[11px]"
                              >
                                Abrir
                              </Link>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">
                                —
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="ui-dashboard-panel space-y-3">
          <div>
            <h2 className="text-base font-semibold">
              Histórico anual · {year}
            </h2>
            <p className="text-sm text-muted-foreground">
              Visão compacta por mês. Verde finalizado · amarelo em andamento ·
              vermelho erro · cinza sem dado.
            </p>
          </div>

          <div className="overflow-auto rounded-[var(--radius-md)] border border-border">
            <table className="w-full min-w-[42rem] border-collapse text-sm">
              <thead className="sticky top-0 z-20 bg-[var(--surface-elevated)]">
                <tr className="border-b border-border text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  <th className="sticky left-0 z-30 bg-[var(--surface-elevated)] px-3 py-2.5 shadow-[1px_0_0_var(--border)]">
                    Developer
                  </th>
                  {months.map((ym) => (
                    <th
                      key={ym}
                      className={cn(
                        "px-1.5 py-2.5 text-center",
                        ym === selectedYearMonth && "text-foreground",
                      )}
                    >
                      {shortMonthLabel(ym)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {developers
                  .filter((dev) => {
                    const q = query.trim().toLowerCase();
                    return !q || dev.fullName.toLowerCase().includes(q);
                  })
                  .map((developer) => (
                    <tr
                      key={developer.id}
                      className="border-b border-border/70 hover:bg-muted/30"
                    >
                      <td className="sticky left-0 z-10 bg-[var(--surface-elevated)] px-3 py-2 shadow-[1px_0_0_var(--border)]">
                        <p className="truncate font-medium">
                          {developer.fullName}
                        </p>
                      </td>
                      {months.map((ym) => {
                        const cell = developer.cellsByMonth[ym];
                        const tone = cell
                          ? yearCellTone(cell.opsStatus)
                          : "gray";
                        const title = cell
                          ? `${developer.fullName} · ${formatYearMonthLabel(ym)} · ${FECHAMENTO_OPS_STATUS_LABELS[cell.opsStatus]}`
                          : `${developer.fullName} · ${formatYearMonthLabel(ym)} · Sem dado`;
                        return (
                          <td key={ym} className="px-1.5 py-2 text-center">
                            <YearCellDot
                              tone={tone}
                              title={title}
                              onClick={() => {
                                if (cell) {
                                  openCell(developer, cell);
                                  return;
                                }
                                openCell(
                                  developer,
                                  buildFechamentoOpsCell({
                                    yearMonth: ym,
                                    closing: null,
                                    presence: null,
                                    financeiro: null,
                                    rh: null,
                                    colaborador: null,
                                    requireMealPix:
                                      developer.requireMealPix,
                                  }),
                                );
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <GestorClosingOpsDrawer
        open={drawerOpen}
        target={drawerTarget}
        onClose={() => setDrawerOpen(false)}
        sendTypeIds={sendTypeIds}
      />
    </>
  );
}
