import Link from "next/link";
import {
  DelayJustificationStatusBadge,
  JustifyDeliveryButton,
  type DelayJustificationBadgeInfo,
} from "@/app/app/developer-delay-justification";
import {
  DashboardComplementGrid,
  DashboardStatusList,
} from "@/components/dashboard/dashboard-complement-grid";
import { MonthlyTrendChart } from "@/components/dashboard/monthly-trend-chart";
import { CompiladoDateFilter } from "@/components/compilado-date-filter";
import { CompiladoProvenanceBadge } from "@/components/compilado-provenance-badge";
import { RankingMetricsLegend } from "@/components/gestor/ranking-metrics-legend";
import {
  DeveloperClosingsYearView,
  type DeveloperClosingYearMonthRow,
} from "@/components/monthly-closing/developer-closings-year-view";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { DataTable } from "@/components/surface";
import { AppViewTabs } from "@/components/ui/app-view-tabs";
import { KpiMetricCard } from "@/components/ui/kpi-metric-card";
import { MetricCalcTooltip } from "@/components/ui/metric-calc-tooltip";
import { FilterBar, SectionShell } from "@/components/ui/section-shell";
import { canManageImports } from "@/lib/auth/permissions";
import { getRoleLabel } from "@/lib/auth/role-labels";
import {
  formatDateRangeLabel,
  type CompiladoDateRange,
} from "@/lib/metrics/date-range";
import {
  formatDeliveryIndex,
  getCardDeliveryFlags,
} from "@/lib/metrics/developer-period";
import type { MonthlyTrendPoint } from "@/lib/metrics/monthly-trend";
import {
  buildDeliveryIndexCalcExplain,
  buildUtilizationCalcExplain,
} from "@/lib/metrics/metric-calc-explain";
import type { CompiladoSnapshotProvenance } from "@/services/compilado/resolve-snapshot";
import type { Developer } from "@/types/developer";
import type { DeveloperCompensation } from "@/types/developer-compensation";
import type { DeveloperPeriodMetrics } from "@/types/developer-period-metrics";
import type { InvoiceIssuer } from "@/types/invoice-issuer";
import type { JiraCard } from "@/types/jira-card";
import type {
  MonthlyClosing,
  MonthlyClosingAttachment,
  MonthlyClosingCardAuditRow,
} from "@/types/monthly-closing";
import type { Profile } from "@/types/profile";

export type DeveloperHomeTab = "cards" | "fechamentos";

type AppHomeProps = {
  profile: Profile;
  developer: Developer;
  selectedImportId: string | null;
  dateRange: CompiladoDateRange;
  monthOptions: string[];
  cards: JiraCard[];
  metrics: DeveloperPeriodMetrics;
  monthlyTrend: MonthlyTrendPoint[];
  provenance: CompiladoSnapshotProvenance | null;
  delayJustificationsByKey: Record<string, DelayJustificationBadgeInfo>;
  reworkJustificationsByKey: Record<string, DelayJustificationBadgeInfo>;
  activeTab: DeveloperHomeTab;
  cardsTabHref: string;
  fechamentosTabHref: string;
  closingYears: number[];
  closingSelectedYear: number;
  closingYearRows: DeveloperClosingYearMonthRow[];
  closingDetailMonth: string | null;
  monthlyClosing: MonthlyClosing | null;
  closingAuditRows: MonthlyClosingCardAuditRow[];
  closingCanSubmit: boolean;
  closingBlockingCount: number;
  closingAttachments: MonthlyClosingAttachment[];
  developerCompensation: DeveloperCompensation | null;
  closingInvoiceIssuer?: InvoiceIssuer | null;
};

function formatHours(value: number): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} h`;
}

function formatDays(value: number | null): string {
  if (value == null) {
    return "—";
  }

  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} d`;
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

function formatDate(value: string | null): string {
  return value ?? "—";
}

function countJustificationStatuses(
  map: Record<string, DelayJustificationBadgeInfo>,
): { pending: number; accepted: number; rejected: number } {
  let pending = 0;
  let accepted = 0;
  let rejected = 0;
  for (const row of Object.values(map)) {
    if (row.status === "pending") {
      pending += 1;
    } else if (row.status === "accepted") {
      accepted += 1;
    } else if (row.status === "rejected") {
      rejected += 1;
    }
  }
  return { pending, accepted, rejected };
}

