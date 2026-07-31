import Link from "next/link";
import {
  DelayJustificationStatusBadge,
  JustifyDelayButton,
  type DelayJustificationBadgeInfo,
} from "@/app/app/developer-delay-justification";
import { CompiladoDateFilter } from "@/components/compilado-date-filter";
import { CompiladoProvenanceBadge } from "@/components/compilado-provenance-badge";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { DataTable } from "@/components/surface";
import { KpiMetricCard } from "@/components/ui/kpi-metric-card";
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
import type { CompiladoSnapshotProvenance } from "@/services/compilado/resolve-snapshot";
import type { Developer } from "@/types/developer";
import type { DeveloperPeriodMetrics } from "@/types/developer-period-metrics";
import type { JiraCard } from "@/types/jira-card";
import type { Profile } from "@/types/profile";

type AppHomeProps = {
  profile: Profile;
  developer: Developer;
  selectedImportId: string | null;
  dateRange: CompiladoDateRange;
  monthOptions: string[];
  cards: JiraCard[];
  metrics: DeveloperPeriodMetrics;
  provenance: CompiladoSnapshotProvenance | null;
  delayJustificationsByKey: Record<string, DelayJustificationBadgeInfo>;
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

export function AppHome({
  profile,
  developer,
  selectedImportId,
  dateRange,
  monthOptions,
  cards,
  metrics,
  provenance,
  delayJustificationsByKey,
}: AppHomeProps) {
  const displayName = profile.full_name ?? developer.full_name;

  return (
    <PageShell size="xl">
      <PageHeader
        eyebrow="Início"
        title={`Olá, ${displayName}`}
        description={
          <>
            Seu Compilado do período ·{" "}
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
          <CompiladoDateFilter
            basePath="/app"
            importId={selectedImportId}
            activeRange={dateRange}
            monthOptions={monthOptions}
            embedded
          />
        </div>
      </FilterBar>

      <SectionShell
        title="Resumo do período"
        description={
          <>
            Indicadores com Entrega TU em{" "}
            <span className="font-medium text-foreground">
              {formatDateRangeLabel(dateRange)}
            </span>
            . Aproveitamento = qualidade após atraso líquido e retrabalho.
            Índice de Entrega = qualidade × √volume.
          </>
        }
      >
        {metrics.totalCards > 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">
            De{" "}
            <span className="font-medium text-foreground">
              {metrics.totalCards}
            </span>{" "}
            cards entregues,{" "}
            <span className="font-medium text-foreground">
              {Math.max(0, metrics.utilizedCardEquivalents).toLocaleString(
                "pt-BR",
                { maximumFractionDigits: 1 },
              )}
            </span>{" "}
            foram aproveitados após descontar atrasos e retrabalhos.
          </p>
        ) : null}

        {metrics.totalCards === 0 ? (
          <div className="mb-4 space-y-2 rounded-[var(--radius-sm)] border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
            <p className="font-medium text-foreground">
              Nenhum card seu neste filtro
            </p>
            <p className="text-muted-foreground">
              Não há cards com{" "}
              <span className="font-medium text-foreground">
                Entrega p/ Teste Unitário
              </span>{" "}
              em{" "}
              <span className="font-medium text-foreground">
                {formatDateRangeLabel(dateRange)}
              </span>
              . Tente outro mês/intervalo ou confira a atribuição no Compilado.
            </p>
          </div>
        ) : null}

        <div className="ui-kpi-grid">
          <KpiMetricCard
            label="Cards"
            value={String(metrics.totalCards)}
            tone="info"
            hint="Entrega TU no período"
          />
          <KpiMetricCard
            label="No prazo"
            value={String(metrics.onTimeCards)}
            tone="success"
          />
          <KpiMetricCard
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
            label="Aproveitamento"
            value={formatPercent(metrics.utilizationRate)}
            tone="brand"
            hint="Qualidade da entrega"
          />
          <KpiMetricCard
            label="Índice de Entrega"
            value={formatDeliveryIndex(metrics.deliveryIndex)}
            tone="brand"
            hint="Q × √C"
          />
          <KpiMetricCard
            label="Horas realizadas"
            value={formatHours(metrics.totalTimeSpentHours)}
            tone="neutral"
            hint={`Previsto ${formatHours(metrics.totalEstimateHours)}`}
          />
          <KpiMetricCard
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

        <div className="ui-kpi-grid mt-2.5 sm:mt-3">
          <KpiMetricCard
            label="Atraso médio"
            value={formatDays(metrics.averageDelayDays)}
            tone="neutral"
          />
          <KpiMetricCard
            label="Maior atraso"
            value={formatDays(metrics.maxDelayDays)}
            tone="neutral"
          />
        </div>
      </SectionShell>

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
                const justification =
                  delayJustificationsByKey[
                    card.jira_key.trim().toUpperCase()
                  ] ?? null;
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
                    <td className="align-top whitespace-nowrap">
                      {flags.isDelayed && selectedImportId ? (
                        <JustifyDelayButton
                          importId={selectedImportId}
                          jiraCardId={card.id}
                          jiraKey={card.jira_key}
                          existing={justification}
                        />
                      ) : justification ? (
                        <DelayJustificationStatusBadge
                          status={justification.status}
                        />
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
    </PageShell>
  );
}
