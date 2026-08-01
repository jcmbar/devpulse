import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { FilterPersistenceSync } from "@/components/filters/filter-persistence-sync";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { restorePersistedFiltersOrRedirect } from "@/lib/filters/persist-server";
import { JiraAdminPanel } from "@/app/app/jira/jira-admin-panel";
import {
  countIssueFlowMetrics,
  listIssueFlowMetricsWithKeys,
} from "@/services/analytics/jira";
import {
  countJiraIssues,
  listJiraIntegrations,
  listJiraProjects,
  listRecentJiraSyncRuns,
  listSampleJiraIssues,
} from "@/services/integrations/jira";
import { listTeamsAdmin } from "@/services/teams";

type PageProps = {
  searchParams?: Promise<{
    teamId?: string;
    integrationId?: string;
    saved?: string;
  }>;
};

export default async function JiraIntegrationsPage({ searchParams }: PageProps) {
  await requireTeamAccess();
  const params = searchParams ? await searchParams : {};
  await restorePersistedFiltersOrRedirect({
    scope: "jira-admin",
    pathname: "/app/jira",
    searchParams: params,
  });

  const [teams, integrations] = await Promise.all([
    listTeamsAdmin(),
    listJiraIntegrations(),
  ]);

  // Team is the master context. integrationId remains supported only as a
  // backwards-compatible deep link and is immediately resolved to its team.
  const integrationFromLegacyLink = params.integrationId
    ? integrations.find((row) => row.id === params.integrationId) ?? null
    : null;
  const requestedTeamId =
    params.teamId ?? integrationFromLegacyLink?.team_id ?? teams[0]?.id ?? null;
  const selectedTeam =
    teams.find((team) => team.id === requestedTeamId) ?? teams[0] ?? null;
  const integrationsForTeam = selectedTeam
    ? integrations.filter((row) => row.team_id === selectedTeam.id)
    : [];
  // The database has UNIQUE(team_id). If legacy data violates that invariant,
  // choose deterministically and surface a warning instead of mixing contexts.
  const selected = integrationsForTeam[0] ?? null;

  const [
    projects,
    issueCount,
    sampleIssues,
    recentRuns,
    flowMetricsCount,
    flowRows,
  ] = selected
    ? await Promise.all([
        listJiraProjects(selected.id),
        countJiraIssues(selected.id),
        listSampleJiraIssues(selected.id, 25),
        listRecentJiraSyncRuns(selected.id, 12),
        countIssueFlowMetrics(selected.id),
        listIssueFlowMetricsWithKeys(selected.id, 20),
      ])
    : [[], 0, [], [], 0, []];

  const sampleFlowMetrics = flowRows.map((row) => row.metrics);
  const issueKeyById = Object.fromEntries(
    flowRows.map((row) => [
      row.metrics.issue_id,
      row.jira_key ?? row.metrics.issue_id.slice(0, 8),
    ]),
  );

  return (
    <PageShell>
      <FilterPersistenceSync
        scope="jira-admin"
        params={{
          teamId: selectedTeam?.id,
          integrationId: selected?.id,
        }}
      />
      <PageHeader
        title="Jira"
        description="Fonte da verdade da integração: conexão, sync, mapeamentos e analytics. Times cuidam só da organização e do prefixo de imports."
      />
      <JiraAdminPanel
        key={`${selectedTeam?.id ?? "none"}:${selected?.id ?? "new"}`}
        teams={teams}
        integrations={integrations}
        selectedTeam={selectedTeam}
        selected={selected}
        hasDuplicateIntegrations={integrationsForTeam.length > 1}
        saved={params.saved === "1"}
        projects={projects}
        issueCount={issueCount}
        sampleIssues={sampleIssues}
        recentRuns={recentRuns}
        flowMetricsCount={flowMetricsCount}
        sampleFlowMetrics={sampleFlowMetrics}
        issueKeyById={issueKeyById}
      />
    </PageShell>
  );
}
