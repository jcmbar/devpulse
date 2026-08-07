import "server-only";

import { sendViaZeptoMailApi } from "@/lib/email/zeptomail-api";
import { getZeptoMailTransportMode } from "@/lib/email/zeptomail-smtp-config";
import {
  sendViaZeptoMailSmtp as sendViaZeptoMailSmtpTransport,
  type SendOperationalEmailInput,
  type SendOperationalEmailResult,
} from "@/lib/email/zeptomail-smtp";

export type {
  OperationalEmailAttachment,
  SendOperationalEmailInput,
  SendOperationalEmailResult,
} from "@/lib/email/zeptomail-smtp";

/**
 * Sends operational email via ZeptoMail.
 * Default transport is HTTPS API (works on Render Free). SMTP is opt-in.
 */
export async function sendViaZeptoMail(
  input: SendOperationalEmailInput,
): Promise<SendOperationalEmailResult> {
  const mode = getZeptoMailTransportMode();
  if (mode === "smtp") {
    return sendViaZeptoMailSmtpTransport(input);
  }
  return sendViaZeptoMailApi(input);
}

/** @deprecated Prefer sendViaZeptoMail — routes to API or SMTP by env. */
export const sendViaZeptoMailSmtp = sendViaZeptoMail;

/** @deprecated Prefer sendViaZeptoMail. */
export const sendOperationalEmail = sendViaZeptoMail;
