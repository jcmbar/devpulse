import { ReleaseForm } from "@/app/app/versionamento/release-form";
import { DestructiveAction } from "@/components/ui/destructive-action";
import { EmptyState } from "@/components/surface";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { DataTable } from "@/components/surface";
import { SectionShell } from "@/components/ui/section-shell";
import { getAppBuildInfo } from "@/lib/app-version";
import { hasPermission } from "@/lib/auth/capabilities";
import { requirePermission } from "@/lib/auth/permissions";
import { formatDateTimeBrazil } from "@/lib/datetime/format-brazil";
import {
  deleteAppReleaseAction,
} from "@/app/app/versionamento/actions";
import {
  listAppReleases,
  type AppRelease,
  type ReleaseType,
} from "@/services/versionamento";
import { GitBranch, Plus } from "lucide-react";

const RELEASE_TYPE_LABELS: Record<ReleaseType, string> = {
  major: "Major",
  minor: "Minor",
  patch: "Patch",
  hotfix: "Hotfix",
};

const RELEASE_TYPE_STYLES: Record<ReleaseType, string> = {
  major:
    "border-violet-500/35 bg-violet-500/10 text-violet-800 dark:text-violet-200",
  minor:
    "border-sky-500/35 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  patch:
    "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  hotfix:
    "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200",
};

function ReleaseTypeBadge({ type }: { type: ReleaseType }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${RELEASE_TYPE_STYLES[type]}`}
    >
      {RELEASE_TYPE_LABELS[type]}
    </span>
  );
}

function ReleaseRow({
  release,
  canDelete,
}: {
  release: AppRelease;
  canDelete: boolean;
}) {
  return (
    <tr>
      <td className="whitespace-nowrap font-semibold text-foreground">
        {release.version}
      </td>
      <td className="whitespace-nowrap">
        <ReleaseTypeBadge type={release.release_type} />
      </td>
      <td className="whitespace-nowrap text-sm text-foreground">
        {formatDateTimeBrazil(release.released_at)}
      </td>
      <td className="min-w-[18rem] max-w-[30rem]">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {release.description}
        </p>
      </td>
      <td className="min-w-[22rem] max-w-[38rem]">
        <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
          {release.commit_descriptions}
        </p>
      </td>
      <td className="whitespace-nowrap text-xs text-muted-foreground">
        {release.author?.full_name ?? release.author?.email ?? "—"}
      </td>
      {canDelete ? (
        <td className="text-right">
          <DestructiveAction
            formAction={deleteAppReleaseAction}
            label="Excluir"
            description="Esta versão será removida do histórico."
          >
            <input type="hidden" name="releaseId" value={release.id} />
          </DestructiveAction>
        </td>
      ) : null}
    </tr>
  );
}

export default async function VersionamentoPage() {
  const context = await requirePermission("versionamento", "access");
  const build = getAppBuildInfo();
  const canEdit = hasPermission(context.grants, "versionamento", "edit");
  const canDelete = hasPermission(context.grants, "versionamento", "delete");

  let releases: AppRelease[] = [];
  let loadError: string | null = null;
  try {
    releases = await listAppReleases();
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Não foi possível carregar o histórico de versões.";
  }

  return (
    <PageShell size="full">
      <PageHeader
        eyebrow="Governança"
        title="Versionamento"
        description="Identifique exatamente qual versão está em produção e mantenha o histórico das entregas do DevPulse."
        actions={
          canEdit ? (
            <a href="#nova-versao" className="ui-btn-primary">
              <Plus className="size-3.5" strokeWidth={2} />
              Nova versão
            </a>
          ) : null
        }
      />

      <SectionShell
        title="Versão em execução"
        description="Identificador do build atualmente publicado neste ambiente."
      >
        <div className="ui-dashboard-panel flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
      </SectionShell>

      {canEdit ? (
        <SectionShell
          title="Cadastrar lançamento"
          description="Registre a data, o tipo e o conjunto de commits entregue nesta versão."
          className="scroll-mt-6"
        >
          <div id="nova-versao">
            <ReleaseForm />
          </div>
        </SectionShell>
      ) : null}

      {loadError ? (
        <div className="rounded-[var(--radius-sm)] border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-100">
          {loadError}. Aplique as migrations do módulo Versionamento para
          habilitar o histórico.
        </div>
      ) : releases.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="Nenhuma versão cadastrada"
          description={
            canEdit
              ? "Cadastre o primeiro lançamento para iniciar o histórico."
              : "O histórico de lançamentos ainda não foi preenchido."
          }
        />
      ) : (
        <SectionShell
          title="Histórico de lançamentos"
          description={`${releases.length} versão${releases.length === 1 ? "" : "ões"} cadastrada${releases.length === 1 ? "" : "s"}, da mais recente para a mais antiga.`}
        >
          <DataTable minWidthClassName="min-w-[1160px]">
            <thead>
              <tr>
                <th>Versão</th>
                <th>Tipo</th>
                <th>Lançamento</th>
                <th>Descrição</th>
                <th>Commits implementados</th>
                <th>Registrado por</th>
                {canDelete ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {releases.map((release) => (
                <ReleaseRow
                  key={release.id}
                  release={release}
                  canDelete={canDelete}
                />
              ))}
            </tbody>
          </DataTable>
        </SectionShell>
      )}
    </PageShell>
  );
}