export function AppHome({
  profile,
  developer,
  selectedImportId,
  dateRange,
  monthOptions,
  cards,
  metrics,
  monthlyTrend,
  provenance,
  delayJustificationsByKey,
  reworkJustificationsByKey,
  activeTab,
  cardsTabHref,
  fechamentosTabHref,
  closingYears,
  closingSelectedYear,
  closingYearRows,
  closingDetailMonth,
  monthlyClosing,
  closingAuditRows,
  closingCanSubmit,
  closingBlockingCount,
  closingAttachments,
  developerCompensation,
  closingInvoiceIssuer = null,
}: AppHomeProps) {
  const displayName = profile.full_name ?? developer.full_name;
  const delayCounts = countJustificationStatuses(delayJustificationsByKey);
  const reworkCounts = countJustificationStatuses(reworkJustificationsByKey);
  const justificationTotal =
    delayCounts.pending +
    delayCounts.accepted +
    delayCounts.rejected +
    reworkCounts.pending +
    reworkCounts.accepted +
    reworkCounts.rejected;

  return (
    <PageShell size="full">
      <PageHeader
        eyebrow="Início"
        title={`Olá, ${displayName}`}
        description={
          <>
            Seu Compilado ·{" "}
            <span className="font-medium text-foreground">
              {getRoleLabel(profile.role)}
            </span>
            {" · "}
            {developer.is_active ? "Ativo" : "Inativo"}
          </>
        }
        actions={
          canManageImports(profile.role) ? (
            <Link href="/app/imports" className="ui-btn-primary">
              Importar planilha
            </Link>
          ) : null
        }
      />

      <AppViewTabs
        tabs={[
          {
            href: cardsTabHref,
            label: "Cards por período",
            active: activeTab === "cards",
          },
          {
            href: fechamentosTabHref,
            label: "Fechamentos",
            active: activeTab === "fechamentos",
          },
        ]}
      />

      {activeTab === "cards" ? (
        <>
          <FilterBar>
            <div className="min-w-0 space-y-2.5">
              {provenance ? (
                <CompiladoProvenanceBadge
                  resolvedSource={provenance.resolvedSource}
                  resolvedAt={provenance.resolvedAt}
                  resolutionReason={provenance.resolutionReason}
                  jiraCloudNewerThanSnapshot={
                    provenance.jiraCloudNewerThanSnapshot
                  }
                  jiraCloudSyncAt={provenance.jiraCloudSyncAt}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma origem Compilado resolvida ainda.
                </p>
              )}
              <CompiladoDateFilter
                basePath="/app"
                importId={selectedImportId}
                activeRange={dateRange}
                monthOptions={monthOptions}
                preservedParams={{ tab: "cards" }}
                persistScope="developer-home"
                embedded
              />
            </div>
          </FilterBar>

          <SectionShell
            title="Indicadores do período"
            description={
              <>
                Entrega TU em{" "}
                <span className="font-medium text-foreground">
                  {formatDateRangeLabel(dateRange)}
                </span>
              </>
            }
          >
            {metrics.totalCards > 0 ? (
              <p className="mb-3 text-sm text-muted-foreground">
                De{" "}
                <span className="font-medium text-foreground">
                  {metrics.totalCards}
                </span>{" "}
                cards,{" "}
                <span className="font-medium text-foreground">
                  {Math.max(0, metrics.utilizedCardEquivalents).toLocaleString(
                    "pt-BR",
                    { maximumFractionDigits: 1 },
                  )}
                </span>{" "}
                aproveitados após atrasos e retrabalhos.
              </p>
            ) : null}

            {metrics.totalCards === 0 ? (
              <div className="mb-3 space-y-1 rounded-[var(--radius-sm)] border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm">
                <p className="font-medium text-foreground">
                  Nenhum card seu neste filtro
                </p>
                <p className="text-muted-foreground">
                  Sem Entrega TU em {formatDateRangeLabel(dateRange)}.
                </p>
              </div>
            ) : null}

            <div className="mb-3">
              <RankingMetricsLegend />
            </div>

            <div className="ui-kpi-grid--hero">
              <KpiMetricCard
                variant="hero"
                label="Cards"
                value={String(metrics.totalCards)}
                tone="info"
                hint="Entrega TU no período"
              />
              <KpiMetricCard
                variant="hero"
                label="No prazo"
                value={String(metrics.onTimeCards)}
                tone="success"
              />
              <KpiMetricCard
                variant="hero"
                label="Atraso"
                value={String(metrics.delayedCardsNet)}
                tone={metrics.delayedCardsNet > 0 ? "danger" : "neutral"}
                hint={
                  metrics.delayedCardsAccepted > 0
                    ? `bruto ${metrics.delayedCardsGross} · acatado ${metrics.delayedCardsAccepted}`
                    : "Líquido (após aceites)"
                }
              />
              <KpiMetricCard
                variant="hero"
                label="Retrabalho"
                value={
                  metrics.reworkWeightTotal > 0
                    ? String(metrics.reworkWeightTotal)
                    : String(metrics.reworkCards)
                }
                tone={metrics.reworkWeightTotal > 0 ? "warning" : "neutral"}
                hint={
                  metrics.reworkCards > 0
                    ? `${metrics.reworkCards} card(s) · pesos`
                    : undefined
                }
              />
              <KpiMetricCard
                variant="hero"
                label="Aproveitamento"
                value={
                  <MetricCalcTooltip
                    explain={buildUtilizationCalcExplain(metrics)}
                  >
                    {formatPercent(metrics.utilizationRate)}
                  </MetricCalcTooltip>
                }
                tone="brand"
                hint="Qualidade da entrega"
              />
              <KpiMetricCard
                variant="hero"
                label="Índice de Entrega"
                value={
                  <MetricCalcTooltip
                    explain={buildDeliveryIndexCalcExplain(metrics)}
                  >
                    {formatDeliveryIndex(metrics.deliveryIndex)}
                  </MetricCalcTooltip>
                }
                tone="brand"
                hint="Q × √C"
              />
              <KpiMetricCard
                variant="hero"
                label="Horas realizadas"
                value={formatHours(metrics.totalTimeSpentHours)}
                tone="neutral"
                hint={`Previsto ${formatHours(metrics.totalEstimateHours)}`}
              />
              <KpiMetricCard
                variant="hero"
                label="Diff horas"
                value={formatHours(metrics.totalDifferenceHours)}
                tone={
                  metrics.totalDifferenceHours > 0
                    ? "warning"
                    : metrics.totalDifferenceHours < 0
                      ? "success"
                      : "neutral"
                }
              />
            </div>
          </SectionShell>

          <MonthlyTrendChart
            title="Acompanhamento mensal"
            description="Evolução por mês de Entrega TU dentro do filtro ativo (mesmas métricas do Compilado)."
            points={monthlyTrend}
          />

          <DashboardComplementGrid
            mixTitle="Qualidade da entrega"
            mixItems={[
              {
                label: "No prazo",
                value: metrics.onTimeCards,
                total: metrics.totalCards,
                tone: "success",
              },
              {
                label: "Atraso líquido",
                value: metrics.delayedCardsNet,
                total: metrics.totalCards,
                tone: "danger",
                detail:
                  metrics.delayedCardsAccepted > 0
                    ? `bruto ${metrics.delayedCardsGross} · acatado ${metrics.delayedCardsAccepted}`
                    : undefined,
              },
              {
                label: "Retrabalho (peso)",
                value: metrics.reworkWeightTotal,
                total: Math.max(metrics.totalCards, metrics.reworkWeightTotal),
                tone: "warning",
                detail:
                  metrics.reworkCards > 0
                    ? `${metrics.reworkCards} card(s)`
                    : undefined,
              },
            ]}
            hoursTitle="Previsto × realizado"
            hoursItems={[
              {
                label: "Previsto",
                value: formatHours(metrics.totalEstimateHours),
              },
              {
                label: "Realizado",
                value: formatHours(metrics.totalTimeSpentHours),
              },
              {
                label: "Diff",
                value: formatHours(metrics.totalDifferenceHours),
                hint:
                  metrics.totalDifferenceHours > 0
                    ? "Acima do estimado"
                    : metrics.totalDifferenceHours < 0
                      ? "Abaixo do estimado"
                      : "Equilibrado",
              },
              {
                label: "Atraso médio",
                value: formatDays(metrics.averageDelayDays),
              },
              {
                label: "Maior atraso",
                value: formatDays(metrics.maxDelayDays),
              },
            ]}
            thirdTitle="Justificativas e status"
            thirdDescription="Contagem no lote Compilado resolvido para o filtro."
            thirdContent={
              <div className="space-y-4">
                <div className="space-y-2 text-sm">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Justificativas
                  </p>
                  <p className="text-muted-foreground">
                    Pendentes{" "}
                    <span className="font-medium text-foreground">
                      {delayCounts.pending + reworkCounts.pending}
                    </span>
                    {" · "}Aceitas{" "}
                    <span className="font-medium text-foreground">
                      {delayCounts.accepted + reworkCounts.accepted}
                    </span>
                    {" · "}Recusadas{" "}
                    <span className="font-medium text-foreground">
                      {delayCounts.rejected + reworkCounts.rejected}
                    </span>
                    {justificationTotal === 0 ? " · nenhuma neste lote" : null}
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Status dos cards
                  </p>
                  <DashboardStatusList counts={metrics.statusCounts} />
                </div>
              </div>
            }
          />

          <SectionShell
            title="Cards do período"
            description={
              cards.length === 0
                ? "Nenhum card encontrado para você neste período."
                : `${cards.length} card(s) com Entrega TU no filtro ativo.`
            }
          >
            {cards.length > 0 ? (
              <DataTable
                minWidthClassName="min-w-0 lg:min-w-[920px]"
                stickyFirstColumn
              >
                <thead>
                  <tr>
                    <th>Chave</th>
                    <th>Resumo</th>
                    <th className="hidden lg:table-cell">Status</th>
                    <th className="hidden lg:table-cell">Previsto</th>
                    <th className="hidden lg:table-cell">Realizado</th>
                    <th>Atraso</th>
                    <th className="hidden md:table-cell">Retrabalho</th>
                    <th className="hidden lg:table-cell">Prazo</th>
                    <th className="hidden md:table-cell">Entrega TU</th>
                    <th>Justificativa</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((card) => {
                    const flags = getCardDeliveryFlags(card);
                    const key = card.jira_key.trim().toUpperCase();
                    const delayJustification =
                      delayJustificationsByKey[key] ?? null;
                    const reworkJustification =
                      reworkJustificationsByKey[key] ?? null;
                    const showDelayJustify =
                      flags.isDelayed === true && selectedImportId != null;
                    const showReworkJustify =
                      flags.isRework && selectedImportId != null;
                    return (
                      <tr key={card.id}>
                        <td className="whitespace-nowrap font-medium">
                          {card.jira_key}
                        </td>
                        <td className="max-w-[9rem] truncate sm:max-w-[14rem] md:max-w-[240px]">
                          {card.summary ?? "—"}
                        </td>
                        <td className="hidden whitespace-nowrap lg:table-cell">
                          {card.status ?? "—"}
                        </td>
                        <td className="hidden whitespace-nowrap lg:table-cell">
                          {card.estimate_hours != null
                            ? formatHours(card.estimate_hours)
                            : "—"}
                        </td>
                        <td className="hidden whitespace-nowrap lg:table-cell">
                          {card.time_spent_hours != null
                            ? formatHours(card.time_spent_hours)
                            : "—"}
                        </td>
                        <td className="whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            <span>{formatDays(card.delay_days)}</span>
                            {flags.isDelayed ? (
                              <span className="text-[10px] font-medium text-warning">
                                Bruto
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="hidden whitespace-nowrap md:table-cell">
                          {card.is_rework
                            ? card.rework_weight > 1
                              ? `${card.rework_weight}x`
                              : "Sim"
                            : "—"}
                        </td>
                        <td className="hidden whitespace-nowrap lg:table-cell">
                          {formatDate(card.due_on)}
                        </td>
                        <td className="hidden whitespace-nowrap md:table-cell">
                          {formatDate(card.unit_test_delivery_on)}
                        </td>
                        <td className="align-top">
                          {showDelayJustify || showReworkJustify ? (
                            <div className="flex flex-col gap-3">
                              {showDelayJustify ? (
                                <JustifyDeliveryButton
                                  importId={selectedImportId}
                                  jiraCardId={card.id}
                                  jiraKey={card.jira_key}
                                  kind="delay"
                                  existing={delayJustification}
                                />
                              ) : null}
                              {showReworkJustify ? (
                                <JustifyDeliveryButton
                                  importId={selectedImportId}
                                  jiraCardId={card.id}
                                  jiraKey={card.jira_key}
                                  kind="rework"
                                  existing={reworkJustification}
                                />
                              ) : null}
                            </div>
                          ) : delayJustification || reworkJustification ? (
                            <div className="flex flex-col gap-2">
                              {delayJustification ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                                    Atraso
                                  </span>
                                  <DelayJustificationStatusBadge
                                    status={delayJustification.status}
                                  />
                                </div>
                              ) : null}
                              {reworkJustification ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                                    Retrabalho
                                  </span>
                                  <DelayJustificationStatusBadge
                                    status={reworkJustification.status}
                                  />
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            ) : null}
          </SectionShell>
        </>
      ) : (
        <DeveloperClosingsYearView
          years={closingYears}
          selectedYear={closingSelectedYear}
          importId={selectedImportId}
          sourceMode={provenance?.resolvedSource ?? "auto"}
          rows={closingYearRows}
          detailMonth={closingDetailMonth}
          detailClosing={monthlyClosing}
          detailAuditRows={closingAuditRows}
          detailCanSubmit={closingCanSubmit}
          detailBlockingCount={closingBlockingCount}
          detailAttachments={closingAttachments}
          developerCompensation={developerCompensation}
          closingInvoiceIssuer={closingInvoiceIssuer}
        />
      )}
    </PageShell>
  );
}
