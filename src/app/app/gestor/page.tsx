import Link from "next/link";
import { CompiladoDateFilter } from "@/components/compilado-date-filter";
import { CompiladoProvenanceBadge } from "@/components/compilado-provenance-badge";
import {
  DashboardComplementGrid,
  DashboardRankList,
} from "@/components/dashboard/dashboard-complement-grid";
import { MonthlyTrendChart } from "@/components/dashboard/monthly-trend-chart";
import {
  GestorMetricAuditButton,
  type GestorAuditFilterContext,
} from "@/components/gestor/metric-audit-button";
import { RunSyncNowButton } from "@/components/gestor/run-sync-now-button";
import { GestorAutoSyncTrigger } from "@/components/gestor/gestor-auto-sync-trigger";
import { GestorSyncStatus } from "@/components/gestor/gestor-sync-status";
import { GestorSourceFilter } from "@/components/gestor-source-filter";
import { GestorTeamFilter } from "@/components/gestor-team-filter";
import { ImportBatchSelector } from "@/components/import-batch-selector";
import { FilterPersistenceSync } from "@/components/filters/filter-persistence-sync";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { PerformanceBandsLegend } from "@/components/performance-bands-legend";
import { DataTable } from "@/components/surface";
import { KpiMetricCard } from "@/components/ui/kpi-metric-card";
import { FilterBar, SectionShell } from "@/components/ui/section-shell";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { restorePersistedFiltersOrRedirect } from "@/lib/filters/persist-server";
import {
  formatDateRangeLabel,
  resolveCompiladoDateRange,
} from "@/lib/metrics/date-range";
import {
  formatDeliveryIndex,
} from "@/lib/metrics/developer-period";
import { buildMonthlyTrendFromMatrix } from "@/lib/metrics/monthly-trend";
import {
  buildDeliveryIndexCalcExplain,
  buildUtilizationCalcExplain,
} from "@/lib/metrics/metric-calc-explain";
import { RankingMetricsLegend } from "@/components/gestor/ranking-metrics-legend";
import { MetricCalcTooltip } from "@/components/ui/metric-calc-tooltip";
import { AppViewTabs } from "@/components/ui/app-view-tabs";
import { buildGestorNavTabs } from "@/lib/gestor/nav-tabs";
import { buildGestorAnaliticoHref } from "@/lib/metrics/gestor-analitico-href";
import {
  compiladoSourceModeLabel,
  parseCompiladoSourceMode,
} from "@/lib/metrics/gestor-data-source";
import {
  performanceBandSurfaceClass,
  performanceBandTextClass,
  resolvePerformanceBand,
} from "@/lib/metrics/performance-bands";
import { resolveCompiladoSnapshot } from "@/services/compilado/resolve-snapshot";
import {
  formatGestorMonthLabel,
  getGestorDashboard,
} from "@/services/gestor/dashboard";
import { listJiraIntegrations } from "@/services/integrations/jira";
import { listTeamsAdmin } from "@/services/teams";
import type { DeveloperPeriodMetrics } from "@/types/developer-period-metrics";
import {
  parseTeamListFilter,
  teamListFilterParam,
} from "@/lib/teams/team-filter";

type GestorPageProps = {
  searchParams: Promise<{
    importId?: string;
    from?: string;
    to?: string;
    month?: string;
    source?: string;
    teamId?: string;
  }>;
};

