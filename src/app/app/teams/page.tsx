import Link from "next/link";
import { TeamsAdminPanel } from "@/app/app/teams/teams-admin-panel";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { requirePermission } from "@/lib/auth/permissions";
import { listJiraIntegrations } from "@/services/integrations/jira";
import { listTeamsAdmin } from "@/services/teams";
import type { TeamJiraIntegrationSummary } from "@/types/team";

export default async function TeamsPage() {
  await requirePermission("times", "access");
  const [teams, integrations] = await Promise.all([
    listTeamsAdmin({ includeInactive: true }),
    listJiraIntegrations(),
  ]);

  const jiraByTeamId: Record<string, TeamJiraIntegrationSummary> = {};
  for (const row of integrations) {
    jiraByTeamId[row.team_id] = {
      integrationId: row.id,
      name: row.name,
      isEnabled: row.is_enabled,
      projectKeys: row.project_keys ?? [],
      baseUrl: row.base_url,
    };
  }

  return (
    <PageShell size="full">
      <PageHeader
        eyebrow="Organização"
        title="Times"
        description="Cadastro organizacional e prefixo Jira para routing de imports. Conexão, sync e analytics ficam na aba Jira."
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href="/app/jira" className="ui-btn-secondary">
              Ir para Jira
            </Link>
            <Link href="/app/teams/sanitation" className="ui-btn-secondary">
              Saneamento
            </Link>
          </div>
        }
      />
      <TeamsAdminPanel teams={teams} jiraByTeamId={jiraByTeamId} />
    </PageShell>
  );
}
