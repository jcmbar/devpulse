import Link from "next/link";
import { OperationalEmailsAdminPanel } from "@/app/app/gestor/config/emails/emails-admin-panel";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { Surface } from "@/components/surface";
import { requireTeamAccess } from "@/lib/auth/permissions";
import {
  listEmailSendTypes,
  listEmailTemplates,
  listEmailTypeRecipients,
  previewEmailTemplate,
} from "@/services/operational-emails";

export default async function GestorEmailsConfigPage() {
  await requireTeamAccess();

  const sendTypes = await listEmailSendTypes();
  const templates = await listEmailTemplates();

  const recipientsByTypeId: Record<
    string,
    Awaited<ReturnType<typeof listEmailTypeRecipients>>
  > = {};
  const previewByTemplateId: Record<string, { subject: string; html: string }> =
    {};

  await Promise.all(
    sendTypes.map(async (type) => {
      if (type.recipient_mode === "fixed_list") {
        recipientsByTypeId[type.id] = await listEmailTypeRecipients(type.id);
      } else {
        recipientsByTypeId[type.id] = [];
      }
    }),
  );

  for (const template of templates) {
    previewByTemplateId[template.id] = previewEmailTemplate(template);
  }

  return (
    <PageShell size="xl">
      <PageHeader
        eyebrow="Configuração"
        title="E-mails operacionais"
        description="Templates e destinatários dos disparos DevPulse (Financeiro, RH e recibo do colaborador). Convite e reset de senha continuam no Auth."
        breadcrumb={
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/app/gestor"
              className="underline-offset-4 hover:underline"
            >
              ← Dashboard
            </Link>
            <Link
              href="/app/gestor/config"
              className="underline-offset-4 hover:underline"
            >
              Capacidade e faixas
            </Link>
          </div>
        }
      />

      <Surface>
        <OperationalEmailsAdminPanel
          sendTypes={sendTypes}
          templates={templates}
          recipientsByTypeId={recipientsByTypeId}
          previewByTemplateId={previewByTemplateId}
        />
      </Surface>
    </PageShell>
  );
}
