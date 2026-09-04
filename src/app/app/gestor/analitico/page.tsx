import Link from "next/link";
import { AnalyticalBaseView } from "@/components/gestor/analytical-base-view";
import { CompiladoDateFilter } from "@/components/compilado-date-filter";
import { CompiladoProvenanceBadge } from "@/components/compilado-provenance-badge";
import { FilterPersistenceSync } from "@/components/filters/filter-persistence-sync";
import { GestorSourceFilter } from "@/components/gestor-source-filter";
import { ImportBatchSelector } from "@/components/import-batch-selector";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { requirePermission } from "@/lib/auth/permissions";
import { restorePersistedFiltersOrRedirect } from "@/lib/filters/persist-server";
import {
  formatDateRangeLabel,
  resolveCompiladoDateRange,
} from "@/lib/metrics/date-range";
import {
  compiladoSourceModeLabel,
  parseCompiladoSourceMode,
} from "@/lib/metrics/gestor-data-source";
import { resolveCompiladoSnapshot } from "@/services/compilado/resolve-snapshot";
import { getGestorAnalyticalBase } from "@/services/gestor/analytical-base";

type PageProps = {
  searchParams: Promise<{
    importId?: string;
    from?: string;
    to?: string;
    month?: string;
    source?: string;
    developerId?: string;
    status?: string;
    class?: string;
    q?: string;
  }>;
};

function parseClassification(
  value: string | undefined,
): "" | "onTime" | "delayed" | "rework" | "incomplete" {
  if (
    value === "onTime" ||
    value === "delayed" ||
    value === "rework" ||
    value === "incomplete"
  ) {
    return value;
  }
  return "";
}

export default async function GestorAnaliticoPage({ searchParams }: PageProps) {
  await requirePermission("gestor", "access");
  const params = await searchParams;
  await restorePersistedFiltersOrRedirect({
    scope: "gestor-analitico",
    pathname: "/app/gestor/analitico",
    searchParams: params,
  });
  const dataSource = parseCompiladoSourceMode(params.source);

  const seed = await resolveCompiladoSnapshot({
    mode: dataSource,
    importId: params.importId ?? null,
    dateRange: null,
  });

  const dateRange = resolveCompiladoDateRange({
    searchParams: {
      from: params.from,
      to: params.to,
      month: params.month,
    },
    defaultStart: seed.selectedBatch?.period_start ?? null,
    defaultEnd: seed.selectedBatch?.period_end ?? null,
  });

  const base = await getGestorAnalyticalBase({
    importId: params.importId ?? null,
    dateRange,
    dataSource,
  });

  const selectedImportId = base.selectedBatch?.id ?? null;
  const sourceParam = dataSource === "auto" ? undefined : dataSource;
  const preservedWithSource = {
    source: sourceParam,
    month: dateRange.mode === "month" ? (dateRange.month ?? undefined) : undefined,
    from: dateRange.mode === "custom" ? dateRange.start : undefined,
    to: dateRange.mode === "custom" ? dateRange.end : undefined,
    developerId: params.developerId,
    status: params.status,
    class: params.class,
    q: params.q,
  };

  const gestorHref = (() => {
    const query = new URLSearchParams();
    if (sourceParam) {
      query.set("source", sourceParam);
    }
    if (selectedImportId) {
      query.set("importId", selectedImportId);
    }
    if (dateRange.mode === "month" && dateRange.month) {
      query.set("month", dateRange.month);
    } else {
      query.set("from", dateRange.start);
      query.set("to", dateRange.end);
    }
    const qs = query.toString();
    return qs ? `/app/gestor?${qs}` : "/app/gestor";
  })();

  return (
    <PageShell size="full">
      <FilterPersistenceSync
        scope="gestor-analitico"
        params={{
          source: sourceParam,
          month:
            dateRange.mode === "month" ? (dateRange.month ?? undefined) : undefined,
          from: dateRange.mode === "custom" ? dateRange.start : undefined,
          to: dateRange.mode === "custom" ? dateRange.end : undefined,
        }}
      />
      <PageHeader
        eyebrow="Operação · Gestor"
        title="Visão analítica"
        description={
          <>
            Base detalhada dos cards do sintético Compilado (1 linha por card),
            no espírito da aba Base Jira. Período ativo:{" "}
            <span className="font-medium">
              {formatDateRangeLabel(dateRange)}
            </span>
            . Regra: Entrega p/ Teste Unitário (`unit_test_delivery_on`).
          </>
        }
        breadcrumb={
          <Link href={gestorHref} className="underline-offset-4 hover:underline">
            ← Dashboard do gestor
          </Link>
        }
        actions={
          <Link href={gestorHref} className="ui-btn-secondary">
            Voltar ao sintético
          </Link>
        }
      />

      <GestorSourceFilter
        basePath="/app/gestor/analitico"
        selected={dataSource}
        preservedParams={{
          month: preservedWithSource.month,
          from: preservedWithSource.from,
          to: preservedWithSource.to,
          developerId: preservedWithSource.developerId,
          status: preservedWithSource.status,
          class: preservedWithSource.class,
          q: preservedWithSource.q,
        }}
        persistScope="gestor-analitico"
      />

      {base.provenance ? (
        <CompiladoProvenanceBadge
          resolvedSource={base.provenance.resolvedSource}
          resolvedAt={base.provenance.resolvedAt}
          resolutionReason={base.provenance.resolutionReason}
          jiraCloudNewerThanSnapshot={
            base.provenance.jiraCloudNewerThanSnapshot
          }
          jiraCloudSyncAt={base.provenance.jiraCloudSyncAt}
        />
      ) : null}

      <ImportBatchSelector
        batches={base.batches}
        selectedImportId={selectedImportId}
        basePath="/app/gestor/analitico"
        preservedParams={{
          source: sourceParam,
          month: preservedWithSource.month,
          from: preservedWithSource.from,
          to: preservedWithSource.to,
          developerId: preservedWithSource.developerId,
          status: preservedWithSource.status,
          class: preservedWithSource.class,
          q: preservedWithSource.q,
        }}
        persistScope="gestor-analitico"
      />

      <CompiladoDateFilter
        basePath="/app/gestor/analitico"
        importId={selectedImportId}
        activeRange={dateRange}
        monthOptions={base.monthOptions}
        preservedParams={{
          source: sourceParam,
          developerId: preservedWithSource.developerId,
          status: preservedWithSource.status,
          class: preservedWithSource.class,
          q: preservedWithSource.q,
        }}
        persistScope="gestor-analitico"
        liveParamFieldIds={{
          source: "gestor-source",
          importId: "importId",
        }}
      />

      {base.selectedBatch == null ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          Sem lote Compilado para o modo “
          {compiladoSourceModeLabel(dataSource)}”. Ajuste a fonte ou importe
          dados.
        </div>
      ) : (
        <AnalyticalBaseView
          rows={base.rows}
          developers={base.developers}
          statuses={base.statuses}
          context={{
            importId: selectedImportId,
            from: dateRange.start,
            to: dateRange.end,
            month: dateRange.mode === "month" ? dateRange.month : null,
            source: dataSource,
          }}
          initialFilters={{
            developerId: params.developerId ?? "",
            status: params.status ?? "",
            classification: parseClassification(params.class),
            q: params.q ?? "",
          }}
        />
      )}
    </PageShell>
  );
}
