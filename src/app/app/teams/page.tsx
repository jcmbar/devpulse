import Link from "next/link";
import { TeamsAdminPanel } from "@/app/app/teams/teams-admin-panel";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { listTeamsAdmin } from "@/services/teams";

export default async function TeamsPage() {
  await requireTeamAccess();
  const teams = await listTeamsAdmin({ includeInactive: true });

  return (
    <PageShell size="xl">
      <PageHeader
        eyebrow="Organização"
        title="Times"
        description="Cadastre times e o prefixo Jira de cada um. Imports detectam o prefixo automaticamente e recusam planilhas misturadas."
        actions={
          <Link href="/app/teams/sanitation" className="ui-btn-secondary">
            Saneamento (team_id)
          </Link>
        }
      />
      <TeamsAdminPanel teams={teams} />
    </PageShell>
  );
}
