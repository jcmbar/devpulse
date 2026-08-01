import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { FilterPersistenceSync } from "@/components/filters/filter-persistence-sync";
import { buildAuditHref } from "@/components/jira-analytics/build-audit-href";
import { DashboardFilters } from "@/components/jira-analytics/dashboard-filters";
import { FlowHistorySection } from "@/components/jira-analytics/flow-history-section";
import { FrictionTable } from "@/components/jira-analytics/friction-table";
import { KpiCards } from "@/components/jira-analytics/kpi-cards";
import { MappingQualityPanel } from "@/components/jira-analytics/mapping-quality-panel";
import { OldestOpenTable } from "@/components/jira-analytics/oldest-open-table";
import { StatusGroupBars } from "@/components/jira-analytics/status-group-bars";
import { ThroughputChart } from "@/components/jira-analytics/throughput-chart";
import { WipAgingPanel } from "@/components/jira-analytics/wip-aging-panel";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { restorePersistedFiltersOrRedirect } from "@/lib/filters/persist-server";
import type { JiraStatusGroup } from "@/types/jira-flow-analytics";
import {
  getFlowDashboardReadModel,
  getStatusGovernanceReport,
  listIssueTypesForScope,
} from "@/services/analytics/jira";
import {
  getJiraIntegration,
  listJiraIntegrations,
} from "@/services/integrations/jira";
import { listTeamsAdmin } from "@/services/teams";

type PageProps = {
  searchParams?: Promise<{
    integrationId?: string;
    teamId?: string;
    from?: string;
    to?: string;
    statusGroup?: string;
    issueType?: string;
    bucket?: string;
  }>;
};

const STATUS_GROUP_VALUES = new Set([
  "analysis",
  "development",
  "validation",
  "done",
  "other",
]);

