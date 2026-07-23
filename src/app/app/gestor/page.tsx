import Link from "next/link";
import { CompiladoDateFilter } from "@/components/compilado-date-filter";
import { ImportBatchSelector } from "@/components/import-batch-selector";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { PerformanceBandsLegend } from "@/components/performance-bands-legend";
import { DataTable, Surface } from "@/components/surface";
import { requireTeamAccess } from "@/lib/auth/permissions";
import {
  formatDateRangeLabel,
  resolveCompiladoDateRange,
} from "@/lib/metrics/date-range";
import {
  performanceBandSurfaceClass,
  performanceBandTextClass,
  resolvePerformanceBand,
} from "@/lib/metrics/performance-bands";
import {
  formatGestorMonthLabel,
  getGestorDashboard,
  type CapacitySignal,
  type GestorRankingRow,
} from "@/services/gestor/dashboard";
import { listImportBatches } from "@/services/imports";

type GestorPageProps = {
  searchParams: Promise<{
    importId?: string;
    from?: string;
    to?: string;
    month?: string;
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
  const batches = await listImportBatches();
  const selectedBatch =
    batches.find((batch) => batch.id === params.importId) ?? batches[0] ?? null;

  const dateRange = resolveCompiladoDateRange({
    searchParams: {
      from: params.from,
      to: params.to,
      month: params.month,
    },
    defaultStart: selectedBatch?.period_start ?? null,
    defaultEnd: selectedBatch?.period_end ?? null,
  });

  const dashboard = await getGestorDashboard({
    importId: selectedBatch?.id ?? null,
    dateRange,
  });

  const selectedImportId = dashboard.selectedBatch?.id ?? null;
  const { teamMetrics, ranking, monthlyMatrix, thresholds } = dashboard;
  const tone = (rate: number | null) =>
    performanceBandTextClass(resolvePerformanceBand(rate, thresholds));
  const surface = (rate: number | null) =>
    performanceBandSurfaceClass(resolvePerformanceBand(rate, thresholds));

  const configYearMonth = dashboard.capacityPeriod.primaryYearMonth;
  const configHref = configYearMonth
    ? `/app/gestor/config?year=${configYearMonth.slice(0, 4)}&month=${Number(configYearMonth.slice(5, 7))}`
    : "/app/gestor/config";

  return (
    <PageShell size="full">
      <PageHeader
        eyebrow="Operação"
        title="Dashboard do gestor"
        description="Ranking, totais do time e matriz mensal de aproveitamento (Compilado)."
        actions={
          <Link href={configHref} className="ui-btn-primary">
            Capacidade e faixas
          </Link>
        }
      />

      <ImportBatchSelector
        batches={dashboard.batches}
        selectedImportId={selectedImportId}
        basePath="/app/gestor"
        preservedParams={{
          month:
            dateRange.mode === "month" ? dateRange.month ?? undefined : undefined,
          from: dateRange.mode === "custom" ? dateRange.start : undefined,
          to: dateRange.mode === "custom" ? dateRange.end : undefined,
        }}
      />
      <CompiladoDateFilter
        basePath="/app/gestor"
        importId={selectedImportId}
        activeRange={dateRange}
        monthOptions={dashboard.monthOptions}
      />

      <PerformanceBandsLegend thresholds={thresholds} />

      {dashboard.selectedBatch == null ? (
        <p className="text-sm text-muted-foreground">
          Importe uma planilha concluída para ver o ranking e a matriz do time.
        </p>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Surface className="space-y-1" interactive>
              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Developers ativos
              </p>
              <p className="ui-kpi text-2xl tracking-tight">
                {dashboard.activeDevelopersCount}
              </p>
            </Surface>
            <Surface className="space-y-1" interactive>
              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Com cards no período
              </p>
              <p className="ui-kpi text-2xl tracking-tight">
                {dashboard.developersWithCardsCount}
              </p>
            </Surface>
            <Surface className="space-y-1" interactive>
              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Cards no compilado
              </p>
              <p className="ui-kpi text-2xl tracking-tight">
                {teamMetrics.totalCards}
              </p>
            </Surface>
            <Surface className="space-y-1" interactive>
              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Aproveitamento do time
              </p>
              <p
                className={`ui-kpi text-2xl tracking-tight ${tone(teamMetrics.utilizationRate)}`}
              >
                {formatPercent(teamMetrics.utilizationRate)}
              </p>
              <p className="text-xs text-muted-foreground">
                (no prazo − retrabalho) / total
              </p>
            </Surface>
          </section>

          {dashboard.teamDefaultRequiredHours != null ? (
            <p className="text-xs text-muted-foreground">
              Meta de capacidade do filtro (
              <span className="font-medium text-foreground">
                {dashboard.capacityPeriod.start} → {dashboard.capacityPeriod.end}
              </span>
              ):{" "}
              <span className="font-medium text-foreground">
                {formatHours(dashboard.teamDefaultRequiredHours)}
              </span>{" "}
              no padrão do time
              {dashboard.capacityPeriod.spansMultipleMonths
                ? " (prorrateada entre os meses do intervalo, por peso de horas/weekday)"
                : ""}
              . Overrides por developer entram mês a mês na mesma lógica.
            </p>
          ) : (
            <p className="text-xs text-amber-800 dark:text-amber-200">
              Capacidade do time ainda não configurada. Defina horas por dia da
              semana em{" "}
              <Link href={configHref} className="underline underline-offset-4">
                Capacidade e faixas
              </Link>
              .
            </p>
          )}

          {dashboard.holidayImpact.affected ? (
            <p className="text-xs text-muted-foreground">
              Feriados nacionais no filtro reduziram a referência do time em{" "}
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
            <p className="text-xs text-muted-foreground">
              {dashboard.holidayScopeNote}
            </p>
          )}

          {dashboard.capacityPeriod.spansMultipleMonths ? (
            <p className="text-xs text-muted-foreground">
              Intervalo multi-mês: a coluna Capacidade do ranking soma a meta
              prorrateada de cada mês intersectado. A matriz continua mostrando
              aproveitamento mês a mês (não a meta).
            </p>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Surface padded className="space-y-1 text-sm">
              <p className="text-muted-foreground">No prazo</p>
              <p className="font-medium">{teamMetrics.onTimeCards}</p>
            </Surface>
            <Surface padded className="space-y-1 text-sm">
              <p className="text-muted-foreground">Atrasados</p>
              <p className="font-medium">{teamMetrics.delayedCards}</p>
            </Surface>
            <Surface padded className="space-y-1 text-sm">
              <p className="text-muted-foreground">Retrabalho</p>
              <p className="font-medium">{teamMetrics.reworkCards}</p>
            </Surface>
            <Surface padded className="space-y-1 text-sm">
              <p className="text-muted-foreground">Horas (gasto − estimado)</p>
              <p className="font-medium">
                {formatHours(teamMetrics.totalDifferenceHours)}
              </p>
            </Surface>
          </section>

          <section className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-medium tracking-tight">
                Ranking do período
              </h2>
              <p className="text-sm text-muted-foreground">
                Ordenado por aproveitamento. Cores seguem a régua configurada.
                Capacidade = horas realizadas vs meta prorrateada do intervalo
                do filtro.
              </p>
            </div>

            {teamMetrics.totalCards === 0 ? (
              <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                <p className="font-medium">Time sem cards neste filtro</p>
                <p>
                  Não há `unit_test_delivery_on` em{" "}
                  <span className="font-medium">
                    {formatDateRangeLabel(dateRange)}
                  </span>{" "}
                  (com developer vinculado) neste lote. Ajuste o mês/intervalo.
                </p>
              </div>
            ) : null}

            {ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum developer para exibir neste período.
              </p>
            ) : (
              <DataTable minWidthClassName="min-w-[960px]">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Developer</th>
                    <th>Cadastro</th>
                    <th>Cards</th>
                    <th>No prazo</th>
                    <th>Atraso</th>
                    <th>Retrabalho</th>
                    <th>Aproveitamento</th>
                    <th>Capacidade</th>
                    <th>Diff horas</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((row, index) => (
                    <tr key={row.developerId}>
                      <td className="text-muted-foreground">{index + 1}</td>
                      <td>
                        <Link
                          href={`/app/developers/${row.developerId}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {row.fullName}
                        </Link>
                        {row.email ? (
                          <p className="text-xs text-muted-foreground">
                            {row.email}
                          </p>
                        ) : null}
                      </td>
                      <td>{row.isActive ? "Ativo" : "Inativo"}</td>
                      <td>{row.metrics.totalCards}</td>
                      <td>{row.metrics.onTimeCards}</td>
                      <td>{row.metrics.delayedCards}</td>
                      <td>{row.metrics.reworkCards}</td>
                      <td
                        className={`font-medium ${tone(row.metrics.utilizationRate)}`}
                      >
                        {formatPercent(row.metrics.utilizationRate)}
                      </td>
                      <td>
                        <CapacityCell row={row} />
                      </td>
                      <td>{formatHours(row.metrics.totalDifferenceHours)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </section>

          <section className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-medium tracking-tight">
                Matriz mensal de aproveitamento
              </h2>
              <p className="text-sm text-muted-foreground">
                Meses com entrega dentro do filtro ativo (
                {formatDateRangeLabel(dateRange)}). Células = aproveitamento
                (cards entre parênteses), coloridas pela régua.
              </p>
            </div>

            {monthlyMatrix.months.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ainda não há entregas com data para montar a matriz.
              </p>
            ) : (
              <DataTable minWidthClassName="min-w-[720px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-muted/50">Developer</th>
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
                      <td className="sticky left-0 z-10 bg-card font-medium whitespace-nowrap">
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
                          className={`whitespace-nowrap ${tone(cell.utilizationRate)} ${cell.cardsCount > 0 ? surface(cell.utilizationRate) : ""}`}
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
          </section>
        </>
      )}
    </PageShell>
  );
}