function formatHours(value: number): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })} h`;
}

function formatPercent(value: number | null): string {
  if (value == null) {
    return "—";
  }

  return `${(value * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`;
}

const ESTIMATE_BALANCE_EPSILON_HOURS = 0.5;

function EstimateVsActualCell({
  metrics,
}: {
  metrics: Pick<
    DeveloperPeriodMetrics,
    "totalTimeSpentHours" | "totalEstimateHours" | "totalDifferenceHours"
  >;
}) {
  const realized = metrics.totalTimeSpentHours;
  const planned = metrics.totalEstimateHours;
  const delta = metrics.totalDifferenceHours;
  const absDelta = Math.abs(delta);

  if (planned <= 0 && realized <= 0) {
    return <span className="text-muted-foreground">Sem horas</span>;
  }

  let reading: string;
  let readingClass = "text-muted-foreground";

  if (planned <= 0) {
    reading = "Sem estimado no Jira";
  } else if (absDelta < ESTIMATE_BALANCE_EPSILON_HOURS) {
    reading = "Dentro do previsto";
    readingClass = "text-emerald-800 dark:text-emerald-200";
  } else if (delta < 0) {
    reading = `${formatHours(absDelta)} de antecedência`;
    readingClass = "text-sky-800 dark:text-sky-200";
  } else {
    reading = `${formatHours(absDelta)} de estouro`;
    readingClass = "text-amber-800 dark:text-amber-200";
  }

  return (
    <div
      className="space-y-0.5"
      title={`Realizado ${formatHours(realized)} · Previsto (estimate_hours) ${formatHours(planned)} · Diff ${delta > 0 ? "+" : ""}${formatHours(delta)}`}
    >
      <p className="font-medium whitespace-nowrap">
        {formatHours(realized)} / {formatHours(planned)}
      </p>
      <p className={`text-xs ${readingClass}`}>{reading}</p>
    </div>
  );
}

export default async function GestorDashboardPage({
  searchParams,
}: GestorPageProps) {
  await requireTeamAccess();
  const params = await searchParams;
  await restorePersistedFiltersOrRedirect({
    scope: "gestor-dashboard",
    pathname: "/app/gestor",
    searchParams: params,
  });
  const dataSource = parseCompiladoSourceMode(params.source);
  const teamFilter = parseTeamListFilter(params.teamId);
  const selectedTeamId =
    teamFilter.kind === "team" ? teamFilter.teamId : null;
  const teamParam = teamListFilterParam(teamFilter) || undefined;

  const [seed, jiraIntegrations, teams] = await Promise.all([
    resolveCompiladoSnapshot({
      mode: dataSource,
      importId: params.importId ?? null,
      dateRange: null,
      teamId: selectedTeamId,
    }),
    listJiraIntegrations(),
    listTeamsAdmin(),
  ]);

  const dateRange = resolveCompiladoDateRange({
    searchParams: {
      from: params.from,
      to: params.to,
      month: params.month,
    },
    defaultStart: seed.selectedBatch?.period_start ?? null,
    defaultEnd: seed.selectedBatch?.period_end ?? null,
  });

  const dashboard = await getGestorDashboard({
    // Only pass URL override — auto resolution happens inside getGestorDashboard.
    importId: params.importId ?? null,
    dateRange,
    dataSource,
    teamId: selectedTeamId,
  });

  const selectedImportId = dashboard.selectedBatch?.id ?? null;
  const { teamMetrics, ranking, monthlyMatrix, thresholds, provenance } =
    dashboard;
  const monthlyTrend = buildMonthlyTrendFromMatrix(monthlyMatrix);
  const pendingJustifications = ranking.reduce(
    (sum, row) =>
      sum + row.pendingDelayJustifications + row.pendingReworkJustifications,
    0,
  );
  const auditFilterContext: GestorAuditFilterContext = {
    importId: selectedImportId,
    from: dateRange.start,
    to: dateRange.end,
    mode: dateRange.mode,
    month: dateRange.month,
    source: dataSource,
  };
  const analiticoHref = buildGestorAnaliticoHref({
    importId: selectedImportId,
    from: dateRange.mode === "custom" ? dateRange.start : null,
    to: dateRange.mode === "custom" ? dateRange.end : null,
    month: dateRange.mode === "month" ? dateRange.month : null,
    source: dataSource,
    teamId: selectedTeamId,
  });
  const tone = (rate: number | null) =>
    performanceBandTextClass(resolvePerformanceBand(rate, thresholds));
  const bandSurface = (rate: number | null) =>
    performanceBandSurfaceClass(resolvePerformanceBand(rate, thresholds));

  const configYearMonth = dashboard.capacityPeriod.primaryYearMonth;
  const configHref = configYearMonth
    ? `/app/gestor/config?year=${configYearMonth.slice(0, 4)}&month=${Number(configYearMonth.slice(5, 7))}`
    : "/app/gestor/config";

  const sourceParam = dataSource === "auto" ? undefined : dataSource;
  const preservedWithSource = {
    source: sourceParam,
    teamId: teamParam,
    month:
      dateRange.mode === "month" ? dateRange.month ?? undefined : undefined,
    from: dateRange.mode === "custom" ? dateRange.start : undefined,
    to: dateRange.mode === "custom" ? dateRange.end : undefined,
  };

  const selectedTeamName =
    selectedTeamId != null
      ? (teams.find((team) => team.id === selectedTeamId)?.name ?? null)
      : null;

  const syncTarget =
    (selectedTeamId
      ? jiraIntegrations.find(
          (row) => row.team_id === selectedTeamId && row.is_enabled,
        ) ??
        jiraIntegrations.find((row) => row.team_id === selectedTeamId)
      : null) ??
    jiraIntegrations.find((row) => row.is_enabled) ??
    jiraIntegrations[0] ??
    null;

  const autoSyncScope = selectedTeamId
    ? jiraIntegrations.filter(
        (row) => row.team_id === selectedTeamId && row.is_enabled,
      )
    : jiraIntegrations.filter((row) => row.is_enabled);

  const autoSyncIntegrationIds = autoSyncScope.map((row) => row.id);

  const emptySourceMessage =
    dataSource === "jira"
      ? "Não há lotes Compilado materializados da sync Jira (imports.source = jira). Use “Rodar Sync Agora” ou materialize em /app/jira."
      : dataSource === "manuais"
        ? "Não há lotes concluídos de importação manual (spreadsheet) para este filtro."
        : "Importe uma planilha concluída (ou materialize um lote Jira Compilado) para ver o ranking e a matriz do time.";

  return (
    <PageShell size="full">
      <FilterPersistenceSync
        scope="gestor-dashboard"
        params={{
          teamId: teamParam,
          source: sourceParam,
          month:
            dateRange.mode === "month" ? (dateRange.month ?? undefined) : undefined,
          from: dateRange.mode === "custom" ? dateRange.start : undefined,
          to: dateRange.mode === "custom" ? dateRange.end : undefined,
        }}
      />
      <GestorAutoSyncTrigger teamId={selectedTeamId} />
      <PageHeader
        eyebrow="Operação"
        title="Dashboard do gestor"
        description={
          <>
            Compilado
            {selectedTeamName ? (
              <>
                {" "}
                ·{" "}
                <span className="font-medium text-foreground">
                  {selectedTeamName}
                </span>
              </>
            ) : (
              " · todos os times"
            )}
            {" · "}
            <span className="font-medium text-foreground">
              {formatDateRangeLabel(dateRange)}
            </span>
            {" · "}
            Ranking por Índice de Entrega e Aproveitamento.
          </>
        }
        actions={
          <div className="flex w-full flex-wrap items-center gap-1.5 sm:justify-end">
            <Link href={analiticoHref} className="ui-btn-secondary">
              Visão analítica
            </Link>
            <Link href={configHref} className="ui-btn-secondary">
              Capacidade
            </Link>
            {syncTarget ? (
              <div className="flex w-full flex-col items-stretch gap-1.5 sm:w-auto sm:items-end">
                {autoSyncIntegrationIds.length > 0 ? (
                  <GestorSyncStatus
                    integrationIds={autoSyncIntegrationIds}
                  />
                ) : null}
                <RunSyncNowButton
                  integrationId={syncTarget.id}
                  teamId={syncTarget.team_id}
                />
              </div>
            ) : (
              <Link href="/app/jira" className="ui-btn-primary">
                Configurar Jira
              </Link>
            )}
          </div>
        }
      />

      <AppViewTabs
        tabs={buildGestorNavTabs({
          active: "dashboard",
          teamId: teamParam,
        })}
      />

      <FilterBar>
        <div className="min-w-0 space-y-3">
          {provenance ? (
            <CompiladoProvenanceBadge
              resolvedSource={provenance.resolvedSource}
              resolvedAt={provenance.resolvedAt}
              resolutionReason={provenance.resolutionReason}
              jiraCloudNewerThanSnapshot={provenance.jiraCloudNewerThanSnapshot}
              jiraCloudSyncAt={provenance.jiraCloudSyncAt}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma origem Compilado resolvida ainda.
            </p>
          )}

          <div className="ui-filter-bar__fields lg:grid-cols-3">
            <div className="ui-filter-bar__field">
              <p className="ui-filter-bar__label">Time</p>
              <GestorTeamFilter
                basePath="/app/gestor"
                teams={teams}
                selectedTeamId={selectedTeamId}
                preservedParams={{
                  source: sourceParam,
                  month: preservedWithSource.month,
                  from: preservedWithSource.from,
                  to: preservedWithSource.to,
                }}
                persistScope="gestor-dashboard"
                embedded
              />
            </div>
            <div className="ui-filter-bar__field">
              <p className="ui-filter-bar__label">Fonte</p>
              <GestorSourceFilter
                basePath="/app/gestor"
                selected={dataSource}
                preservedParams={{
                  teamId: teamParam,
                  month: preservedWithSource.month,
                  from: preservedWithSource.from,
                  to: preservedWithSource.to,
                }}
                persistScope="gestor-dashboard"
                embedded
              />
            </div>
            <div className="ui-filter-bar__field">
              <p className="ui-filter-bar__label">Lote</p>
              <ImportBatchSelector
                batches={dashboard.batches}
                selectedImportId={selectedImportId}
                basePath="/app/gestor"
                preservedParams={{
                  source: sourceParam,
                  teamId: teamParam,
                  month: preservedWithSource.month,
                  from: preservedWithSource.from,
                  to: preservedWithSource.to,
                }}
                persistScope="gestor-dashboard"
                embedded
              />
            </div>
          </div>

          <CompiladoDateFilter
            basePath="/app/gestor"
            importId={selectedImportId}
            activeRange={dateRange}
            monthOptions={dashboard.monthOptions}
            preservedParams={{ source: sourceParam, teamId: teamParam }}
            persistScope="gestor-dashboard"
            embedded
          />
        </div>
      </FilterBar>

      {dashboard.selectedBatch == null ? (
        <div className="space-y-2 rounded-[var(--radius-sm)] border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <p className="font-medium text-foreground">
            Sem dados para o modo “{compiladoSourceModeLabel(dataSource)}”
          </p>
          <p className="text-muted-foreground">{emptySourceMessage}</p>
        </div>
      ) : (
        <>
          <SectionShell
            title="Indicadores do time"
            description={
              <>
                Entrega TU em{" "}
                <span className="font-medium text-foreground">
                  {formatDateRangeLabel(dateRange)}
                </span>
                . Fonte: {compiladoSourceModeLabel(dataSource)}.
              </>
            }
          >
            <div className="ui-kpi-grid--hero">
              <KpiMetricCard
                variant="hero"
                label="Developers ativos"
                value={String(dashboard.activeDevelopersCount)}
                tone="info"
              />
              <KpiMetricCard
                variant="hero"
                label="Com cards"
                value={String(dashboard.developersWithCardsCount)}
                tone="info"
                hint="No período filtrado"
              />
              <KpiMetricCard
                variant="hero"
                label="Cards"
                value={String(teamMetrics.totalCards)}
                tone="info"
                hint="Entrega TU no período"
              />
              <KpiMetricCard
                variant="hero"
                label="Aproveitamento"
                value={
                  <MetricCalcTooltip
                    explain={buildUtilizationCalcExplain(teamMetrics)}
                  >
                    {formatPercent(teamMetrics.utilizationRate)}
                  </MetricCalcTooltip>
                }
                tone="brand"
                hint={
                  <>
                    C {teamMetrics.totalCards} · P{" "}
                    {teamMetrics.utilizationPenalty}
                  </>
                }
              />
              <KpiMetricCard
                variant="hero"
                label="Índice de Entrega"
                value={
                  <MetricCalcTooltip
                    explain={buildDeliveryIndexCalcExplain(teamMetrics)}
                  >
                    {formatDeliveryIndex(teamMetrics.deliveryIndex)}
                  </MetricCalcTooltip>
                }
                tone="brand"
                hint="Q × √C (time)"
              />
              <KpiMetricCard
                variant="hero"
                label="No prazo"
                value={String(teamMetrics.onTimeCards)}
                tone="success"
              />
              <KpiMetricCard
                variant="hero"
                label="Atraso"
                value={String(teamMetrics.delayedCardsNet)}
                tone={teamMetrics.delayedCardsNet > 0 ? "danger" : "neutral"}
                hint={
                  teamMetrics.delayedCardsAccepted > 0
                    ? `bruto ${teamMetrics.delayedCardsGross} · acatado ${teamMetrics.delayedCardsAccepted}`
                    : "Líquido (após aceites)"
                }
              />
              <KpiMetricCard
                variant="hero"
                label="Retrabalho"
                value={String(teamMetrics.reworkCards)}
                tone={teamMetrics.reworkCards > 0 ? "warning" : "neutral"}
              />
              <KpiMetricCard
                variant="hero"
                label="Atenção"
                value={String(teamMetrics.incompleteCards)}
                tone={
                  teamMetrics.incompleteCards > 0 ? "warning" : "neutral"
                }
                hint="Sem data limite / prazo no Jira"
              />
            </div>

            <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
              {dashboard.teamDefaultRequiredHours != null ? (
                <p>
                  Meta de capacidade (
                  <span className="font-medium text-foreground">
                    {dashboard.capacityPeriod.start} →{" "}
                    {dashboard.capacityPeriod.end}
                  </span>
                  ):{" "}
                  <span className="font-medium text-foreground">
                    {formatHours(dashboard.teamDefaultRequiredHours)}
                  </span>
                  {dashboard.capacityPeriod.spansMultipleMonths
                    ? " · prorrateada entre meses"
                    : ""}
                  .
                </p>
              ) : (
                <p className="text-warning">
                  Capacidade do time ainda não configurada. Defina em{" "}
                  <Link
                    href={configHref}
                    className="underline underline-offset-4"
                  >
                    Capacidade e faixas
                  </Link>
                  .
                </p>
              )}
              {dashboard.holidayImpact.affected ? (
                <p>
                  Feriados reduziram a referência em{" "}
                  <span className="font-medium text-foreground">
                    {formatHours(dashboard.holidayImpact.hoursExcluded)}
                  </span>
                  :{" "}
                  {dashboard.holidayImpact.impactingHolidays
                    .map(
                      (item) =>
                        `${item.date} (${item.name}, −${formatHours(item.hoursExcluded)})`,
                    )
                    .join("; ")}
                  . {dashboard.holidayScopeNote}
                </p>
              ) : (
                <p>{dashboard.holidayScopeNote}</p>
              )}
            </div>
          </SectionShell>

          <MonthlyTrendChart
            title="Acompanhamento mensal do time"
            description="Série mensal a partir da matriz Compilado já calculada para o filtro."
            points={monthlyTrend}
            averagesNote
          />

          <DashboardComplementGrid
            mixTitle="Qualidade do time"
            mixItems={[
              {
                label: "No prazo",
                value: teamMetrics.onTimeCards,
                total: teamMetrics.totalCards,
                tone: "success",
              },
              {
                label: "Atraso líquido",
                value: teamMetrics.delayedCardsNet,
                total: teamMetrics.totalCards,
                tone: "danger",
                detail:
                  teamMetrics.delayedCardsAccepted > 0
                    ? `bruto ${teamMetrics.delayedCardsGross} · acatado ${teamMetrics.delayedCardsAccepted}`
                    : undefined,
              },
              {
                label: "Retrabalho",
                value: teamMetrics.reworkCards,
                total: teamMetrics.totalCards,
                tone: "warning",
                detail:
                  teamMetrics.reworkWeightTotal > 0
                    ? `peso ${teamMetrics.reworkWeightTotal}`
                    : undefined,
              },
              {
                label: "Atenção (dados faltantes)",
                value: teamMetrics.incompleteCards,
                total: teamMetrics.totalCards,
                tone: "warning",
                detail:
                  teamMetrics.incompleteCards > 0
                    ? "Sem due_on — fora de No prazo/Atraso"
                    : undefined,
              },
            ]}
            hoursTitle="Previsto × realizado"
            hoursItems={[
              {
                label: "Previsto",
                value: formatHours(teamMetrics.totalEstimateHours),
              },
              {
                label: "Realizado",
                value: formatHours(teamMetrics.totalTimeSpentHours),
              },
              {
                label: "Diff",
                value: formatHours(teamMetrics.totalDifferenceHours),
                hint: "gasto − estimado",
              },
              {
                label: "Justificativas pendentes",
                value: String(pendingJustifications),
                hint: "Atraso + retrabalho no ranking",
              },
            ]}
            thirdTitle="Topo do ranking"
            thirdDescription="Mesma ordenação do ranking completo (Índice de Entrega)."
            thirdContent={
              <DashboardRankList
                items={ranking.slice(0, 5).map((row) => ({
                  name: row.fullName,
                  href: `/app/developers/${row.developerId}`,
                  meta: `Índ. ${formatDeliveryIndex(row.metrics.deliveryIndex)} · ${formatPercent(row.metrics.utilizationRate)}`,
                }))}
              />
            }
          />

          <SectionShell
            title="Ranking do período"
            description={
              <>
                Ordenado por Índice de Entrega (qualidade × √volume). Atraso e
                retrabalho líquidos no ranking; auditoria preserva bruto e
                justificativas separadas. Fonte:{" "}
                {compiladoSourceModeLabel(dataSource)}.
              </>
            }
            actions={
              <Link
                href={analiticoHref}
                className="text-sm font-medium text-brand underline-offset-4 hover:underline"
              >
                Visão analítica
              </Link>
            }
          >
            {teamMetrics.totalCards === 0 ? (
              <div className="mb-4 space-y-2 rounded-[var(--radius-sm)] border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
                <p className="font-medium text-foreground">
                  Time sem cards neste filtro (
                  {compiladoSourceModeLabel(dataSource)})
                </p>
                <p className="text-muted-foreground">
                  Não há Entrega TU em{" "}
                  <span className="font-medium text-foreground">
                    {formatDateRangeLabel(dateRange)}
                  </span>{" "}
                  com developer vinculado. Ajuste o mês/intervalo ou a fonte.
                </p>
              </div>
            ) : null}

            {ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum developer para exibir neste período.
              </p>
            ) : (
              <div className="space-y-3">
                <RankingMetricsLegend />
                <DataTable
                  minWidthClassName="min-w-0 lg:min-w-[1160px]"
                  stickyFirstColumn
                  metricGrid
                >
                <thead>
                  <tr>
                    <th>Developer</th>
                    <th>Cards</th>
                    <th className="hidden md:table-cell">No prazo</th>
                    <th title="Líquido = bruto − acatados. Clique abre a lista bruta.">
                      Atraso
                    </th>
                    <th
                      className="hidden lg:table-cell"
                      title="Soma dos pesos de Retrabalho / Retrabalho 2x / 3x em category"
                    >
                      Retrabalho
                    </th>
                    <th
                      title="Cards sem data limite (due_on) ou sem dados para classificar No prazo / Atraso. Clique para ver as chaves."
                    >
                      Atenção
                    </th>
                    <th title="Aproveitamento — qualidade da entrega. Toque no valor para ver o cálculo.">
                      Aprov.
                    </th>
                    <th title="Índice — qualidade × volume. Ordena o ranking. Toque no valor para ver o cálculo.">
                      Índice
                    </th>
                    <th className="hidden lg:table-cell">Cadastro</th>
                    <th
                      className="hidden lg:table-cell"
                      title="Realizado (time spent) / Previsto (estimate_hours). Diff = realizado − previsto."
                    >
                      Realizado × Previsto
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((row, index) => (
                    <tr key={row.developerId}>
                      <td>
                        <div className="flex min-w-[7.5rem] items-start gap-2 sm:min-w-[10rem]">
                          <span className="mt-0.5 w-4 shrink-0 text-xs text-muted-foreground tabular-nums">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <Link
                              href={`/app/developers/${row.developerId}`}
                              className="block truncate font-medium underline-offset-4 hover:underline"
                            >
                              {row.fullName}
                            </Link>
                            {row.email ? (
                              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                                {row.email}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td>
                        <GestorMetricAuditButton
                          metric="cards"
                          count={row.metrics.totalCards}
                          developerId={row.developerId}
                          developerName={row.fullName}
                          filterContext={auditFilterContext}
                        />
                      </td>
                      <td className="hidden md:table-cell">
                        <GestorMetricAuditButton
                          metric="onTime"
                          count={row.metrics.onTimeCards}
                          developerId={row.developerId}
                          developerName={row.fullName}
                          filterContext={auditFilterContext}
                        />
                      </td>
                      <td>
                        <GestorMetricAuditButton
                          metric="delayed"
                          count={row.metrics.delayedCardsGross}
                          displayValue={row.metrics.delayedCardsNet}
                          title={
                            row.metrics.delayedCardsGross > 0
                              ? `bruto ${row.metrics.delayedCardsGross} · acatado ${row.metrics.delayedCardsAccepted} · líquido ${row.metrics.delayedCardsNet}`
                              : undefined
                          }
                          developerId={row.developerId}
                          developerName={row.fullName}
                          filterContext={auditFilterContext}
                          pendingDecisionCount={row.pendingDelayJustifications}
                        />
                      </td>
                      <td className="hidden lg:table-cell">
                        <GestorMetricAuditButton
                          metric="rework"
                          count={row.metrics.reworkCards}
                          displayValue={row.metrics.reworkWeightTotal}
                          title={
                            row.metrics.reworkCards > 0
                              ? `bruto ${row.metrics.reworkCards} · acatado ${row.metrics.reworkCardsAccepted} · peso líquido ${row.metrics.reworkWeightTotal}`
                              : undefined
                          }
                          developerId={row.developerId}
                          developerName={row.fullName}
                          filterContext={auditFilterContext}
                          pendingDecisionCount={row.pendingReworkJustifications}
                        />
                      </td>
                      <td>
                        <GestorMetricAuditButton
                          metric="incomplete"
                          count={row.metrics.incompleteCards}
                          title={
                            row.metrics.incompleteCards > 0
                              ? `Cards sem classificação de prazo (ex.: due_on ausente). Total ${row.metrics.totalCards} ≠ no prazo ${row.metrics.onTimeCards} + atraso ${row.metrics.delayedCardsGross}.`
                              : undefined
                          }
                          developerId={row.developerId}
                          developerName={row.fullName}
                          filterContext={auditFilterContext}
                        />
                      </td>
                      <td
                        className={`whitespace-nowrap font-medium ${tone(row.metrics.utilizationRate)}`}
                      >
                        <MetricCalcTooltip
                          explain={buildUtilizationCalcExplain(row.metrics)}
                        >
                          {formatPercent(row.metrics.utilizationRate)}
                        </MetricCalcTooltip>
                      </td>
                      <td className="whitespace-nowrap font-medium">
                        <MetricCalcTooltip
                          explain={buildDeliveryIndexCalcExplain(row.metrics)}
                        >
                          {formatDeliveryIndex(row.metrics.deliveryIndex)}
                        </MetricCalcTooltip>
                      </td>
                      <td className="hidden lg:table-cell">
                        {row.isActive ? "Ativo" : "Inativo"}
                      </td>
                      <td className="hidden lg:table-cell">
                        <EstimateVsActualCell metrics={row.metrics} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                </DataTable>
              </div>
            )}
          </SectionShell>

          <SectionShell
            title="Matriz mensal"
            description={
              <>
                Aproveitamento e Índice por mês em{" "}
                <span className="font-medium text-foreground">
                  {formatDateRangeLabel(dateRange)}
                </span>
                . A cor segue a régua de aproveitamento. Toque nos valores para
                ver o cálculo. Fonte: {compiladoSourceModeLabel(dataSource)}.
              </>
            }
          >
            <div className="mb-4">
              <PerformanceBandsLegend thresholds={thresholds} />
            </div>

            {monthlyMatrix.months.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ainda não há entregas com data para montar a matriz nesta fonte.
              </p>
            ) : (
              <DataTable
                minWidthClassName="min-w-0 md:min-w-[860px]"
                stickyFirstColumn
              >
                <thead>
                  <tr>
                    <th>Developer</th>
                    {monthlyMatrix.months.map((month) => (
                      <th key={month} className="whitespace-nowrap">
                        {formatGestorMonthLabel(month)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthlyMatrix.rows.map((row) => (
                    <tr key={row.developerId}>
                      <td className="font-medium whitespace-nowrap">
                        {row.fullName}
                        {!row.isActive ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · inativo
                          </span>
                        ) : null}
                      </td>
                      {row.cells.map((cell) => (
                        <td
                          key={`${row.developerId}-${cell.month}`}
                          className={`align-top ${tone(cell.utilizationRate)} ${cell.cardsCount > 0 ? bandSurface(cell.utilizationRate) : ""}`}
                        >
                          {cell.cardsCount === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex min-w-[5.5rem] flex-col gap-0.5 py-0.5">
                              <MetricCalcTooltip
                                explain={buildUtilizationCalcExplain({
                                  totalCards: cell.cardsCount,
                                  delayedCardsNet: cell.delayedCardsNet,
                                  reworkWeightTotal: cell.reworkWeightTotal,
                                  utilizationRate: cell.utilizationRate ?? 0,
                                })}
                              >
                                <span className="font-medium">
                                  {formatPercent(cell.utilizationRate)}
                                </span>
                              </MetricCalcTooltip>
                              <MetricCalcTooltip
                                explain={buildDeliveryIndexCalcExplain({
                                  totalCards: cell.cardsCount,
                                  utilizationRate: cell.utilizationRate ?? 0,
                                  deliveryIndex: cell.deliveryIndex,
                                })}
                                className="text-xs"
                              >
                                <span className="tabular-nums">
                                  Índ. {formatDeliveryIndex(cell.deliveryIndex)}
                                </span>
                              </MetricCalcTooltip>
                              <span className="text-[10px] text-muted-foreground tabular-nums">
                                {cell.cardsCount} card
                                {cell.cardsCount === 1 ? "" : "s"}
                              </span>
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </SectionShell>
        </>
      )}
    </PageShell>
  );
}
