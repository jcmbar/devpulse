import Link from "next/link";
import { StgSessionHub } from "@/app/app/stg/session-hub";
import { StgSchemaMissingNotice } from "@/components/stg/stg-result-banner";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { getAppContext } from "@/lib/auth/app-context";
import { hasPermission } from "@/lib/auth/capabilities";
import { requirePermission } from "@/lib/auth/permissions";
import { formatDateBrazil } from "@/lib/datetime/format-brazil";
import { loadStgOrMissing } from "@/lib/stg/ui";
import { developerAvatarPublicUrl, listDevelopersAdmin } from "@/services/developers";
import { getStgSessionDetail } from "@/services/stg";
import { listTeamsAdmin } from "@/services/teams";
import { notFound } from "next/navigation";

type PageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function StgSessionPage({ params }: PageProps) {
  await requirePermission("stg", "access");
  const context = await getAppContext();
  const canEditStg = hasPermission(context.grants, "stg", "edit");
  const canDeleteStg = hasPermission(context.grants, "stg", "delete");
  const { sessionId } = await params;

  const loaded = await loadStgOrMissing(() => getStgSessionDetail(sessionId));

  if (loaded.schemaMissing) {
    return (
      <PageShell size="full">
        <PageHeader eyebrow="STG Day" title="Sessão" />
        <StgSchemaMissingNotice />
      </PageShell>
    );
  }

  if (loaded.error) {
    return (
      <PageShell size="full">
        <PageHeader eyebrow="STG Day" title="Sessão" />
        <p className="ui-alert-error" role="alert">
          {loaded.error}
        </p>
      </PageShell>
    );
  }

  if (!loaded.data) {
    notFound();
  }

  const detail = loaded.data;
  const [teams, developers] = await Promise.all([
    listTeamsAdmin({ includeInactive: true }),
    listDevelopersAdmin(),
  ]);
  const team = teams.find((row) => row.id === detail.session.team_id) ?? null;
  const developerNames = Object.fromEntries(
    developers.map((row) => [row.id, row.full_name]),
  );
  const developerAvatarUrls = Object.fromEntries(
    developers.map((row) => [
      row.id,
      developerAvatarPublicUrl(row.avatar_path),
    ]),
  );
  const loggedInDeveloperId = context.developer?.id ?? null;
  const loggedInDeveloperName = loggedInDeveloperId
    ? (developerNames[loggedInDeveloperId] ?? null)
    : null;

  return (
    <PageShell size="full">
      <PageHeader
        eyebrow="STG Day"
        title={`${formatDateBrazil(detail.session.scheduled_on)} - Versão ${detail.session.version_label}`}
        description={
          detail.session.scope_notes?.trim() ||
          `${team?.name ?? "Time"} · ${detail.session.environment}`
        }
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Link href="/app/stg" className="ui-btn-secondary">
              Lista
            </Link>
            {canEditStg ? (
              <Link
                href={`/app/stg/catalog?teamId=${detail.session.team_id}`}
                className="ui-btn-secondary"
              >
                Catálogo
              </Link>
            ) : null}
          </div>
        }
      />
      <StgSessionHub
        detail={detail}
        team={team}
        developerNames={developerNames}
        developerAvatarUrls={developerAvatarUrls}
        canEdit={canEditStg}
        canDelete={canDeleteStg}
        loggedInDeveloperId={loggedInDeveloperId}
        loggedInDeveloperName={loggedInDeveloperName}
      />
    </PageShell>
  );
}
