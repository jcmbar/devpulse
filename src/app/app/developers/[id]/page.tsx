import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteDeveloperControl } from "@/app/app/developers/delete-developer-control";
import { AccessPermissionsPanel } from "@/app/app/developers/access-role-panel";
import { DeveloperCompensationForm } from "@/app/app/developers/developer-compensation-form";
import { DeveloperForm } from "@/app/app/developers/developer-form";
import { InviteUserPanel } from "@/app/app/developers/invite-user-panel";
import { ProfileLinkPanel } from "@/app/app/developers/profile-link-panel";
import { ResendInvitePanel } from "@/app/app/developers/resend-invite-panel";
import { DeveloperAccessSummary } from "@/components/developer-access-summary";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { PersonAvatar } from "@/components/person-avatar";
import { AppViewTabs } from "@/components/ui/app-view-tabs";
import { SectionShell } from "@/components/ui/section-shell";
import { requirePermission } from "@/lib/auth/permissions";
import { listModuleGrantsForProfile } from "@/services/profiles/module-grants";
import { emptyModuleGrants } from "@/lib/auth/capabilities";
import { getRoleLabel } from "@/lib/auth/role-labels";
import { resolveDeveloperAccessInfo } from "@/services/auth/developer-access";
import {
  developerAvatarPublicUrl,
  getCurrentDeveloperCompensation,
  getDeveloperAdmin,
} from "@/services/developers";
import { listTeamsAdmin } from "@/services/teams";
import { getJobTitleLabel } from "@/types/developer-compensation";
import { SyncDeveloperAvatarButton } from "@/app/app/developers/sync-developer-avatar-button";

type EditDeveloperPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

type EditTab = "dados" | "acesso" | "valores";

function parseTab(value: string | undefined): EditTab {
  if (value === "acesso" || value === "valores") {
    return value;
  }
  return "dados";
}

function tabHref(developerId: string, tab: EditTab): string {
  if (tab === "dados") {
    return `/app/developers/${developerId}`;
  }
  return `/app/developers/${developerId}?tab=${tab}`;
}

