import "server-only";

import nodemailer from "nodemailer";
import type { SendMailOptions, Transporter } from "nodemailer";
import { getZeptoMailSmtpConfig } from "@/lib/email/zeptomail-smtp-config";

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
  attachments?: OperationalEmailAttachment[];
};

export type SendOperationalEmailResult = {
  messageId: string;
};

let cachedTransport: Transporter | null = null;

function getTransport(): Transporter {
  if (cachedTransport) {
    return cachedTransport;
  }
  const config = getZeptoMailSmtpConfig();
  cachedTransport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    requireTLS: config.port === 587,
  });
  return cachedTransport;
}

/** Sends an operational email via ZeptoMail SMTP. Not used by Auth flows. */
export async function sendViaZeptoMailSmtp(
  input: SendOperationalEmailInput,
): Promise<SendOperationalEmailResult> {
  if (input.to.length === 0) {
    throw new Error("Nenhum destinatário (to) informado.");
  }

  const mail: SendMailOptions = {
    from: input.from,
    to: input.to.join(", "),
    cc: input.cc?.length ? input.cc.join(", ") : undefined,
    replyTo: input.replyTo || undefined,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments?.map((file) => ({
      filename: file.filename,
      content: file.content,
      contentType: file.contentType ?? "application/pdf",
    })),
  };

  try {
    const info = await getTransport().sendMail(mail);
    const messageId = String(info.messageId ?? "").trim();
    if (!messageId) {
      throw new Error("ZeptoMail SMTP não retornou messageId.");
    }
    return { messageId };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha desconhecida no SMTP.";
    throw new Error(`Falha no ZeptoMail SMTP: ${message}`);
  }
}

/** @deprecated Prefer sendViaZeptoMailSmtp. */
export const sendOperationalEmail = sendViaZeptoMailSmtp;
