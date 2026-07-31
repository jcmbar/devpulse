import Link from "next/link";
import { CompiladoDateFilter } from "@/components/compilado-date-filter";
import { CompiladoProvenanceBadge } from "@/components/compilado-provenance-badge";
import {
  GestorMetricAuditButton,
  type GestorAuditFilterContext,
} from "@/components/gestor/metric-audit-button";
import { RunSyncNowButton } from "@/components/gestor/run-sync-now-button";
import { GestorSourceFilter } from "@/components/gestor-source-filter";
import { ImportBatchSelector } from "@/components/import-batch-selector";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { PerformanceBandsLegend } from "@/components/performance-bands-legend";
import { DataTable } from "@/components/surface";
import { KpiMetricCard } from "@/components/ui/kpi-metric-card";
import { FilterBar, SectionShell } from "@/components/ui/section-shell";
import { requireTeamAccess } from "@/lib/auth/permissions";
import {
  formatDateRangeLabel,
  resolveCompiladoDateRange,
} from "@/lib/metrics/date-range";
import {
  formatDeliveryIndex,
  formatDeliveryIndexTooltip,
  formatUtilizationBreakdownTooltip,
} from "@/lib/metrics/developer-period";
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
  type CapacitySignal,
  type GestorRankingRow,
} from "@/services/gestor/dashboard";
import { listJiraIntegrations } from "@/services/integrations/jira";

