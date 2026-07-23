import Link from "next/link";
import { notFound } from "next/navigation";
import { DeveloperAccessSummary } from "@/components/developer-access-summary";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { DeveloperForm } from "@/app/app/developers/developer-form";
import { InviteUserPanel } from "@/app/app/developers/invite-user-panel";
import { ProfileLinkPanel } from "@/app/app/developers/profile-link-panel";
import { ResendInvitePanel } from "@/app/app/developers/resend-invite-panel";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { resolveDeveloperAccessInfo } from "@/services/auth/developer-access";
import { getDeveloperAdmin } from "@/services/developers";
import { listTeamsAdmin } from "@/services/teams";

type EditDeveloperPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditDeveloperPage({
  params,
}: EditDeveloperPageProps) {
  await requireTeamAccess();
  const { id } = await params;
  const [developer, teams] = await Promise.all([
    getDeveloperAdmin(id),
    listTeamsAdmin({ includeInactive: true }),
  ]);

  if (!developer) {
    notFound();
  }

  let access: Awaited<ReturnType<typeof resolveDeveloperAccessInfo>> | null =
    null;
  let accessError: string | null = null;

  try {
    access = await resolveDeveloperAccessInfo(developer);
  } catch (error) {
    accessError =
      error instanceof Error
        ? error.message
        : "Não foi possível carregar o status de acesso.";
  }

  const showInvite =
    Boolean(access?.suggestedActions.includes("invite")) && !developer.profile;
  const showResend =
    Boolean(access?.inviteTarget?.authUserId) &&
    Boolean(
      access?.suggestedActions.includes("resend_invite") ||
        access?.suggestedActions.includes("reset_password"),
    );
  const showLinkHint = Boolean(
    access?.suggestedActions.includes("link_profile"),
  );

  return (
    <PageShell size="md">
      <PageHeader
        title={developer.full_name}
        description={`${developer.cards_count} card(s) vinculados · Cadastro ${developer.is_active ? "ativo" : "inativo"}`}
        breadcrumb={
          <Link
            href="/app/developers"
            className="underline-offset-4 hover:underline"
          >
            ← Developers
          </Link>
        }
      />

      <section className="space-y-4">
        <h2 className="text-lg font-medium tracking-tight">Status de acesso</h2>
        {access ? (
          <>
            <DeveloperAccessSummary access={access} />
            {showLinkHint ? (
              <p className="text-sm text-muted-foreground">
                Próximo passo sugerido: vincule o profile na seção abaixo.
              </p>
            ) : null}
            {access.suggestedActions.includes("invite") ? (
              <p className="text-sm text-muted-foreground">
                Próximo passo sugerido: convidar usuário para criar o acesso.
              </p>
            ) : null}
            {access.suggestedActions.includes("resend_invite") ? (
              <p className="text-sm text-muted-foreground">
                Próximo passo sugerido: reenviar o convite se o link expirou ou
                foi perdido.
              </p>
            ) : null}
            {access.suggestedActions.includes("reset_password") ? (
              <p className="text-sm text-muted-foreground">
                Acesso ativo. Se necessário, envie redefinição de senha na seção
                de e-mail.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {accessError ?? "Status de acesso indisponível."}
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium tracking-tight">Dados</h2>
        <DeveloperForm mode="edit" developer={developer} teams={teams} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium tracking-tight">
          Vínculo com profile
        </h2>
        <p className="text-sm text-muted-foreground">
          O profile controla login/acesso. O developer controla a produtividade.
        </p>
        <ProfileLinkPanel
          developerId={developer.id}
          linkedProfile={developer.profile}
        />
      </section>

      {showInvite ? (
        <section className="space-y-4 border-t border-border pt-8">
          <h2 className="text-lg font-medium tracking-tight">
            Convidar usuário
          </h2>
          <p className="text-sm text-muted-foreground">
            Cria o acesso no Auth, sincroniza o profile e pode vincular a este
            developer sem usar o painel do Supabase.
          </p>
          <InviteUserPanel
            developerId={developer.id}
            developerEmail={developer.email}
            developerFullName={developer.full_name}
          />
        </section>
      ) : null}

      {showResend && access?.inviteTarget ? (
        <section className="space-y-4 border-t border-border pt-8">
          <h2 className="text-lg font-medium tracking-tight">
            Acesso por e-mail
          </h2>
          <p className="text-sm text-muted-foreground">
            {access.kind === "active"
              ? "Envie redefinição de senha se o usuário perdeu o acesso."
              : "Reenvie o link se o convite expirou, foi perdido ou o usuário não concluiu a senha."}
          </p>
          <ResendInvitePanel
            developerId={developer.id}
            target={access.inviteTarget}
          />
        </section>
        ) : null}
    </PageShell>
  );
}
