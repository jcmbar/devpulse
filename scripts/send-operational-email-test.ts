/**
 * One-off operational email smoke test via ZeptoMail SMTP.
 * Does not touch Supabase Auth.
 *
 * Usage: node --experimental-strip-types --env-file=.env.local scripts/send-operational-email-test.ts
 */
import nodemailer from "nodemailer";
import {
  OPERATIONAL_EMAIL_FROM_EMAIL_DEFAULT,
  OPERATIONAL_EMAIL_FROM_NAME_DEFAULT,
  OPERATIONAL_EMAIL_REPLY_TO_DEFAULT,
  resolveOperationalEmailEnvelope,
} from "../src/lib/email/defaults.ts";
import { getZeptoMailSmtpConfig } from "../src/lib/email/zeptomail-smtp-config.ts";

async function main() {
  const envelope = resolveOperationalEmailEnvelope();
  const smtp = getZeptoMailSmtpConfig();

  console.log(
    JSON.stringify(
      {
        envelope,
        smtp: {
          host: smtp.host,
          port: smtp.port,
          user: smtp.user,
          passwordSet: Boolean(smtp.password),
          passwordLooksQuoted: smtp.password.startsWith('"'),
        },
        defaultsMatch:
          envelope.fromName === OPERATIONAL_EMAIL_FROM_NAME_DEFAULT &&
          envelope.fromEmail === OPERATIONAL_EMAIL_FROM_EMAIL_DEFAULT &&
          envelope.replyTo === OPERATIONAL_EMAIL_REPLY_TO_DEFAULT,
      },
      null,
      2,
    ),
  );

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.password },
    requireTLS: smtp.port === 587,
  });

  const info = await transport.sendMail({
    from: envelope.from,
    to: "jefferson@athoslabs.com.br",
    replyTo: envelope.replyTo,
    subject: "[DevPulse] Teste operacional ZeptoMail",
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.6">
        <h2>Teste de e-mail operacional</h2>
        <p>Este é um envio real de validação do DevPulse via ZeptoMail SMTP.</p>
        <ul>
          <li><strong>From esperado:</strong> DevPulse &lt;contato@athoslabs.com.br&gt;</li>
          <li><strong>Reply-To esperado:</strong> jefferson@athoslabs.com.br</li>
          <li><strong>Fluxo:</strong> operacional (não Auth/Supabase)</li>
        </ul>
        <p style="color:#64748b;font-size:13px">Enviado em ${new Date().toISOString()}</p>
      </div>
    `,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        from: envelope.from,
        replyTo: envelope.replyTo,
        to: "jefferson@athoslabs.com.br",
        messageId: info.messageId,
        response: info.response,
        accepted: info.accepted,
        rejected: info.rejected,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
