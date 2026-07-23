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
        title="Novo developer"
        description="Cadastre um developer para bater com o responsável da planilha. O vínculo com profile pode ser feito depois."
        breadcrumb={
          <Link
            href="/app/developers"
            className="underline-offset-4 hover:underline"
          >
            ← Developers
          </Link>
        }
      />
      <Surface>
        <DeveloperForm mode="create" teams={teams} />
      </Surface>
    </PageShell>
  );
}