export default async function EditDeveloperPage({
  params,
  searchParams,
}: EditDeveloperPageProps) {
  await requirePermission("pessoas", "access");
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const activeTab = parseTab(tabParam);

  const [developer, teams, compensation] = await Promise.all([
    getDeveloperAdmin(id),
    listTeamsAdmin({ includeInactive: true }),
    getCurrentDeveloperCompensation(id),
  ]);

  if (!developer) {
    notFound();
  }

  const accessGrants = developer.profile
    ? await listModuleGrantsForProfile(developer.profile.id).catch(() =>
        emptyModuleGrants(),
      )
    : emptyModuleGrants();

  let timeBankBalance = 0;
  if (activeTab === "valores" && compensation?.time_bank_enabled) {
    const { getDeveloperTimeBankBalance } = await import(
      "@/services/time-bank"
    );
    timeBankBalance = await getDeveloperTimeBankBalance(developer.id);
  }

  let access: Awaited<ReturnType<typeof resolveDeveloperAccessInfo>> | null =
    null;
  let accessError: string | null = null;

  if (activeTab === "acesso") {
    try {
      access = await resolveDeveloperAccessInfo(developer);
    } catch (error) {
      accessError =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o status de acesso.";
    }
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
    <PageShell size="lg">
      <PageHeader
        eyebrow="Cadastro"
        title={developer.full_name}
        leading={
          <PersonAvatar
            name={developer.full_name}
            src={developerAvatarPublicUrl(developer.avatar_path)}
            size="lg"
          />
        }
        description={`${getJobTitleLabel(developer.job_title)} · ${developer.cards_count} card(s) · Cadastro ${developer.is_active ? "ativo" : "inativo"}`}
        breadcrumb={
          <Link
            href="/app/developers"
            className="underline-offset-4 hover:underline"
          >
            ← Pessoas
          </Link>
        }
        actions={
          <SyncDeveloperAvatarButton
            developerId={developer.id}
            hasJiraAccountId={Boolean(developer.jira_account_id?.trim())}
          />
        }
      />

      <AppViewTabs
        tabs={[
          {
            href: tabHref(developer.id, "dados"),
            label: "Dados",
            active: activeTab === "dados",
          },
          {
            href: tabHref(developer.id, "acesso"),
            label: "Acesso",
            active: activeTab === "acesso",
          },
          {
            href: tabHref(developer.id, "valores"),
            label: "Valores",
            active: activeTab === "valores",
          },
        ]}
      />

      {activeTab === "dados" ? (
        <>
          <SectionShell
            title="Dados da pessoa"
            description="Nome, cargo, e-mail, time, Jira e localidade."
          >
            <DeveloperForm mode="edit" developer={developer} teams={teams} />
          </SectionShell>

          <SectionShell
            title="Excluir cadastro"
            description="Remove a pessoa da base. Use em testes para limpar dados."
          >
            <div className="ui-dashboard-panel space-y-3">
              <p className="text-sm text-muted-foreground">
                Cards Jira vinculados ficam sem responsável (não são apagados).
                Snapshots, capacidade, valores e fechamentos desta pessoa são
                removidos em cascata.
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
        </>
      ) : null}

      {activeTab === "acesso" ? (
        <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
          <div className="flex flex-col gap-5 lg:col-span-5">
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
                        Próximo passo: vincule o profile na seção abaixo.
                      </p>
                    ) : null}
                    {access.suggestedActions.includes("invite") ? (
                      <p className="text-sm text-muted-foreground">
                        Próximo passo: convidar o usuário para criar o acesso.
                      </p>
                    ) : null}
                    {access.suggestedActions.includes("resend_invite") ? (
                      <p className="text-sm text-muted-foreground">
                        Próximo passo: reenviar o convite se o link expirou.
                      </p>
                    ) : null}
                    {access.suggestedActions.includes("reset_password") ? (
                      <p className="text-sm text-muted-foreground">
                        Acesso ativo. Use a seção de e-mail abaixo se precisar
                        redefinir a senha.
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
              title="Vínculo com profile"
              description="Profile = login. Cadastro = produtividade."
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
                description="Cria Auth + profile e pode vincular a este cadastro."
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

          <div className="lg:col-span-7 lg:sticky lg:top-24">
            <SectionShell
              title="Privilégios de acesso"
              description={
                developer.profile
                  ? `Papel (RLS): ${getRoleLabel(developer.profile.role)}. Defina o que esta pessoa vê e altera em cada módulo.`
                  : "Disponível após vincular profile ou convidar."
              }
            >
              <div className="ui-dashboard-panel">
                {developer.profile ? (
                  <AccessPermissionsPanel
                    developerId={developer.id}
                    profileId={developer.profile.id}
                    initialGrants={accessGrants}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Sem profile vinculado. Convide o usuário (com role inicial)
                    ou vincule um profile existente na coluna ao lado.
                  </p>
                )}
              </div>
            </SectionShell>
          </div>
        </div>
      ) : null}

      {activeTab === "valores" ? (
        <SectionShell
          title="Valores e capacidade contratada"
          description="Remuneração, horas do contrato, banco de horas e diárias. Usado no fechamento e na Folha. Fechamentos já finalizados não são recalculados."
        >
          {compensation?.time_bank_enabled ? (
            <p className="mb-4 text-sm text-muted-foreground">
              Saldo do banco de horas:{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {timeBankBalance > 0 ? "+" : ""}
                {timeBankBalance.toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                })}{" "}
                h
              </span>
              . Movimentos entram ao finalizar novos fechamentos.
            </p>
          ) : null}
          <DeveloperCompensationForm
            developerId={developer.id}
            compensation={compensation}
          />
        </SectionShell>
      ) : null}
    </PageShell>
  );
}
