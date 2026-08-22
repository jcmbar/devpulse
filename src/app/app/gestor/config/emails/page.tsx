import Link from "next/link";
import { OperationalEmailsAdminPanel } from "@/app/app/gestor/config/emails/emails-admin-panel";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { Surface } from "@/components/surface";
import { requirePermission } from "@/lib/auth/permissions";
import { resolveOperationalEmailEnvelope } from "@/lib/email/defaults";
import { getZeptoMailSmtpPublicStatus } from "@/lib/email/zeptomail-smtp-config";
import {
  listEmailSendTypes,
  listEmailTemplates,
  listEmailTypeRecipients,
} from "@/services/operational-emails";

export default async function GestorEmailsConfigPage() {
  const context = await requirePermission("emails", "access");

  const [sendTypes, templates] = await Promise.all([
    listEmailSendTypes(),
    listEmailTemplates(),
  ]);
  const smtpStatus = getZeptoMailSmtpPublicStatus();
  const envelope = resolveOperationalEmailEnvelope();
  const canSendSmtpTest = context.profile.role === "admin";

  const recipientsByTypeId: Record<
    string,
    Awaited<ReturnType<typeof listEmailTypeRecipients>>
  > = {};

  await Promise.all(
    sendTypes.map(async (type) => {
      if (type.recipient_mode === "fixed_list") {
        recipientsByTypeId[type.id] = await listEmailTypeRecipients(type.id);
      } else {
        recipientsByTypeId[type.id] = [];
      }
    }),
  );

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
              href="/app/gestor/config/capacidade"
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
          smtpStatus={smtpStatus}
          defaultTestTo={envelope.replyTo}
          canSendSmtpTest={canSendSmtpTest}
        />
      </Surface>
    </PageShell>
  );
}
