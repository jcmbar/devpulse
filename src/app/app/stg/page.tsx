import Link from "next/link";
import { StgSessionsTable } from "@/app/app/stg/sessions-table";
import { StgSchemaMissingNotice } from "@/components/stg/stg-result-banner";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { TeamFilterForm } from "@/components/team-filter";
import { FilterBar } from "@/components/ui/section-shell";
import { getAppContext } from "@/lib/auth/app-context";
import { hasPermission } from "@/lib/auth/capabilities";
import { requirePermission } from "@/lib/auth/permissions";
import { loadStgOrMissing } from "@/lib/stg/ui";
import { listStgSessions } from "@/services/stg";
import { listTeamsAdmin } from "@/services/teams";

type PageProps = {
  searchParams?: Promise<{ teamId?: string; deleted?: string }>;
};

export default async function StgSessionsPage({ searchParams }: PageProps) {
  await requirePermission("stg", "access");
  const context = await getAppContext();
  const canEditStg = hasPermission(context.grants, "stg", "edit");
  const canAccessJira = hasPermission(context.grants, "jira", "access");
  const params = searchParams ? await searchParams : {};
  const teams = await listTeamsAdmin();
  const teamId =
    params.teamId && teams.some((team) => team.id === params.teamId)
      ? params.teamId
      : undefined;
  const deleted = params.deleted === "1";

  const loaded = await loadStgOrMissing(() =>
    listStgSessions({ teamId, limit: 40 }),
  );

  const sessions = loaded.data ?? [];

  // Light coverage for first sessions only (avoid N+1 blow-up): skip for list
  // KPIs beyond counts by result.
  const resultCounts = {
    approved: sessions.filter((s) => s.result === "approved").length,
    blocked: sessions.filter((s) => s.result === "blocked").length,
    pending: sessions.filter((s) => s.result === "pending").length,
    waived: sessions.filter((s) => s.result === "waived").length,
  };

  return (
    <PageShell size="full">
      <PageHeader
        eyebrow="Release"
        title="STG Day"
        description="Sessões de teste geral por time, com catálogo reutilizável e decisão de produção."
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {canEditStg ? (
              <Link href="/app/stg/catalog" className="ui-btn-secondary">
                Catálogo
              </Link>
            ) : null}
            {canAccessJira ? (
              <Link href="/app/jira" className="ui-btn-secondary">
                Mapeamento Jira
              </Link>
            ) : null}
            {canEditStg ? (
              <Link
                href={
                  teamId
                    ? `/app/stg/new?teamId=${encodeURIComponent(teamId)}`
                    : "/app/stg/new"
                }
                className="ui-btn-primary"
              >
                Nova sessão
              </Link>
            ) : null}
          </div>
        }
      />

      {loaded.schemaMissing ? <StgSchemaMissingNotice /> : null}
      {loaded.error ? (
        <p className="ui-alert-error" role="alert">
          {loaded.error}
        </p>
      ) : null}
      {deleted ? (
        <p className="ui-alert-success" role="status">
          Sessão excluída.
        </p>
      ) : null}

      {!loaded.schemaMissing ? (
        <>
          <FilterBar>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <TeamFilterForm
                teams={teams}
                defaultTeamId={teamId ?? ""}
                includeUnassigned={false}
              />
              <p className="text-xs text-muted-foreground">
                {sessions.length} sessão(ões)
                {teamId
                  ? ` · ${teams.find((t) => t.id === teamId)?.name ?? "time"}`
                  : " · todos os times"}
              </p>
            </div>
          </FilterBar>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="ui-dashboard-panel px-3 py-2.5 text-sm">
              <p className="text-xs text-muted-foreground">Aprovadas</p>
              <p className="text-lg font-semibold tabular-nums text-success">
                {resultCounts.approved}
              </p>
            </div>
            <div className="ui-dashboard-panel px-3 py-2.5 text-sm">
              <p className="text-xs text-muted-foreground">Bloqueadas</p>
              <p className="text-lg font-semibold tabular-nums text-danger">
                {resultCounts.blocked}
              </p>
            </div>
            <div className="ui-dashboard-panel px-3 py-2.5 text-sm">
              <p className="text-xs text-muted-foreground">Pendentes</p>
              <p className="text-lg font-semibold tabular-nums">
                {resultCounts.pending}
              </p>
            </div>
            <div className="ui-dashboard-panel px-3 py-2.5 text-sm">
              <p className="text-xs text-muted-foreground">Waiver</p>
              <p className="text-lg font-semibold tabular-nums text-warning">
                {resultCounts.waived}
              </p>
            </div>
          </div>

          {sessions.length === 0 ? (
            <div className="ui-dashboard-panel text-sm text-muted-foreground">
              Nenhuma sessão STG encontrada
              {teamId ? " para este time" : ""}. Abra uma nova sessão ou
              cadastre o catálogo do time.
            </div>
          ) : (
            <StgSessionsTable
              sessions={sessions}
              teams={teams}
              canEdit={canEditStg}
            />
          )}
        </>
      ) : null}
    </PageShell>
  );
}