export default async function JiraAnalyticsPage({ searchParams }: PageProps) {
  await requireTeamAccess();
  const params = searchParams ? await searchParams : {};
  await restorePersistedFiltersOrRedirect({
    scope: "jira-analytics",
    pathname: "/app/jira/analytics",
    searchParams: params,
  });
  const [integrations, teams] = await Promise.all([
    listJiraIntegrations(),
    listTeamsAdmin(),
  ]);

  const teamIdParam = params.teamId?.trim() || "";
  const integrationsForTeam = teamIdParam
    ? integrations.filter((row) => row.team_id === teamIdParam)
    : integrations;
  const pool =
    integrationsForTeam.length > 0 ? integrationsForTeam : integrations;

  const selectedId =
    (params.integrationId &&
    pool.some((row) => row.id === params.integrationId)
      ? params.integrationId
      : null) ||
    pool.find((row) => row.is_enabled)?.id ||
    pool[0]?.id ||
    null;

  if (!selectedId) {
    return (
      <PageShell>
        <PageHeader
          title="Analytics Jira"
          description="Configure uma integração em /app/jira antes de usar o dashboard."
          actions={
            <Link href="/app/jira" className="ui-btn-secondary">
              Ir ao Jira
            </Link>
          }
        />
      </PageShell>
    );
  }

  const selected = await getJiraIntegration(selectedId);
  const fromDate =
    params.from ??
    new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString().slice(0, 10);
  const toDate = params.to ?? new Date().toISOString().slice(0, 10);
  const fromIso = `${fromDate}T00:00:00.000Z`;
  const toIso = `${toDate}T23:59:59.999Z`;
  const statusGroupRaw = params.statusGroup ?? "all";
  const statusGroup =
    statusGroupRaw === "all" || STATUS_GROUP_VALUES.has(statusGroupRaw)
      ? (statusGroupRaw as JiraStatusGroup | "all")
      : "all";
  const issueType = params.issueType?.trim() || "all";
  const bucket = params.bucket === "week" ? "week" : "day";
  const effectiveTeamId = teamIdParam || selected?.team_id || "";

  const scope = {
    integrationId: selectedId,
    fromIso,
    toIso,
    statusGroup,
    issueType: issueType === "all" ? undefined : issueType,
  };

  const [readModel, governance, issueTypes] = await Promise.all([
    getFlowDashboardReadModel(scope),
    getStatusGovernanceReport(selectedId),
    listIssueTypesForScope({ integrationId: selectedId }),
  ]);

  const queryForAudit = {
    integrationId: selectedId,
    teamId: effectiveTeamId || undefined,
    from: fromDate,
    to: toDate,
    statusGroup: statusGroup === "all" ? undefined : statusGroup,
    issueType: issueType === "all" ? undefined : issueType,
    bucket,
  };

  const throughputSource =
    bucket === "week" ? readModel.throughputWeekly : readModel.throughputDaily;
  const throughputPoints = throughputSource.map((row) => ({
    label:
      bucket === "day"
        ? row.periodStart.slice(5, 10)
        : row.periodStart.slice(0, 10),
    resolvedCount: row.resolvedCount,
  }));

  const teamsInUse = teams.filter((team) =>
    integrations.some((row) => row.team_id === team.id),
  );

  return (
    <PageShell>
      <FilterPersistenceSync
        scope="jira-analytics"
        params={{
          integrationId: selectedId,
          teamId: effectiveTeamId || undefined,
          from: fromDate,
          to: toDate,
          statusGroup: statusGroup === "all" ? undefined : statusGroup,
          issueType: issueType === "all" ? undefined : issueType,
          bucket,
        }}
      />
      <PageHeader
        title="Dashboard de fluxo"
        description={`Operação e gestão · ${selected?.name ?? selectedId} · flow_v1`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/app/jira" className="ui-btn-secondary">
              Integração Jira
            </Link>
          </div>
        }
      />

      <div className="space-y-8">
        <DashboardFilters
          integrations={pool.map((row) => ({
            id: row.id,
            name: row.name,
            team_id: row.team_id,
          }))}
          teams={teamsInUse.map((row) => ({ id: row.id, name: row.name }))}
          issueTypes={issueTypes}
          values={{
            integrationId: selectedId,
            teamId: effectiveTeamId,
            from: fromDate,
            to: toDate,
            statusGroup,
            issueType,
            bucket,
          }}
        />

        <KpiCards
          values={{
            throughput: readModel.periodStats.resolvedCount,
            leadP50Ms: readModel.periodStats.p50LeadTimeMs,
            leadP90Ms: readModel.periodStats.p90LeadTimeMs,
            agingAvgMs: readModel.aging.avgAgingMs,
            agingP50Ms: readModel.aging.p50AgingMs,
            agingP90Ms: readModel.aging.p90AgingMs,
            reopenCount: readModel.periodStats.reopenTotal,
            reworkCount: readModel.periodStats.developReentryTotal,
            assigneeChangeCount: readModel.periodStats.assigneeChangeTotal,
            openCount: readModel.aging.openCount,
            completedCount: readModel.periodStats.resolvedCount,
          }}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <ThroughputChart points={throughputPoints} bucket={bucket} />
          <StatusGroupBars rows={readModel.statusGroups} />
        </div>

        <FlowHistorySection history={readModel.history} />

        <WipAgingPanel
          openCount={readModel.aging.openCount}
          avgAgingMs={readModel.aging.avgAgingMs}
          p50AgingMs={readModel.aging.p50AgingMs}
          p90AgingMs={readModel.aging.p90AgingMs}
          maxAgingMs={readModel.aging.maxAgingMs}
          statusGroups={readModel.statusGroups}
        />

        <OldestOpenTable
          rows={readModel.oldestOpen}
          auditHref={(issueId) => buildAuditHref(issueId, queryForAudit)}
        />

        <FrictionTable
          rows={readModel.topFriction}
          auditHref={(issueId) => buildAuditHref(issueId, queryForAudit)}
        />

        {governance ? (
          <MappingQualityPanel
            strict={governance.strict}
            summary={governance.summary}
            recommendations={governance.recommendations}
            attentionRows={[...governance.unmapped, ...governance.fuzzy].map(
              (row) => ({
                status: row.status,
                matchedBy: row.matchedBy,
                group: row.group,
                issueCount: row.issueCount,
                dwellMs: row.dwellMs,
              }),
            )}
          />
        ) : null}
      </div>
    </PageShell>
  );
}
