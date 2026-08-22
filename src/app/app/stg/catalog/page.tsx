import Link from "next/link";
import { StgCatalogPanel } from "@/app/app/stg/catalog-panel";
import { StgSchemaMissingNotice } from "@/components/stg/stg-result-banner";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { requirePermission } from "@/lib/auth/permissions";
import { loadStgOrMissing } from "@/lib/stg/ui";
import { listDevelopersAdmin } from "@/services/developers";
import {
  ensureStgTeamDefaults,
  listStgDefaultParticipants,
  listStgModulesWithScenarios,
} from "@/services/stg";
import { listTeamsAdmin } from "@/services/teams";

type PageProps = {
  searchParams?: Promise<{ teamId?: string }>;
};

export default async function StgCatalogPage({ searchParams }: PageProps) {
  await requirePermission("stg", "access");
  const params = searchParams ? await searchParams : {};
  const teams = await listTeamsAdmin();
  const team =
    teams.find((row) => row.id === params.teamId) ?? teams[0] ?? null;

  if (!team) {
    return (
      <PageShell size="full">
        <PageHeader eyebrow="STG Day" title="Catálogo" />
        <div className="ui-dashboard-panel text-sm text-muted-foreground">
          Cadastre um time primeiro.{" "}
          <Link href="/app/teams" className="ui-btn-ghost">
            Times
          </Link>
        </div>
      </PageShell>
    );
  }

  const loaded = await loadStgOrMissing(async () => {
    const [defaults, catalog, defaultParticipants, developers] =
      await Promise.all([
        ensureStgTeamDefaults(team.id),
        listStgModulesWithScenarios(team.id, { includeInactive: true }),
        listStgDefaultParticipants(team.id),
        listDevelopersAdmin({ teamId: team.id, isActive: true }),
      ]);
    return { defaults, catalog, defaultParticipants, developers };
  });

  return (
    <PageShell size="full">
      <PageHeader
        eyebrow="STG Day"
        title="Catálogo"
        description={`Módulos, cenários, participantes padrão e política de ${team.name}.`}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Link href="/app/stg" className="ui-btn-secondary">
              Sessões
            </Link>
            <Link
              href={`/app/stg/new?teamId=${team.id}`}
              className="ui-btn-primary"
            >
              Nova sessão
            </Link>
          </div>
        }
      />

      {loaded.schemaMissing ? <StgSchemaMissingNotice /> : null}
      {loaded.error ? (
        <p className="ui-alert-error" role="alert">
          {loaded.error}
        </p>
      ) : null}

      {!loaded.schemaMissing && loaded.data ? (
        <StgCatalogPanel
          key={team.id}
          team={team}
          teams={teams}
          catalog={loaded.data.catalog}
          defaults={loaded.data.defaults}
          defaultParticipants={loaded.data.defaultParticipants}
          developers={loaded.data.developers.map((row) => ({
            id: row.id,
            full_name: row.full_name,
          }))}
        />
      ) : null}
    </PageShell>
  );
}
