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
import { requireTeamAccess } from "@/lib/auth/permissions";
import { getRoleLabel } from "@/lib/auth/role-labels";
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
  formatAccessDate,
  resolveDevelopersAccessInfoMap,
  type DeveloperAccessInfo,
} from "@/services/auth/developer-access";
import {
  developerAvatarPublicUrl,
  listDevelopersAdminPaged,
} from "@/services/developers";
import { listTeamsAdmin } from "@/services/teams";
import {
  getJobTitleLabel,
  isDeveloperJobTitle,
  type DeveloperJobTitle,
} from "@/types/developer-compensation";
import { Plus, Users } from "lucide-react";
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

export default async function DevelopersAdminPage({
  searchParams,
}: DevelopersAdminPageProps) {
  await requireTeamAccess();
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

  const [teams, paged] = await Promise.all([
    listTeamsAdmin({ includeInactive: true }),
    listDevelopersAdminPaged({
      ...query.teamScope,
      q: query.q || null,
      isActive: toIsActiveFilter(query.activeFilter),
      hasJiraAccountId: toHasJiraAccountFilter(query.jiraAccountFilter),
      jobTitle: toJobTitleFilter(query.jobTitleFilter),
      page: query.page,
      pageSize: query.pageSize,
    }),
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

  try {
    accessByDeveloperId = await resolveDevelopersAccessInfoMap(developers);
  } catch (error) {
    accessLookupError =
      error instanceof Error
        ? error.message
        : "Não foi possível carregar o status de acesso.";
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
        description="Gerencie o cadastro do time: filtros à esquerda, edição rápida na lista e detalhes (dados, acesso e valores) em Editar."
        actions={
          <Link href="/app/developers/new" className="ui-btn-primary">
            <Plus className="size-3.5" strokeWidth={2} />
            Nova pessoa
          </Link>
        }
      />

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
            <DataTable minWidthClassName="min-w-0 lg:min-w-[960px]" stickyFirstColumn>
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th className="hidden sm:table-cell">Cargo</th>
                  <th>Time</th>
                  <th>Jira Account ID</th>
                  <th>Cadastro</th>
                  <th className="hidden md:table-cell">Acesso</th>
                  <th className="hidden lg:table-cell">Cards</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {developers.map((developer) => {
                  const access = accessByDeveloperId.get(developer.id);
                  const accessDate = formatAccessDate(
                    access?.relevantAt ?? null,
                  );

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
                                {getRoleLabel(developer.profile.role)}
                              </p>
                            ) : (
                              <p className="mt-0.5 hidden text-[11px] text-muted-foreground lg:block">
                                Sem vínculo de profile
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell">
                        <span className="text-sm text-foreground">
                          {getJobTitleLabel(developer.job_title)}
                        </span>
                      </td>
                      <td>
                        <DeveloperTeamInline
                          developerId={developer.id}
                          teamId={developer.team_id}
                          teams={teams}
                        />
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
                      <td className="hidden md:table-cell">
                        {access ? (
                          <div className="space-y-1">
                            <AccessStatusBadge
                              kind={access.kind}
                              label={access.label}
                              title={access.description}
                            />
                            {accessDate && access.relevantAtLabel ? (
                              <p className="text-xs text-muted-foreground">
                                {access.relevantAtLabel} {accessDate}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="hidden tabular-nums lg:table-cell">
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
