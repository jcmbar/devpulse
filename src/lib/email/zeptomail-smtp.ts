import "server-only";

import nodemailer from "nodemailer";
import type { SendMailOptions, Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import {
  getZeptoMailSmtpConfig,
  ZEPTOMAIL_SMTP_PASSWORD_HINT,
} from "@/lib/email/zeptomail-smtp-config";

export type OperationalEmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SendOperationalEmailInput = {
  from: string;
  to: string[];
  cc?: string[];
  replyTo?: string | null;
  subject: string;
  html: string;
  text?: string;
  attachments?: OperationalEmailAttachment[];
};

export type SendOperationalEmailResult = {
  messageId: string;
};

/** ZeptoMail total message limit is 15 MB (headers + body + attachments). */
export const ZEPTOMAIL_MAX_MESSAGE_BYTES = 14 * 1024 * 1024;

const SMTP_CONNECTION_TIMEOUT_MS = 45_000;
const SMTP_GREETING_TIMEOUT_MS = 30_000;
const SMTP_SOCKET_TIMEOUT_MS = 180_000;

function createTransport(): Transporter {
  const config = getZeptoMailSmtpConfig();
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    requireTLS: config.port === 587,
    // Prefer IPv4 — IPv6 routing on some PaaS hosts causes intermittent
    // "Connection timeout" even when credentials are valid.
    family: 4,
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    tls: {
      minVersion: "TLSv1.2",
      servername: config.host,
    },
  } as SMTPTransport.Options);
}

export function estimateOperationalEmailBytes(
  input: Pick<SendOperationalEmailInput, "html" | "text" | "attachments">,
): number {
  let total = Buffer.byteLength(input.html ?? "", "utf8");
  total += Buffer.byteLength(input.text ?? "", "utf8");
  for (const file of input.attachments ?? []) {
    total += file.content.byteLength;
    // MIME base64 expands ~4/3; leave headroom via ZEPTOMAIL_MAX_MESSAGE_BYTES.
    total += Math.ceil(file.content.byteLength / 3);
  }
  return total;
}

/** Strip credentials / long tokens from provider error strings for UI/logs. */
export function sanitizeSmtpErrorMessage(raw: string): string {
  let message = raw.trim();
  if (!message) {
    return "Falha desconhecida no SMTP.";
  }
  message = message.replace(/pass(?:word)?[=:]\s*\S+/gi, "password=[redacted]");
  message = message.replace(/authorization[=:]\s*\S+/gi, "authorization=[redacted]");
  if (/not configured|ZEPTOMAIL_SMTP_PASSWORD|SMTP_PASS/i.test(message)) {
    return ZEPTOMAIL_SMTP_PASSWORD_HINT;
  }
  if (/connection timeout|greeting timeout|socket timeout|etimedout|econnreset|econnrefused/i.test(message)) {
    return (
      "Timeout na conexão SMTP com o ZeptoMail. " +
      "Tente novamente em alguns segundos. Se persistir, verifique a saída de rede na porta 587 do ambiente de deploy."
    );
  }
  if (message.length > 280) {
    message = `${message.slice(0, 277)}…`;
  }
  return message;
}

function isTransientSmtpError(message: string): boolean {
  return /connection timeout|greeting timeout|socket timeout|etimedout|econnreset|econnrefused|unexpected socket close/i.test(
    message,
  );
}

async function sendOnce(
  transport: Transporter,
  mail: SendMailOptions,
): Promise<SendOperationalEmailResult> {
  const info = await transport.sendMail(mail);
  const messageId = String(info.messageId ?? "").trim();
  if (!messageId) {
    throw new Error("ZeptoMail SMTP não retornou messageId.");
  }
  return { messageId };
}

/** Sends an operational email via ZeptoMail SMTP. Not used by Auth flows. */
export async function sendViaZeptoMailSmtp(
  input: SendOperationalEmailInput,
): Promise<SendOperationalEmailResult> {
  if (input.to.length === 0) {
    throw new Error("Nenhum destinatário (to) informado.");
  }

  getZeptoMailSmtpConfig();

  const estimated = estimateOperationalEmailBytes(input);
  if (estimated > ZEPTOMAIL_MAX_MESSAGE_BYTES) {
    const mb = (estimated / 1024 / 1024).toFixed(1);
    throw new Error(
      `Mensagem com anexos (~${mb} MB) excede o limite do ZeptoMail (15 MB). Reduza o tamanho dos PDFs e tente novamente.`,
    );
  }

  const mail: SendMailOptions = {
    from: input.from,
    to: input.to.join(", "),
    cc: input.cc?.length ? input.cc.join(", ") : undefined,
    replyTo: input.replyTo || undefined,
    subject: input.subject,
    html: input.html,
    text: input.text,
    attachments: input.attachments?.map((file) => ({
      filename: file.filename,
      content: file.content,
      contentType: file.contentType ?? "application/pdf",
    })),
  };

  // Fresh transport per send — cached sockets on serverless often fail with
  // "Connection timeout" on the next cold/warm invocation.
  let transport = createTransport();
  try {
    try {
      return await sendOnce(transport, mail);
    } catch (firstError) {
      const raw =
        firstError instanceof Error
          ? firstError.message
          : "Falha desconhecida no SMTP.";
      if (!isTransientSmtpError(raw)) {
        throw firstError;
      }
      try {
        transport.close();
      } catch {
        // ignore close errors before retry
      }
      transport = createTransport();
      return await sendOnce(transport, mail);
    }
  } catch (error) {
    const raw =
      error instanceof Error ? error.message : "Falha desconhecida no SMTP.";
    throw new Error(`Falha no ZeptoMail SMTP: ${sanitizeSmtpErrorMessage(raw)}`);
  } finally {
    try {
      transport.close();
    } catch {
      // ignore
    }
  }
}

/** @deprecated Prefer sendViaZeptoMailSmtp. */
export const sendOperationalEmail = sendViaZeptoMailSmtp;
