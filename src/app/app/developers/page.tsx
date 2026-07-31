import { AccessStatusBadge } from "@/components/access-status-badge";
import { AdminToolbar } from "@/components/admin-toolbar";
import { DataTable, EmptyState } from "@/components/surface";
import { ListPagination } from "@/components/list-pagination";
import { ListSearchForm } from "@/components/list-search-form";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { TeamFilterForm } from "@/components/team-filter";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { getRoleLabel } from "@/lib/auth/role-labels";
import {
  adminListHref,
  listEmptyMessage,
  parseAdminListQuery,
  type ActiveListFilter,
  type JiraAccountListFilter,
} from "@/lib/admin-list-query";
import {
  formatAccessDate,
  resolveDevelopersAccessInfoMap,
  type DeveloperAccessInfo,
} from "@/services/auth/developer-access";
import { listDevelopersAdminPaged } from "@/services/developers";
import { listTeamsAdmin } from "@/services/teams";
import { Plus, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DeveloperListColumnFilters } from "@/app/app/developers/developer-list-column-filters";
import { DeveloperJiraAccountBatchLookup } from "@/app/app/developers/developer-jira-batch-lookup";
import {
  DeveloperActiveInline,
  DeveloperJiraAccountInline,
  DeveloperTeamInline,
} from "@/app/app/developers/developer-list-quick-edit";

type DevelopersAdminPageProps = {
  searchParams: Promise<{
    teamId?: string;
    q?: string;
    page?: string;
    active?: string;
    jiraId?: string;
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

export default async function DevelopersAdminPage({
  searchParams,
}: DevelopersAdminPageProps) {
  await requireTeamAccess();
  const params = await searchParams;
  const query = parseAdminListQuery(params, { pageSize: 20 });

  const listHrefInput = {
    teamId: query.teamParam || null,
    q: query.q || null,
    active: query.activeFilter,
    jiraId: query.jiraAccountFilter,
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

  return (
    <PageShell size="full">
      <PageHeader
        eyebrow="Cadastro"
        title="Developers"
        description="Cadastro administrativo. Time, status e Jira Account ID podem ser alterados na lista; use Editar para os demais campos."
        actions={
          <Link href="/app/developers/new" className="ui-btn-primary">
            <Plus className="size-3.5" strokeWidth={2} />
            Novo developer
          </Link>
        }
      />

      <AdminToolbar>
        <Suspense
          fallback={
            <p className="text-sm text-muted-foreground">Carregando filtro…</p>
          }
        >
          <TeamFilterForm teams={teams} defaultTeamId={query.teamParam} />
        </Suspense>
        <Suspense
          fallback={
            <p className="text-sm text-muted-foreground">Carregando busca…</p>
          }
        >
          <ListSearchForm
            defaultQuery={query.q}
            placeholder="Nome ou e-mail…"
          />
        </Suspense>
        <Suspense
          fallback={
            <p className="text-sm text-muted-foreground">Carregando filtros…</p>
          }
        >
          <DeveloperListColumnFilters
            activeFilter={query.activeFilter}
            jiraAccountFilter={query.jiraAccountFilter}
          />
        </Suspense>
        <DeveloperJiraAccountBatchLookup
          candidateIds={jiraLookupCandidates}
        />
      </AdminToolbar>

      {accessLookupError ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Status de acesso indisponível: {accessLookupError}
        </p>
      ) : null}

      {developers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={listEmptyMessage("developer", {
            filter: query.teamFilter,
            q: query.q,
            activeFilter: query.activeFilter,
            jiraAccountFilter: query.jiraAccountFilter,
          })}
          description="Ajuste filtros, limpe a busca ou cadastre um novo developer."
          action={
            <Link href="/app/developers/new" className="ui-btn-primary">
              <Plus className="size-3.5" strokeWidth={2} />
              Novo developer
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          <DataTable minWidthClassName="min-w-[980px]">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Time</th>
                <th>Jira Account ID</th>
                <th className="hidden md:table-cell">E-mail</th>
                <th>Cadastro</th>
                <th>Acesso</th>
                <th className="hidden lg:table-cell">Profile</th>
                <th>Cards</th>
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
                    <td className="font-medium">{developer.full_name}</td>
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
                    <td className="hidden md:table-cell">
                      {developer.email ?? "—"}
                    </td>
                    <td>
                      <DeveloperActiveInline
                        developerId={developer.id}
                        isActive={developer.is_active}
                      />
                    </td>
                    <td>
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
                    <td className="hidden lg:table-cell">
                      {developer.profile ? (
                        <span>
                          {developer.profile.full_name ??
                            developer.profile.email}
                          <span className="text-muted-foreground">
                            {" "}
                            · {getRoleLabel(developer.profile.role)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          Sem vínculo
                        </span>
                      )}
                    </td>
                    <td>{developer.cards_count}</td>
                    <td className="text-right">
                      <Link
                        href={`/app/developers/${developer.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        Editar
                      </Link>
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
          />
        </div>
      )}
    </PageShell>
  );
}
