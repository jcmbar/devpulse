import Link from "next/link";
import { StgSchemaMissingNotice } from "@/components/stg/stg-result-banner";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { DataTable } from "@/components/surface";
import { TeamFilterForm } from "@/components/team-filter";
import { FilterBar } from "@/components/ui/section-shell";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { loadStgOrMissing, stgResultLabel, stgStatusLabel } from "@/lib/stg/ui";
import { listStgSessions } from "@/services/stg";
import { listTeamsAdmin } from "@/services/teams";

type PageProps = {
  searchParams?: Promise<{ teamId?: string }>;
};

export default async function StgSessionsPage({ searchParams }: PageProps) {
  await requireTeamAccess();
  const params = searchParams ? await searchParams : {};
  const teams = await listTeamsAdmin();
  const teamId =
    params.teamId && teams.some((team) => team.id === params.teamId)
      ? params.teamId
      : undefined;

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
            <Link href="/app/stg/catalog" className="ui-btn-secondary">
              Catálogo
            </Link>
            <Link href="/app/jira" className="ui-btn-secondary">
              Mapeamento Jira
            </Link>
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
          </div>
        }
      />

      {loaded.schemaMissing ? <StgSchemaMissingNotice /> : null}
      {loaded.error ? (
        <p className="ui-alert-error" role="alert">
          {loaded.error}
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
            <DataTable minWidthClassName="min-w-[820px]" stickyFirstColumn>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Time</th>
                  <th>Versão</th>
                  <th>Ambiente</th>
                  <th>Status</th>
                  <th>Resultado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => {
                  const team = teams.find((row) => row.id === session.team_id);
                  return (
                    <tr key={session.id}>
                      <td className="whitespace-nowrap font-medium">
                        {session.scheduled_on}
                      </td>
                      <td>{team?.name ?? session.team_id.slice(0, 8)}</td>
                      <td>{session.version_label}</td>
                      <td className="text-muted-foreground">
                        {session.environment}
                      </td>
                      <td>{stgStatusLabel(session.status)}</td>
                      <td>
                        <span
                          className={
                            session.result === "approved"
                              ? "text-success"
                              : session.result === "blocked"
                                ? "text-danger font-medium"
                                : session.result === "waived"
                                  ? "text-warning"
                                  : "text-muted-foreground"
                          }
                        >
                          {stgResultLabel(session.result)}
                        </span>
                      </td>
                      <td className="text-right">
                        <Link
                          href={`/app/stg/${session.id}`}
                          className="ui-btn-ghost"
                        >
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          )}
        </>
      ) : null}
    </PageShell>
  );
}
