import Link from "next/link";
import { DeveloperForm } from "@/app/app/developers/developer-form";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { requirePermission } from "@/lib/auth/permissions";
import { listTeamsAdmin } from "@/services/teams";

export default async function NewDeveloperPage() {
  await requirePermission("pessoas", "edit");
  const teams = await listTeamsAdmin({ includeInactive: true });

  return (
    <PageShell size="md">
      <PageHeader
        title="Nova pessoa"
        description="Cadastre um colaborador para bater com o responsável da planilha/Jira. Vínculo de acesso e valores podem ser feitos depois."
        breadcrumb={
          <Link
            href="/app/developers"
            className="underline-offset-4 hover:underline"
          >
            ← Pessoas
          </Link>
        }
      />
      <DeveloperForm mode="create" teams={teams} />
    </PageShell>
  );
}
