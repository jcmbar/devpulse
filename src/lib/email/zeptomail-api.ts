import "server-only";

import {
  getZeptoMailApiToken,
  getZeptoMailApiUrl,
  ZEPTOMAIL_SMTP_PASSWORD_HINT,
} from "@/lib/email/zeptomail-smtp-config";
import {
  estimateOperationalEmailBytes,
  sanitizeSmtpErrorMessage,
  ZEPTOMAIL_MAX_MESSAGE_BYTES,
  type SendOperationalEmailInput,
  type SendOperationalEmailResult,
} from "@/lib/email/zeptomail-smtp";

function parseAddressList(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseFrom(from: string): { address: string; name: string } {
  const trimmed = from.trim();
  const match = /^(.*?)\s*<([^>]+)>$/.exec(trimmed);
  if (match) {
    return {
      name: match[1]!.trim().replace(/^["']|["']$/g, ""),
      address: match[2]!.trim().toLowerCase(),
    };
  }
  return { name: "", address: trimmed.toLowerCase() };
}

function toRecipientObjects(emails: string[]) {
  return emails.map((address) => ({
    email_address: { address: address.toLowerCase() },
  }));
}

/**
 * ZeptoMail REST API over HTTPS (port 443).
 * Required on Render Free — outbound SMTP ports 25/465/587 are blocked there.
 */
export async function sendViaZeptoMailApi(
  input: SendOperationalEmailInput,
): Promise<SendOperationalEmailResult> {
  if (input.to.length === 0) {
    throw new Error("Nenhum destinatário (to) informado.");
  }

  const estimated = estimateOperationalEmailBytes(input);
  if (estimated > ZEPTOMAIL_MAX_MESSAGE_BYTES) {
    const mb = (estimated / 1024 / 1024).toFixed(1);
    throw new Error(
      `Mensagem com anexos (~${mb} MB) excede o limite do ZeptoMail (15 MB). Reduza o tamanho dos PDFs e tente novamente.`,
    );
  }

  let token: string;
  try {
    token = getZeptoMailApiToken();
  } catch {
    throw new Error(ZEPTOMAIL_SMTP_PASSWORD_HINT);
  }

  const from = parseFrom(input.from);
  const replyTo = input.replyTo
    ? parseAddressList(input.replyTo).map((address) => ({
        address: address.toLowerCase(),
      }))
    : undefined;

  const body = {
    from: {
      address: from.address,
      ...(from.name ? { name: from.name } : {}),
    },
    to: toRecipientObjects(input.to),
    ...(input.cc?.length ? { cc: toRecipientObjects(input.cc) } : {}),
    ...(replyTo?.length ? { reply_to: replyTo } : {}),
    subject: input.subject,
    htmlbody: input.html,
    ...(input.text ? { textbody: input.text } : {}),
    ...(input.attachments?.length
      ? {
          attachments: input.attachments.map((file) => ({
            name: file.filename,
            mime_type: file.contentType ?? "application/pdf",
            content: file.content.toString("base64"),
          })),
        }
      : {}),
  };

  const response = await fetch(getZeptoMailApiUrl(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Zoho-enczapikey ${token}`,
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const errorObj = payload.error as
      | { message?: string; code?: string; details?: unknown }
      | undefined;
    const detail =
      errorObj?.message ||
      (typeof payload.message === "string" ? payload.message : null) ||
      `HTTP ${response.status}`;
    throw new Error(
      `Falha no ZeptoMail API: ${sanitizeSmtpErrorMessage(String(detail))}`,
    );
  }

  const requestId =
    (typeof payload.request_id === "string" && payload.request_id) ||
    (typeof payload.message === "string" && payload.message) ||
    `zeptomail-api-${Date.now()}`;

  return { messageId: requestId };
}
