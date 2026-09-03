import { EmptyState, DataTable } from "@/components/surface";
import { ListPagination } from "@/components/list-pagination";
import { ListSearchForm } from "@/components/list-search-form";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { FilterBar, SectionShell } from "@/components/ui/section-shell";
import {
  adminListHref,
  parsePageParam,
  parseSearchQuery,
} from "@/lib/admin-list-query";
import { getAppBuildInfo } from "@/lib/app-version";
import { requirePermission } from "@/lib/auth/permissions";
import {
  formatDateBrazil,
  formatTimeBrazil,
} from "@/lib/datetime/format-brazil";
import {
  getAppReleaseByCommitSha,
  listAppReleasesPaged,
  type AppRelease,
} from "@/services/versionamento";
import { GitBranch } from "lucide-react";
import { redirect } from "next/navigation";
import { registerCurrentBuildReleaseAction } from "./actions";

function ReleaseRow({
  release,
}: {
  release: AppRelease;
}) {
  return (
    <tr>
      <td className="whitespace-nowrap font-semibold text-foreground">
        <div>{release.version}</div>
        {release.commit_sha ? (
          <code className="mt-1 block text-[10px] font-normal text-muted-foreground">
            {release.commit_sha.slice(0, 7)}
          </code>
        ) : null}
      </td>
      <td className="whitespace-nowrap text-sm text-foreground">
        {formatDateBrazil(release.released_at)}
      </td>
      <td className="whitespace-nowrap text-sm text-foreground">
        {formatTimeBrazil(release.released_at)}
      </td>
      <td className="min-w-[28rem] max-w-[54rem]">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {release.description}
        </p>
        <div className="my-2 border-t border-border/60 pt-2">
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Commits implementados
          </p>
          <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
            {release.commit_descriptions}
          </p>
        </div>
      </td>
    </tr>
  );
}

export default async function VersionamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requirePermission("versionamento", "access");
  const build = getAppBuildInfo();
  const currentBuildRelease = build.commitSha
    ? await getAppReleaseByCommitSha(build.commitSha)
    : null;
  const params = await searchParams;
  const q = parseSearchQuery(params.q);
  const requestedPage = parsePageParam(params.page);

  let releases: AppRelease[] = [];
  let total = 0;
  let page = requestedPage;
  let totalPages = 1;
  const pageSize = 20;
  let loadError: string | null = null;
  try {
    const paged = await listAppReleasesPaged({
      q,
      page: requestedPage,
      pageSize,
    });
    releases = paged.items;
    total = paged.total;
    page = paged.page;
    totalPages = paged.totalPages;
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Não foi possível carregar o histórico de versões.";
  }
  if (!loadError && requestedPage !== page) {
    redirect(
      adminListHref("/app/versionamento", {
        q: q || null,
        page,
      }),
    );
  }

  return (
    <PageShell size="full">
      <PageHeader
        eyebrow="Governança"
        title="Versionamento"
        description="Log automático dos deploys publicados no DevPulse. Cada registro liga a versão ao commit que está em produção."
      />

      <SectionShell
        title="Versão em execução"
        description="Identificador do build atualmente publicado neste ambiente."
      >
        <div className="ui-dashboard-panel flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-2xl font-semibold tracking-tight text-foreground">
                {build.label}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                A versão é definida por APP_VERSION; o identificador do commit
                confirma o deploy exato.
              </p>
            </div>
            {build.commitSha ? (
              <code className="rounded-[var(--radius-sm)] border border-border/70 bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                {build.commitSha}
              </code>
            ) : null}
          </div>
          {build.commitSha == null ? (
            <div className="rounded-[var(--radius-sm)] border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-100">
              Este ambiente não expôs o hash do commit publicado. Sem esse dado,
              não é possível correlacionar o build atual com o histórico.
            </div>
          ) : currentBuildRelease ? (
            <div className="rounded-[var(--radius-sm)] border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-900 dark:text-emerald-100">
              Este build já está registrado no histórico como{" "}
              <span className="font-semibold">{currentBuildRelease.version}</span>.
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-[var(--radius-sm)] border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-900 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
              <p>
                O commit atual ainda não foi registrado em{" "}
                <code className="rounded bg-background/60 px-1 py-0.5 text-xs">
                  app_releases
                </code>
                . Use o botão abaixo para incluir este build no log de deploys
                sem acoplar escrita ao processo de build.
              </p>
              <form action={registerCurrentBuildReleaseAction}>
                <button type="submit" className="ui-btn-primary whitespace-nowrap">
                  Registrar build atual
                </button>
              </form>
            </div>
          )}
        </div>
      </SectionShell>

      <FilterBar>
        <ListSearchForm
          defaultQuery={q}
          placeholder="Versão, commit ou ajuste…"
          className="flex flex-wrap items-end gap-3"
        />
      </FilterBar>

      {loadError ? (
        <div className="rounded-[var(--radius-sm)] border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-100">
          {loadError}. Aplique as migrations do módulo Versionamento para
          habilitar o histórico.
        </div>
      ) : releases.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="Nenhum deploy registrado"
          description={
            q
              ? `Nenhum deploy encontrado para “${q}”.`
              : "O histórico será preenchido automaticamente após o próximo deploy."
          }
        />
      ) : (
        <SectionShell
          title="Log de deploys"
          description={`${total} deploy${total === 1 ? "" : "s"} registrado${total === 1 ? "" : "s"}${q ? ` para “${q}”` : ""}, do mais recente para o mais antigo.`}
        >
          <DataTable minWidthClassName="min-w-[980px]">
            <thead>
              <tr>
                <th>Número da versão</th>
                <th>Data de lançamento</th>
                <th>Hora de lançamento</th>
                <th>Ajustes e implementações</th>
              </tr>
            </thead>
            <tbody>
              {releases.map((release) => (
                <ReleaseRow key={release.id} release={release} />
              ))}
            </tbody>
          </DataTable>
          <div className="mt-3">
            <ListPagination
              pathname="/app/versionamento"
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              q={q || null}
            />
          </div>
        </SectionShell>
      )}
    </PageShell>
  );
}
