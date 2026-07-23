import { ImportForm } from "@/app/app/imports/import-form";
import { AdminToolbar } from "@/components/admin-toolbar";
import { DataTable, EmptyState, Surface } from "@/components/surface";
import { ListPagination } from "@/components/list-pagination";
import { ListSearchForm } from "@/components/list-search-form";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { TeamFilterForm } from "@/components/team-filter";
import { requireImportAccess } from "@/lib/auth/permissions";
import {
  adminListHref,
  listEmptyMessage,
  parseAdminListQuery,
} from "@/lib/admin-list-query";
import { listImportsAdminPaged } from "@/services/imports";
import { listTeamsAdmin } from "@/services/teams";
import { formatTeamLabel } from "@/services/teams/labels";
import { FileSpreadsheet, Upload } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";

type ImportsPageProps = {
  searchParams: Promise<{
    teamId?: string;
    q?: string;
    page?: string;
  }>;
};

export default async function ImportsPage({ searchParams }: ImportsPageProps) {
  await requireImportAccess();
  const params = await searchParams;
  const query = parseAdminListQuery(params, { pageSize: 15 });

  if (query.teamIdNeedsCanonicalize) {
    redirect(
      adminListHref("/app/imports", {
        teamId: query.teamParam || null,
        q: query.q || null,
        page: query.page > 1 ? query.page : null,
      }),
    );
  }

  const [teams, paged] = await Promise.all([
    listTeamsAdmin({ includeInactive: true }),
    listImportsAdminPaged({
      ...query.teamScope,
      q: query.q || null,
      page: query.page,
      pageSize: query.pageSize,
    }),
  ]);

  if (query.page !== paged.page) {
    redirect(
      adminListHref("/app/imports", {
        teamId: query.teamParam || null,
        q: query.q || null,
        page: paged.page > 1 ? paged.page : null,
      }),
    );
  }

  const recentImports = paged.items;

  return (
    <PageShell size="xl">
      <PageHeader
        eyebrow="Pipeline"
        title="Importação de planilha"
        description="Upload completo por time (prefixo Jira). Mistura de prefixos é bloqueada. Mantemos as 2 importações ativas mais recentes por time."
      />

      <Surface>
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand-foreground">
              <Upload className="size-4" strokeWidth={1.9} />
            </span>
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                Nova importação
              </h2>
              <p className="text-xs text-muted-foreground">
                Arquivo completo · detecção automática de time
              </p>
            </div>
          </div>
          <ImportForm />
        </div>
      </Surface>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Importações recentes
            </h2>
            <p className="text-sm text-muted-foreground">
              Histórico filtrável por time e texto.
            </p>
          </div>
        </div>
        <AdminToolbar title="Filtros da listagem">
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
              placeholder="Arquivo, status ou notas…"
            />
          </Suspense>
        </AdminToolbar>

        {recentImports.length === 0 ? (
          <EmptyState
            icon={FileSpreadsheet}
            title={listEmptyMessage("import", {
              filter: query.teamFilter,
              q: query.q,
            })}
            description="Envie uma planilha acima ou ajuste o filtro de time/busca."
          />
        ) : (
          <div className="space-y-3">
            <DataTable minWidthClassName="min-w-[640px]">
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Time</th>
                  <th className="hidden sm:table-cell">Faixa detectada</th>
                  <th>Status</th>
                  <th>Cards</th>
                  <th className="hidden md:table-cell">Retenção</th>
                </tr>
              </thead>
              <tbody>
                {recentImports.map((item) => (
                  <tr key={item.id}>
                    <td>{item.source_label ?? "—"}</td>
                    <td>
                      {item.team_name && item.jira_key_prefix
                        ? formatTeamLabel({
                            name: item.team_name,
                            jiraKeyPrefix: item.jira_key_prefix,
                            code: item.team_code ?? undefined,
                          })
                        : "—"}
                    </td>
                    <td className="hidden sm:table-cell">
                      {item.period_start && item.period_end
                        ? `${item.period_start} → ${item.period_end}`
                        : "—"}
                    </td>
                    <td>{item.status}</td>
                    <td>{item.records_count}</td>
                    <td className="hidden text-muted-foreground md:table-cell">
                      {item.archived_at ? "arquivado" : "ativo"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <ListPagination
              pathname="/app/imports"
              page={paged.page}
              totalPages={paged.totalPages}
              total={paged.total}
              pageSize={paged.pageSize}
              teamId={query.teamParam || null}
              q={query.q || null}
            />
          </div>
        )}
      </section>
    </PageShell>
  );
}
