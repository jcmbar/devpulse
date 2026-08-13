import Link from "next/link";
import { NewSessionWizard } from "@/app/app/stg/new-session-wizard";
import { StgSchemaMissingNotice } from "@/components/stg/stg-result-banner";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { loadStgOrMissing } from "@/lib/stg/ui";
import { listDevelopersAdmin } from "@/services/developers";
import {
  ensureStgTeamDefaults,
  listStgModulesWithScenarios,
  suggestStgSessionParticipants,
} from "@/services/stg";
import { listTeamsAdmin } from "@/services/teams";

type PageProps = {
  searchParams?: Promise<{ teamId?: string }>;
};

export default async function NewStgSessionPage({ searchParams }: PageProps) {
  await requireTeamAccess();
  const params = searchParams ? await searchParams : {};
  const teams = await listTeamsAdmin();
  const teamId =
    (params.teamId && teams.some((team) => team.id === params.teamId)
      ? params.teamId
      : null) ??
    teams[0]?.id ??
    null;

  if (!teamId) {
    return (
      <PageShell size="full">
        <PageHeader
          eyebrow="STG Day"
          title="Nova sessão"
          description="Cadastre um time antes de abrir uma STG."
        />
        <div className="ui-dashboard-panel text-sm text-muted-foreground">
          Nenhum time ativo.{" "}
          <Link href="/app/teams" className="ui-btn-ghost">
            Ir para Times
          </Link>
        </div>
      </PageShell>
    );
  }

  const bundle = await loadStgOrMissing(async () => {
    const [defaults, catalog, suggestions, developers] = await Promise.all([
      ensureStgTeamDefaults(teamId),
      listStgModulesWithScenarios(teamId),
      suggestStgSessionParticipants(teamId),
      listDevelopersAdmin({ teamId, isActive: true }),
    ]);
    return { defaults, catalog, suggestions, developers };
  });

  const nameById = new Map(
    (bundle.data?.developers ?? []).map((row) => [row.id, row.full_name]),
  );

  const participants =
    bundle.data?.suggestions.map((row) => ({
      developerId: row.developerId,
      fullName: nameById.get(row.developerId) ?? row.developerId.slice(0, 8),
      suggested: row.participation,
    })) ?? [];

  return (
    <PageShell size="full">
      <PageHeader
        eyebrow="STG Day"
        title="Nova sessão"
        description="Snapshot de cenários, participantes e política do time na abertura."
        actions={
          <Link href="/app/stg" className="ui-btn-secondary">
            Voltar à lista
          </Link>
        }
      />

      {bundle.schemaMissing ? <StgSchemaMissingNotice /> : null}
      {bundle.error ? (
        <p className="ui-alert-error" role="alert">
          {bundle.error}
        </p>
      ) : null}

      {!bundle.schemaMissing && bundle.data ? (
        <NewSessionWizard
          key={teamId}
          teams={teams}
          initialTeamId={teamId}
          catalog={bundle.data.catalog}
          participants={participants}
          defaultEnvironment={bundle.data.defaults.default_environment}
        />
      ) : null}
    </PageShell>
  );
}