type GestorPageProps = {
  searchParams: Promise<{
    importId?: string;
    from?: string;
    to?: string;
    month?: string;
    source?: string;
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

function capacitySignalLabel(signal: CapacitySignal): string {
  switch (signal) {
    case "under":
      return "Abaixo da meta";
    case "over":
      return "Acima da meta";
    case "balanced":
      return "Na meta";
    case "unknown":
      return "Sem meta";
  }
}

function capacitySignalClass(signal: CapacitySignal): string {
  switch (signal) {
    case "under":
      return "text-sky-800 dark:text-sky-200";
    case "over":
      return "text-amber-800 dark:text-amber-200";
    case "balanced":
      return "text-emerald-800 dark:text-emerald-200";
    case "unknown":
      return "text-muted-foreground";
  }
}

function capacitySourceLabel(source: GestorRankingRow["capacitySource"]): string {
  switch (source) {
    case "override":
      return "override";
    case "mixed":
      return "misto (padrão + override)";
    case "team_default":
      return "padrão do time";
    case "missing":
      return "sem meta";
  }
}

function CapacityCell({ row }: { row: GestorRankingRow }) {
  if (row.requiredHours == null) {
    return (
      <span className="text-muted-foreground" title="Configure em Capacidade e faixas">
        Sem meta
      </span>
    );
  }

  const segmentHint =
    row.capacitySegments.length > 1
      ? row.capacitySegments
          .map(
            (segment) =>
              `${segment.yearMonth}: ${segment.hours.toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
              })}h`,
          )
          .join(" + ")
      : null;

  const holidayHint =
    row.appliedHolidays.length > 0
      ? row.appliedHolidays
          .map(
            (item) =>
              `${item.date} ${item.name} (−${item.hoursExcluded.toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
              })}h, ${item.reason})`,
          )
          .join("; ")
      : null;

  const contextHint = [
    row.holidayContext.stateCode
      ? `estado ${row.holidayContext.stateCode}`
      : null,
    row.holidayContext.cityCode
      ? `cidade ${row.holidayContext.cityCode}`
      : null,
    row.holidayContext.teamName
      ? `time ${row.holidayContext.teamName}`
      : row.holidayContext.teamCode
        ? `time ${row.holidayContext.teamCode}`
        : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-0.5">
      <p className="font-medium">
        {formatHours(row.metrics.totalTimeSpentHours)} /{" "}
        {formatHours(row.requiredHours)}
      </p>
      <p className={`text-xs ${capacitySignalClass(row.capacitySignal)}`}>
        {capacitySignalLabel(row.capacitySignal)}
        {row.capacityDeltaHours != null && row.capacityDeltaHours !== 0
          ? ` (${row.capacityDeltaHours > 0 ? "+" : ""}${formatHours(row.capacityDeltaHours)})`
          : ""}
      </p>
      <p className="text-xs text-muted-foreground">
        {capacitySourceLabel(row.capacitySource)}
      </p>
      {segmentHint ? (
        <p className="text-xs text-muted-foreground" title={segmentHint}>
          {segmentHint}
        </p>
      ) : null}
      {holidayHint ? (
        <p className="text-xs text-muted-foreground" title={holidayHint}>
          Feriados −{formatHours(row.holidayHoursExcluded)}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {contextHint
            ? `Contexto: ${contextHint}`
            : "Só nacionais (sem estado/cidade/time)"}
        </p>
      )}
    </div>
  );
}

export default async function GestorDashboardPage({
  searchParams,
}: GestorPageProps) {
  await requireTeamAccess();
  const params = await searchParams;
  const dataSource = parseCompiladoSourceMode(params.source);

  const [seed, jiraIntegrations] = await Promise.all([
    resolveCompiladoSnapshot({
      mode: dataSource,
      importId: params.importId ?? null,
      dateRange: null,
    }),
    listJiraIntegrations(),
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
  });

  const selectedImportId = dashboard.selectedBatch?.id ?? null;
  const { teamMetrics, ranking, monthlyMatrix, thresholds, provenance } =
    dashboard;
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
    month:
      dateRange.mode === "month" ? dateRange.month ?? undefined : undefined,
    from: dateRange.mode === "custom" ? dateRange.start : undefined,
    to: dateRange.mode === "custom" ? dateRange.end : undefined,
  };

  const syncTarget =
    jiraIntegrations.find((row) => row.is_enabled) ??
    jiraIntegrations[0] ??
    null;

  const emptySourceMessage =
    dataSource === "jira"
      ? "Não há lotes Compilado materializados da sync Jira (imports.source = jira). Use “Rodar Sync Agora” ou materialize em /app/jira."
      : dataSource === "manuais"
        ? "Não há lotes concluídos de importação manual (spreadsheet) para este filtro."
        : "Importe uma planilha concluída (ou materialize um lote Jira Compilado) para ver o ranking e a matriz do time.";

  return (
    <PageShell size="full">
      <PageHeader
        eyebrow="Operação"
        title="Dashboard do gestor"
        description={
          <>
            Compilado do time ·{" "}
            <span className="font-medium text-foreground">
              {formatDateRangeLabel(dateRange)}
            </span>
            {" · "}
            Ranking por Índice de Entrega e Aproveitamento.
          </>
        }
        actions={
          <div className="flex w-full flex-col gap-2 sm:items-end">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              <Link href={analiticoHref} className="ui-btn-secondary justify-center">
                Visão analítica
              </Link>
              <Link href={configHref} className="ui-btn-secondary justify-center">
                Capacidade
              </Link>
            </div>
            {syncTarget ? (
              <RunSyncNowButton
                integrationId={syncTarget.id}
                teamId={syncTarget.team_id}
              />
            ) : (
              <Link href="/app/jira" className="ui-btn-primary w-full text-center sm:w-auto">
                Configurar Jira
              </Link>
            )}
          </div>
        }
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

          <div className="ui-filter-bar__fields">
            <div className="ui-filter-bar__field">
              <p className="ui-filter-bar__label">Fonte</p>
              <GestorSourceFilter
                basePath="/app/gestor"
                selected={dataSource}
                preservedParams={{
                  month: preservedWithSource.month,
                  from: preservedWithSource.from,
                  to: preservedWithSource.to,
                }}
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
                  month: preservedWithSource.month,
                  from: preservedWithSource.from,
                  to: preservedWithSource.to,
                }}
                embedded
              />
            </div>
          </div>

          <CompiladoDateFilter
            basePath="/app/gestor"
            importId={selectedImportId}
            activeRange={dateRange}
            monthOptions={dashboard.monthOptions}
            preservedParams={{ source: sourceParam }}
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
            title="Resumo do time"
            description={
              <>
                Indicadores com Entrega TU em{" "}
                <span className="font-medium text-foreground">
                  {formatDateRangeLabel(dateRange)}
                </span>
                . Fonte: {compiladoSourceModeLabel(dataSource)}.
              </>
            }
          >
            <div className="ui-kpi-grid">
              <KpiMetricCard
                label="Developers ativos"
                value={String(dashboard.activeDevelopersCount)}
                tone="info"
              />
              <KpiMetricCard
                label="Com cards no período"
                value={String(dashboard.developersWithCardsCount)}
                tone="info"
              />
              <KpiMetricCard
                label="Cards"
                value={String(teamMetrics.totalCards)}
                tone="info"
                hint="Entrega TU no período"
              />
              <KpiMetricCard
                label="Aproveitamento"
                value={formatPercent(teamMetrics.utilizationRate)}
                tone="brand"
                title={formatUtilizationBreakdownTooltip(teamMetrics)}
                hint={
                  <>
                    C {teamMetrics.totalCards} · P{" "}
                    {teamMetrics.utilizationPenalty} · C_aprov{" "}
                    {teamMetrics.utilizedCardEquivalents}
                  </>
                }
              />
              <KpiMetricCard
                label="Índice de Entrega"
                value={formatDeliveryIndex(teamMetrics.deliveryIndex)}
                tone="brand"
                title={formatDeliveryIndexTooltip(teamMetrics)}
                hint="Q × √C (time)"
              />
              <KpiMetricCard
                label="No prazo"
                value={String(teamMetrics.onTimeCards)}
                tone="success"
              />
              <KpiMetricCard
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
                label="Retrabalho"
                value={String(teamMetrics.reworkCards)}
                tone={teamMetrics.reworkCards > 0 ? "warning" : "neutral"}
              />
              <KpiMetricCard
                label="Diff horas"
                value={formatHours(teamMetrics.totalDifferenceHours)}
                tone={
                  teamMetrics.totalDifferenceHours > 0
                    ? "warning"
                    : teamMetrics.totalDifferenceHours < 0
                      ? "success"
                      : "neutral"
                }
                hint="gasto − estimado"
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
              {dashboard.capacityPeriod.spansMultipleMonths ? (
                <p>
                  Intervalo multi-mês: Capacidade no ranking soma a meta
                  prorrateada; a matriz mostra aproveitamento mês a mês.
                </p>
              ) : null}
            </div>
          </SectionShell>

          <SectionShell
            title="Ranking do período"
            description={
              <>
                Ordenado por Índice de Entrega (qualidade × √volume). Atraso
                líquido no ranking; auditoria preserva bruto e justificativas.
                Fonte: {compiladoSourceModeLabel(dataSource)}.
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
              <DataTable
                minWidthClassName="min-w-0 lg:min-w-[1080px]"
                stickyFirstColumn
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
                    <th title="Qualidade da entrega: max(0, (C − P) / C); P = 1·atraso líquido + 2·retrabalho">
                      Aprov.
                    </th>
                    <th title="Índice = Aproveitamento × raiz quadrada dos cards entregues.">
                      Índice
                    </th>
                    <th className="hidden lg:table-cell">Cadastro</th>
                    <th className="hidden lg:table-cell">Capacidade</th>
                    <th className="hidden lg:table-cell">Diff horas</th>
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
                        />
                      </td>
                      <td className="hidden lg:table-cell">
                        <GestorMetricAuditButton
                          metric="rework"
                          count={row.metrics.reworkCards}
                          displayValue={row.metrics.reworkWeightTotal}
                          developerId={row.developerId}
                          developerName={row.fullName}
                          filterContext={auditFilterContext}
                        />
                      </td>
                      <td
                        className={`whitespace-nowrap font-medium ${tone(row.metrics.utilizationRate)}`}
                        title={formatUtilizationBreakdownTooltip(row.metrics)}
                      >
                        {formatPercent(row.metrics.utilizationRate)}
                      </td>
                      <td
                        className="whitespace-nowrap font-medium"
                        title={formatDeliveryIndexTooltip(row.metrics)}
                      >
                        {formatDeliveryIndex(row.metrics.deliveryIndex)}
                      </td>
                      <td className="hidden lg:table-cell">
                        {row.isActive ? "Ativo" : "Inativo"}
                      </td>
                      <td className="hidden lg:table-cell">
                        <CapacityCell row={row} />
                      </td>
                      <td className="hidden lg:table-cell whitespace-nowrap">
                        {formatHours(row.metrics.totalDifferenceHours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </SectionShell>

          <SectionShell
            title="Matriz mensal"
            description={
              <>
                Aproveitamento por mês em{" "}
                <span className="font-medium text-foreground">
                  {formatDateRangeLabel(dateRange)}
                </span>
                {" "}
                (cards entre parênteses). Fonte:{" "}
                {compiladoSourceModeLabel(dataSource)}.
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
                minWidthClassName="min-w-0 md:min-w-[720px]"
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
                          className={`whitespace-nowrap ${tone(cell.utilizationRate)} ${cell.cardsCount > 0 ? bandSurface(cell.utilizationRate) : ""}`}
                        >
                          {cell.cardsCount === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <>
                              {formatPercent(cell.utilizationRate)}
                              <span className="text-muted-foreground">
                                {" "}
                                ({cell.cardsCount})
                              </span>
                            </>
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
