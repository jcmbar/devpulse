import Link from "next/link";
import { DeveloperForm } from "@/app/app/developers/developer-form";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { Surface } from "@/components/surface";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { listTeamsAdmin } from "@/services/teams";

export default async function NewDeveloperPage() {
  await requireTeamAccess();
  const teams = await listTeamsAdmin({ includeInactive: true });

  return (
    <PageShell size="sm">
      <PageHeader
        title="Nova pessoa"
        description="Cadastre um colaborador (desenvolvedor, analista, etc.) para bater com o responsável da planilha/Jira. O vínculo com profile e os valores podem ser feitos depois."
        breadcrumb={
          <Link
            href="/app/developers"
            className="underline-offset-4 hover:underline"
          >
            ← Pessoas
          </Link>
        }
      />
      <Surface>
        <DeveloperForm mode="create" teams={teams} />
      </Surface>
    </PageShell>
  );
}
