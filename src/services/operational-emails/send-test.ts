import "server-only";

import { formatDateTimeBrazil } from "@/lib/datetime/format-brazil";
import { resolveOperationalEmailEnvelope } from "@/lib/email/defaults";
import { sendViaZeptoMail } from "@/lib/email/zeptomail-send";
import { getZeptoMailSmtpConfig } from "@/lib/email/zeptomail-smtp-config";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidTestEmailAddress(value: string): boolean {
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email);
}

export type SendOperationalTestEmailResult = {
  messageId: string;
  to: string;
  sentAt: string;
};

/**
 * Sends a one-off SMTP connectivity test using the same ZeptoMail transport
 * and From/Reply-To envelope as operational emails.
 */
export async function sendOperationalTestEmail(input: {
  to: string;
}): Promise<SendOperationalTestEmailResult> {
  const to = input.to.trim().toLowerCase();
  if (!isValidTestEmailAddress(to)) {
    throw new Error("Informe um e-mail de destinatário válido.");
  }

  // Fail fast with the same config path as production sends.
  getZeptoMailSmtpConfig();
  const envelope = resolveOperationalEmailEnvelope();
  const sentAt = new Date().toISOString();
  const sentAtLabel = formatDateTimeBrazil(sentAt);
  const site =
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || null;
  const envLabel = site
    ? site.includes("localhost")
      ? "local"
      : "produção"
    : "desconhecido";

  const subject = "[DevPulse] Teste de configuração de e-mail";
  const text = [
    "Este é um e-mail de teste enviado pelo DevPulse.",
    `Data/hora do envio (America/Sao_Paulo): ${sentAtLabel}`,
    `Ambiente: ${envLabel}${site ? ` (${site})` : ""}`,
    "Se você recebeu esta mensagem, o SMTP ZeptoMail está configurado corretamente.",
  ].join("\n");

  const html = `
    <div style="font-family: system-ui, sans-serif; line-height: 1.5; color: #0f172a;">
      <p><strong>Este é um e-mail de teste enviado pelo DevPulse.</strong></p>
      <p>Data/hora do envio (America/Sao_Paulo): <strong>${sentAtLabel}</strong></p>
      <p>Ambiente: <strong>${envLabel}</strong>${site ? ` · ${site}` : ""}</p>
      <p style="color:#475569;font-size:14px;">
        Se você recebeu esta mensagem, o SMTP ZeptoMail está configurado corretamente.
      </p>
    </div>
  `.trim();

  const result = await sendViaZeptoMail({
    from: envelope.from,
    to: [to],
    replyTo: envelope.replyTo,
    subject,
    html,
    text,
  });

  return {
    messageId: result.messageId,
    to,
    sentAt,
  };
}
