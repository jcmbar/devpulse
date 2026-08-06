import "server-only";

import { Resend } from "resend";

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

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY não configurada. Defina a chave no ambiente para envios operacionais.",
    );
  }
  return new Resend(apiKey);
}

export async function sendViaResend(
  input: SendOperationalEmailInput,
): Promise<SendOperationalEmailResult> {
  if (input.to.length === 0) {
    throw new Error("Nenhum destinatário (to) informado.");
  }

  const resend = getResendClient();
  const { data, error } = await resend.emails.send({
    from: input.from,
    to: input.to,
    cc: input.cc?.length ? input.cc : undefined,
    replyTo: input.replyTo || undefined,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments?.map((file) => ({
      filename: file.filename,
      content: file.content,
      contentType: file.contentType ?? "application/pdf",
    })),
  });

  if (error) {
    throw new Error(`Falha no Resend: ${error.message}`);
  }
  if (!data?.id) {
    throw new Error("Resend não retornou id da mensagem.");
  }

  return { messageId: data.id };
}
