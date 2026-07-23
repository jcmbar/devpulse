import Link from "next/link";
import { CompiladoDateFilter } from "@/components/compilado-date-filter";
import { ImportBatchSelector } from "@/components/import-batch-selector";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { DataTable, Surface } from "@/components/surface";
import { canManageImports } from "@/lib/auth/permissions";
import { getRoleLabel } from "@/lib/auth/role-labels";
import {
  formatDateRangeLabel,
  type CompiladoDateRange,
} from "@/lib/metrics/date-range";
import type { Developer } from "@/types/developer";
import type { DeveloperPeriodMetrics } from "@/types/developer-period-metrics";
import type { ImportBatchOption } from "@/types/import-period";
import type { JiraCard } from "@/types/jira-card";
import type { Profile } from "@/types/profile";

type AppHomeProps = {
  profile: Profile;
  developer: Developer;
  batches: ImportBatchOption[];
  selectedImportId: string | null;
  dateRange: CompiladoDateRange;
  monthOptions: string[];
  cards: JiraCard[];
  metrics: DeveloperPeriodMetrics;
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
  batches,
  selectedImportId,
  dateRange,
  monthOptions,
  cards,
  metrics,
}: AppHomeProps) {
  const displayName = profile.full_name ?? developer.full_name;

  return (
    <PageShell size="xl">
      <PageHeader
        eyebrow="Home"
        title={`Olá, ${displayName}`}
        description="Produtividade por período, com regras da aba Compilado."
        actions={
          canManageImports(profile.role) ? (
            <Link href="/app/imports" className="ui-btn-primary">
              Importar planilha
            </Link>
          ) : null
        }
      />

      <section className="grid gap-4 sm:grid-cols-2">
        <Surface className="space-y-1 text-sm">
          <p className="text-muted-foreground">Papel</p>
          <p className="font-medium">{getRoleLabel(profile.role)}</p>
        </Surface>

        <Surface className="space-y-1 text-sm">
          <p className="text-muted-foreground">Vínculo com developer</p>
          <p className="font-medium">
            {developer.is_active ? "Ativo" : "Inativo"} · {developer.full_name}
          </p>
        </Surface>
      </section>

      <section className="space-y-4">
        <ImportBatchSelector
          batches={batches}
          selectedImportId={selectedImportId}
          basePath="/app"
          preservedParams={{
            month: dateRange.mode === "month" ? dateRange.month ?? undefined : undefined,
            from: dateRange.mode === "custom" ? dateRange.start : undefined,
            to: dateRange.mode === "custom" ? dateRange.end : undefined,
          }}
        />
        <CompiladoDateFilter
          basePath="/app"
          importId={selectedImportId}
          activeRange={dateRange}
          monthOptions={monthOptions}
        />
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-medium tracking-tight">Resumo do período</h2>
          <p className="text-sm text-muted-foreground">
            KPIs do Compilado para{" "}
            <span className="font-medium">{formatDateRangeLabel(dateRange)}</span>.
          </p>
        </div>

        {metrics.totalCards === 0 ? (
          <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            <p className="font-medium">Nenhum card seu neste filtro</p>
            <p>
              Não há cards com{" "}
              <span className="font-medium">Entrega p/ Teste Unitário</span> em{" "}
              <span className="font-medium">{formatDateRangeLabel(dateRange)}</span>{" "}
              para o seu developer neste lote. Tente outro mês/intervalo ou
              confira se os cards ainda estão atribuídos a você na planilha.
            </p>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total de cards" value={String(metrics.totalCards)} />
          <KpiCard label="No prazo" value={String(metrics.onTimeCards)} />
          <KpiCard label="Em atraso" value={String(metrics.delayedCards)} />
          <KpiCard label="Retrabalho" value={String(metrics.reworkCards)} />
          <KpiCard
            label="Horas previstas"
            value={formatHours(metrics.totalEstimateHours)}
          />
          <KpiCard
            label="Horas realizadas"
            value={formatHours(metrics.totalTimeSpentHours)}
          />
          <KpiCard
            label="Diferença de horas"
            value={formatHours(metrics.totalDifferenceHours)}
          />
          <KpiCard
            label="Aproveitamento"
            value={formatPercent(metrics.utilizationRate)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <KpiCard
            label="Atraso médio"
            value={formatDays(metrics.averageDelayDays)}
          />
          <KpiCard
            label="Maior atraso"
            value={formatDays(metrics.maxDelayDays)}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-medium tracking-tight">Cards do período</h2>
          <p className="text-sm text-muted-foreground">
            {cards.length === 0
              ? "Nenhum card encontrado para você neste período."
              : `${cards.length} card(s) neste período.`}
          </p>
        </div>

        {cards.length > 0 ? (
          <DataTable minWidthClassName="min-w-[800px]">
            <thead>
              <tr>
                <th>Chave</th>
                <th>Resumo</th>
                <th>Status</th>
                <th>Previsto</th>
                <th>Realizado</th>
                <th>Atraso</th>
                <th>Retrabalho</th>
                <th>Prazo</th>
                <th>Entrega TU</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => (
                <tr key={card.id}>
                  <td className="whitespace-nowrap font-medium">
                    {card.jira_key}
                  </td>
                  <td className="max-w-[220px] truncate">
                    {card.summary ?? "—"}
                  </td>
                  <td className="whitespace-nowrap">{card.status ?? "—"}</td>
                  <td className="whitespace-nowrap">
                    {card.estimate_hours != null
                      ? formatHours(card.estimate_hours)
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap">
                    {card.time_spent_hours != null
                      ? formatHours(card.time_spent_hours)
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap">
                    {formatDays(card.delay_days)}
                  </td>
                  <td className="whitespace-nowrap">
                    {card.is_rework
                      ? card.rework_weight > 1
                        ? `${card.rework_weight}x`
                        : "Sim"
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap">
                    {formatDate(card.due_on)}
                  </td>
                  <td className="whitespace-nowrap">
                    {formatDate(card.unit_test_delivery_on)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : null}
      </section>
    </PageShell>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Surface className="space-y-2" interactive>
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="ui-kpi text-2xl tracking-tight">{value}</p>
    </Surface>
  );
}
