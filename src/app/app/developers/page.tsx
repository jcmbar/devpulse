import { AccessStatusBadge } from "@/components/access-status-badge";
import { FilterPersistenceSync } from "@/components/filters/filter-persistence-sync";
import { DataTable, EmptyState } from "@/components/surface";
import { ListPagination } from "@/components/list-pagination";
import { ListSearchForm } from "@/components/list-search-form";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { PersonAvatar } from "@/components/person-avatar";
import { TeamFilterForm } from "@/components/team-filter";
import { FilterBar, SectionShell } from "@/components/ui/section-shell";
import { requirePermission } from "@/lib/auth/permissions";
import { getProfileDisplayLabel } from "@/lib/auth/role-labels";
import {
  adminListHref,
  listEmptyMessage,
  parseAdminListQuery,
  type ActiveListFilter,
  type JiraAccountListFilter,
  type JobTitleListFilter,
} from "@/lib/admin-list-query";
import { restorePersistedFiltersOrRedirect } from "@/lib/filters/persist-server";
import {
  resolveDevelopersAccessInfoMap,
  resolveDevelopersSessionInfoMap,
  type DeveloperAccessInfo,
  type DeveloperSessionInfo,
} from "@/services/auth/developer-access";
import {
  developerAvatarPublicUrl,
  listDevelopersAdmin,
  listDevelopersAdminPaged,
} from "@/services/developers";
import { listTeamsAdmin } from "@/services/teams";
import {
  getJobTitleLabel,
  isDeveloperJobTitle,
  type DeveloperJobTitle,
} from "@/types/developer-compensation";
import { Plus, Users } from "lucide-react";
import { formatDateTimeShortBrazil } from "@/lib/datetime/format-brazil";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DeveloperListColumnFilters } from "@/app/app/developers/developer-list-column-filters";
import { DeveloperJiraAccountBatchLookup } from "@/app/app/developers/developer-jira-batch-lookup";
import { DeleteDeveloperControl } from "@/app/app/developers/delete-developer-control";
import {
  DeveloperActiveInline,
  DeveloperJiraAccountInline,
  DeveloperTeamInline,
} from "@/app/app/developers/developer-list-quick-edit";
import { InlineActions } from "@/components/ui/destructive-action";

type DevelopersAdminPageProps = {
  searchParams: Promise<{
    teamId?: string;
    q?: string;
    page?: string;
    active?: string;
    jiraId?: string;
    jobTitle?: string;
  }>;
};

function toIsActiveFilter(filter: ActiveListFilter): boolean | null {
  if (filter === "active") {
    return true;
  }
  if (filter === "inactive") {
    return false;
  }
  return null;
}

function toHasJiraAccountFilter(
  filter: JiraAccountListFilter,
): boolean | null {
  if (filter === "with") {
    return true;
  }
  if (filter === "without") {
    return false;
  }
  return null;
}

function toJobTitleFilter(filter: JobTitleListFilter): DeveloperJobTitle | null {
  return isDeveloperJobTitle(filter) ? filter : null;
}

function filterSummaryLabel(input: {
  teamName: string | null;
  activeFilter: ActiveListFilter;
  jiraAccountFilter: JiraAccountListFilter;
  jobTitleFilter: JobTitleListFilter;
  q: string;
}): string {
  const parts: string[] = [];
  parts.push(input.teamName ? `Time ${input.teamName}` : "Todos os times");
  if (input.jobTitleFilter !== "all") {
    parts.push(getJobTitleLabel(input.jobTitleFilter));
  }
  if (input.activeFilter === "active") {
    parts.push("ativos");
  } else if (input.activeFilter === "inactive") {
    parts.push("inativos");
  }
  if (input.jiraAccountFilter === "with") {
    parts.push("com Jira ID");
  } else if (input.jiraAccountFilter === "without") {
    parts.push("sem Jira ID");
  }
  if (input.q) {
    parts.push(`busca “${input.q}”`);
  }
  return parts.join(" · ");
}

function formatSessionDuration(seconds: number | null): string {
  if (seconds == null) {
    return "—";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) {
    return "< 1 min";
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) {
    return `${minutes} min`;
  }
  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}min`
    : `${hours}h`;
}

function PresenceBadge({ session }: { session: DeveloperSessionInfo }) {
  return (
    <span
      className={
        session.status === "online"
          ? "inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-emerald-900 dark:text-emerald-200"
          : "inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/60 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground"
      }
      title={
        session.status === "online"
          ? "Atividade registrada recentemente"
          : session.lastSeenAt
            ? `Última atividade em ${formatDateTimeShortBrazil(session.lastSeenAt)}`
            : "Nenhuma sessão registrada"
      }
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${
          session.status === "online" ? "bg-emerald-500" : "bg-slate-400"
        }`}
      />
      {session.status === "online" ? "Online" : "Offline"}
    </span>
  );
}

