import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteDeveloperControl } from "@/app/app/developers/delete-developer-control";
import { AccessRolePanel } from "@/app/app/developers/access-role-panel";
import { DeveloperForm } from "@/app/app/developers/developer-form";
import { InviteUserPanel } from "@/app/app/developers/invite-user-panel";
import { ProfileLinkPanel } from "@/app/app/developers/profile-link-panel";
import { ResendInvitePanel } from "@/app/app/developers/resend-invite-panel";
import { DeveloperAccessSummary } from "@/components/developer-access-summary";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { SectionShell } from "@/components/ui/section-shell";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { getRoleLabel } from "@/lib/auth/role-labels";
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
  const showAccessActions = showInvite || showResend;

  return (
    <PageShell size="lg">
      <PageHeader
        eyebrow="Cadastro"
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

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <SectionShell
          title="Status de acesso"
          description="Login, convite e senha."
        >
          <div className="ui-dashboard-panel space-y-3">
            {access ? (
              <>
                <DeveloperAccessSummary access={access} />
                {showLinkHint ? (
                  <p className="text-sm text-muted-foreground">
                    Próximo passo: vincule o profile ao lado.
                  </p>
                ) : null}
                {access.suggestedActions.includes("invite") ? (
                  <p className="text-sm text-muted-foreground">
                    Próximo passo: convidar usuário para criar o acesso.
                  </p>
                ) : null}
                {access.suggestedActions.includes("resend_invite") ? (
                  <p className="text-sm text-muted-foreground">
                    Próximo passo: reenviar o convite se o link expirou.
                  </p>
                ) : null}
                {access.suggestedActions.includes("reset_password") ? (
                  <p className="text-sm text-muted-foreground">
                    Acesso ativo. Redefina a senha na seção de e-mail, se
                    precisar.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {accessError ?? "Status de acesso indisponível."}
              </p>
            )}
          </div>
        </SectionShell>

        <SectionShell
          title="Privilégios de acesso"
          description={
            developer.profile
              ? `Atual: ${getRoleLabel(developer.profile.role)}.`
              : "Disponível após vincular profile ou convidar."
          }
        >
          <div className="ui-dashboard-panel">
            {developer.profile ? (
              <AccessRolePanel
                developerId={developer.id}
                currentRole={developer.profile.role}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Sem profile vinculado. Convide o usuário (escolhe a role
                inicial) ou vincule um profile existente abaixo.
              </p>
            )}
          </div>
        </SectionShell>
      </div>

      <SectionShell
        title="Dados do developer"
        description="Nome, e-mail, time, Jira e localidade."
      >
        <DeveloperForm mode="edit" developer={developer} teams={teams} />
      </SectionShell>

      <div
        className={
          showAccessActions
            ? "grid gap-5 lg:grid-cols-2 lg:items-start"
            : undefined
        }
      >
        <SectionShell
          title="Vínculo com profile"
          description="Profile = login. Developer = produtividade."
        >
          <div className="ui-dashboard-panel">
            <ProfileLinkPanel
              developerId={developer.id}
              linkedProfile={developer.profile}
            />
          </div>
        </SectionShell>

        {showInvite ? (
          <SectionShell
            title="Convidar usuário"
            description="Cria Auth + profile e pode vincular a este developer."
          >
            <div className="ui-dashboard-panel">
              <InviteUserPanel
                developerId={developer.id}
                developerEmail={developer.email}
                developerFullName={developer.full_name}
                embedded
              />
            </div>
          </SectionShell>
        ) : null}

        {showResend && access?.inviteTarget ? (
          <SectionShell
            title="Acesso por e-mail"
            description={
              access.kind === "active"
                ? "Redefina a senha se o usuário perdeu o acesso."
                : "Reenvie o link se o convite expirou ou foi perdido."
            }
          >
            <div className="ui-dashboard-panel">
              <ResendInvitePanel
                developerId={developer.id}
                target={access.inviteTarget}
                embedded
              />
            </div>
          </SectionShell>
        ) : null}
      </div>

      <SectionShell
        title="Excluir cadastro"
        description="Remove o developer da base. Use em testes para limpar dados."
      >
        <div className="ui-dashboard-panel space-y-3">
          <p className="text-sm text-muted-foreground">
            Cards Jira vinculados ficam sem responsável (não são apagados).
            Snapshots, capacidade e fechamentos deste developer são removidos em
            cascata.
          </p>
          <DeleteDeveloperControl
            developerId={developer.id}
            developerName={developer.full_name}
            hasProfile={Boolean(developer.profile)}
            variant="panel"
            showAuthOption
          />
        </div>
      </SectionShell>
    </PageShell>
  );
}
