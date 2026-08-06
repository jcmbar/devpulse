import { ChangePasswordForm } from "@/app/app/conta/change-password-form";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { Surface } from "@/components/surface";
import { getRoleLabel } from "@/lib/auth/role-labels";
import { getAppContext } from "@/lib/auth/app-context";

export default async function ContaPage() {
  const { profile } = await getAppContext();

  return (
    <PageShell size="md">
      <PageHeader
        eyebrow="Conta"
        title="Meu perfil"
        description="Dados de acesso e troca de senha."
      />

      <div className="space-y-4">
        <Surface className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">Identificação</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Nome
              </dt>
              <dd className="mt-1 text-foreground">
                {profile.full_name?.trim() || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                E-mail
              </dt>
              <dd className="mt-1 break-all text-foreground">{profile.email}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Perfil de acesso
              </dt>
              <dd className="mt-1 text-foreground">
                {getRoleLabel(profile.role)}
              </dd>
            </div>
          </dl>
        </Surface>

        <Surface className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Trocar senha
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Informe a senha atual e defina uma nova com pelo menos 8
              caracteres.
            </p>
          </div>
          <ChangePasswordForm email={profile.email} />
        </Surface>
      </div>
    </PageShell>
  );
}