function PeopleMetric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: number;
  detail?: string;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <div className="ui-dashboard-panel min-w-0 px-3 py-2.5">
      <p className="truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p
          className={
            tone === "success"
              ? "text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300"
              : tone === "warning"
                ? "text-xl font-semibold tabular-nums text-amber-700 dark:text-amber-300"
                : "text-xl font-semibold tabular-nums text-foreground"
          }
        >
          {value}
        </p>
        {detail ? (
          <span className="truncate text-[11px] text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default async function DevelopersAdminPage({
  searchParams,
}: DevelopersAdminPageProps) {
  await requirePermission("pessoas", "access");
  const params = await searchParams;
  await restorePersistedFiltersOrRedirect({
    scope: "admin-developers",
    pathname: "/app/developers",
    searchParams: params,
  });
  const query = parseAdminListQuery(params, { pageSize: 20 });

  const listHrefInput = {
    teamId: query.teamParam || null,
    q: query.q || null,
    active: query.activeFilter,
    jiraId: query.jiraAccountFilter,
    jobTitle: query.jobTitleFilter,
  };

  if (query.teamIdNeedsCanonicalize) {
    redirect(
      adminListHref("/app/developers", {
        ...listHrefInput,
        page: query.page > 1 ? query.page : null,
      }),
    );
  }

  const listInput = {
    ...query.teamScope,
    q: query.q || null,
    isActive: toIsActiveFilter(query.activeFilter),
    hasJiraAccountId: toHasJiraAccountFilter(query.jiraAccountFilter),
    jobTitle: toJobTitleFilter(query.jobTitleFilter),
  };

  const [teams, paged, allDevelopers] = await Promise.all([
    listTeamsAdmin({ includeInactive: true }),
    listDevelopersAdminPaged({
      ...listInput,
      page: query.page,
      pageSize: query.pageSize,
    }),
    listDevelopersAdmin(listInput),
  ]);

  if (query.page !== paged.page) {
    redirect(
      adminListHref("/app/developers", {
        ...listHrefInput,
        page: paged.page > 1 ? paged.page : null,
      }),
    );
  }

  const developers = paged.items;
  const jiraLookupCandidates = developers
    .filter(
      (developer) =>
        Boolean(developer.email?.includes("@")) &&
        !developer.jira_account_id?.trim(),
    )
    .map((developer) => developer.id);

  let accessByDeveloperId = new Map<string, DeveloperAccessInfo>();
  let accessLookupError: string | null = null;
  let sessionByDeveloperId = new Map<string, DeveloperSessionInfo>();
  let sessionLookupError: string | null = null;

  try {
    accessByDeveloperId = await resolveDevelopersAccessInfoMap(allDevelopers);
  } catch (error) {
    accessLookupError =
      error instanceof Error
        ? error.message
        : "Não foi possível carregar o status de acesso.";
  }

  try {
    sessionByDeveloperId =
      await resolveDevelopersSessionInfoMap(allDevelopers);
  } catch (error) {
    sessionLookupError =
      error instanceof Error
        ? error.message
        : "Não foi possível carregar as sessões.";
  }

  const selectedTeamId =
    query.teamFilter.kind === "team" ? query.teamFilter.teamId : null;
  const selectedTeamName =
    selectedTeamId != null
      ? (teams.find((team) => team.id === selectedTeamId)?.name ?? null)
      : query.teamFilter.kind === "unassigned"
        ? "Sem time"
        : null;

  const activeFiltersLabel = filterSummaryLabel({
    teamName: selectedTeamName,
    activeFilter: query.activeFilter,
    jiraAccountFilter: query.jiraAccountFilter,
    jobTitleFilter: query.jobTitleFilter,
    q: query.q,
  });
  const peopleStats = allDevelopers.reduce(
    (stats, developer) => {
      const session = sessionByDeveloperId.get(developer.id);
      const access = accessByDeveloperId.get(developer.id);
      stats.total += 1;
      if (developer.is_active) {
        stats.active += 1;
      } else {
        stats.inactive += 1;
      }
      if (developer.team_id) {
        stats.withTeam += 1;
      } else {
        stats.withoutTeam += 1;
      }
      if (session?.status === "online") {
        stats.online += 1;
      } else {
        stats.offline += 1;
      }
      if (access?.kind === "active") {
        stats.permissionActive += 1;
      } else {
        stats.permissionPending += 1;
      }
      return stats;
    },
    {
      total: 0,
      online: 0,
      offline: 0,
      active: 0,
      inactive: 0,
      permissionActive: 0,
      permissionPending: 0,
      withTeam: 0,
      withoutTeam: 0,
    },
  );

  return (
    <PageShell size="full">
      <FilterPersistenceSync
        scope="admin-developers"
        params={{
          teamId: query.teamParam || undefined,
          active:
            query.activeFilter !== "all" ? query.activeFilter : undefined,
          jiraId:
            query.jiraAccountFilter !== "all"
              ? query.jiraAccountFilter
              : undefined,
          jobTitle:
            query.jobTitleFilter !== "all" ? query.jobTitleFilter : undefined,
        }}
      />
      <PageHeader
        eyebrow="Cadastro"
        title="Pessoas"
        description="Visão compacta do cadastro, acesso e presença da equipe. A edição completa continua disponível em Editar."
        actions={
          <Link href="/app/developers/new" className="ui-btn-primary">
            <Plus className="size-3.5" strokeWidth={2} />
            Nova pessoa
          </Link>
        }
      />

      <section
        aria-label="Resumo de pessoas"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8"
      >
        <PeopleMetric label="Total" value={peopleStats.total} />
        <PeopleMetric
          label="Online"
          value={peopleStats.online}
          tone="success"
        />
        <PeopleMetric label="Offline" value={peopleStats.offline} />
        <PeopleMetric
          label="Ativos"
          value={peopleStats.active}
        />
        <PeopleMetric
          label="Inativos"
          value={peopleStats.inactive}
          tone="warning"
        />
        <PeopleMetric
          label="Permissão ativa"
          value={peopleStats.permissionActive}
          detail={`${peopleStats.permissionPending} pendentes`}
          tone="success"
        />
        <PeopleMetric
          label="Sem organização"
          value={peopleStats.withoutTeam}
          detail={`${peopleStats.withTeam} com organização`}
        />
      </section>

      <FilterBar>
        <div className="space-y-3.5">
          <div className="ui-filter-bar__fields lg:grid-cols-2">
            <div className="ui-filter-bar__field">
              <Suspense
                fallback={
                  <p className="text-sm text-muted-foreground">
                    Carregando time…
                  </p>
                }
              >
                <TeamFilterForm
                  teams={teams}
                  defaultTeamId={query.teamParam}
                  persistScope="admin-developers"
                  className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-2"
                />
              </Suspense>
            </div>
            <div className="ui-filter-bar__field">
              <Suspense
                fallback={
                  <p className="text-sm text-muted-foreground">
                    Carregando busca…
                  </p>
                }
              >
                <ListSearchForm
                  defaultQuery={query.q}
                  placeholder="Nome ou e-mail…"
                  className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-2"
                />
              </Suspense>
            </div>
          </div>

          <div className="border-t border-border/70 pt-3">
            <p className="mb-2 ui-filter-bar__label">Refinar lista</p>
            <Suspense
              fallback={
                <p className="text-sm text-muted-foreground">
                  Carregando filtros…
                </p>
              }
            >
              <DeveloperListColumnFilters
                activeFilter={query.activeFilter}
                jiraAccountFilter={query.jiraAccountFilter}
                jobTitleFilter={query.jobTitleFilter}
                embedded
              />
            </Suspense>
          </div>
        </div>
      </FilterBar>

      <DeveloperJiraAccountBatchLookup
        candidateIds={jiraLookupCandidates}
      />

      {accessLookupError ? (
        <div className="rounded-[var(--radius-sm)] border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-100">
          Status de acesso indisponível: {accessLookupError}
        </div>
      ) : null}
      {sessionLookupError ? (
        <div className="rounded-[var(--radius-sm)] border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-100">
          Sessões indisponíveis: {sessionLookupError}. Aplique a migration de
          sessões para habilitar presença e duração.
        </div>
      ) : null}

      {developers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={listEmptyMessage("developer", {
            filter: query.teamFilter,
            q: query.q,
            activeFilter: query.activeFilter,
            jiraAccountFilter: query.jiraAccountFilter,
            jobTitleFilter: query.jobTitleFilter,
          })}
          description="Ajuste filtros, limpe a busca ou cadastre uma nova pessoa."
          action={
            <Link href="/app/developers/new" className="ui-btn-primary">
              <Plus className="size-3.5" strokeWidth={2} />
              Nova pessoa
            </Link>
          }
        />
      ) : (
        <SectionShell
          title="Lista"
          description={
            <>
              {paged.total} pessoa{paged.total === 1 ? "" : "s"}
              {" · "}
              <span className="text-foreground">{activeFiltersLabel}</span>
              {" · "}
              página {paged.page} de {paged.totalPages}
            </>
          }
        >
          <div className="space-y-3">
            <DataTable
              minWidthClassName="min-w-[1180px] xl:min-w-[1320px]"
              stickyFirstColumn
            >
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Organização</th>
                  <th className="hidden sm:table-cell">Cargo</th>
                  <th className="hidden md:table-cell">Status</th>
                  <th className="hidden md:table-cell">Permissão</th>
                  <th className="hidden lg:table-cell">Sessão</th>
                  <th className="hidden xl:table-cell">Último login</th>
                  <th className="hidden lg:table-cell">Jira Account ID</th>
                  <th>Cadastro</th>
                  <th className="hidden xl:table-cell">Cards</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {developers.map((developer) => {
                  const access = accessByDeveloperId.get(developer.id);
                  const session = sessionByDeveloperId.get(developer.id) ?? {
                    status: "offline",
                    startedAt: null,
                    lastSeenAt: null,
                    endedAt: null,
                    durationSeconds: null,
                  };

                  return (
                    <tr key={developer.id}>
                      <td>
                        <div className="flex min-w-[9rem] items-start gap-2.5 sm:min-w-[12rem]">
                          <PersonAvatar
                            name={developer.full_name}
                            src={developerAvatarPublicUrl(developer.avatar_path)}
                            size="sm"
                            className="mt-0.5"
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">
                              {developer.full_name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {developer.email ?? "Sem e-mail"}
                            </p>
                            {developer.profile ? (
                              <p className="mt-0.5 hidden truncate text-[11px] text-muted-foreground lg:block">
                                Profile:{" "}
                                {developer.profile.full_name ??
                                  developer.profile.email}
                                {" · "}
                                {getProfileDisplayLabel({
                                  role: developer.profile.role,
                                  jobTitle: developer.job_title,
                                })}
                              </p>
                            ) : (
                              <p className="mt-0.5 hidden text-[11px] text-muted-foreground lg:block">
                                Sem vínculo de profile
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="max-w-[170px]">
                        <DeveloperTeamInline
                          developerId={developer.id}
                          teamId={developer.team_id}
                          teams={teams}
                          compact
                        />
                      </td>
                      <td className="hidden sm:table-cell">
                        <span className="text-sm text-foreground">
                          {getJobTitleLabel(developer.job_title)}
                        </span>
                      </td>
                      <td className="hidden md:table-cell">
                        <PresenceBadge session={session} />
                      </td>
                      <td className="hidden max-w-[150px] md:table-cell">
                        {access ? (
                          <AccessStatusBadge
                            kind={access.kind}
                            label={access.label}
                            title={access.description}
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td
                        className="hidden whitespace-nowrap text-sm tabular-nums text-foreground lg:table-cell"
                        title={
                          session.startedAt
                            ? `Início: ${formatDateTimeShortBrazil(session.startedAt)}`
                            : "Nenhuma sessão registrada"
                        }
                      >
                        {formatSessionDuration(session.durationSeconds)}
                      </td>
                      <td className="hidden whitespace-nowrap text-xs text-muted-foreground xl:table-cell">
                        {formatDateTimeShortBrazil(
                          access?.lastSignInAt ?? null,
                          "Nunca",
                        )}
                      </td>
                      <td>
                        <DeveloperJiraAccountInline
                          developerId={developer.id}
                          jiraAccountId={developer.jira_account_id}
                          email={developer.email}
                        />
                      </td>
                      <td>
                        <DeveloperActiveInline
                          developerId={developer.id}
                          isActive={developer.is_active}
                        />
                      </td>
                      <td className="hidden tabular-nums xl:table-cell">
                        {developer.cards_count}
                      </td>
                      <td className="text-right">
                        <InlineActions className="justify-end">
                          <Link
                            href={`/app/developers/${developer.id}`}
                            className="ui-btn-ghost"
                          >
                            Editar
                          </Link>
                          <DeleteDeveloperControl
                            developerId={developer.id}
                            developerName={developer.full_name}
                            hasProfile={Boolean(developer.profile)}
                            variant="inline"
                          />
                        </InlineActions>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
            <ListPagination
              pathname="/app/developers"
              page={paged.page}
              totalPages={paged.totalPages}
              total={paged.total}
              pageSize={paged.pageSize}
              teamId={query.teamParam || null}
              q={query.q || null}
              active={query.activeFilter}
              jiraId={query.jiraAccountFilter}
              jobTitle={query.jobTitleFilter}
            />
          </div>
        </SectionShell>
      )}
    </PageShell>
  );
}
