/**
 * Defaults for DevPulse operational (transactional) emails via ZeptoMail.
 * Auth invite/reset stay on Supabase Auth — not covered here.
 */

export const OPERATIONAL_EMAIL_FROM_NAME_DEFAULT = "DevPulse";
export const OPERATIONAL_EMAIL_FROM_EMAIL_DEFAULT = "contato@athoslabs.com.br";
export const OPERATIONAL_EMAIL_REPLY_TO_DEFAULT = "jefferson@athoslabs.com.br";

export type OperationalEmailEnvelope = {
  fromName: string;
  fromEmail: string;
  /** RFC-style "Name <email@domain>" */
  from: string;
  replyTo: string;
};

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

/**
 * Resolves From / Reply-To for operational sends.
 * Env overrides are optional; product defaults target athoslabs.com.br / ZeptoMail.
 */
export function resolveOperationalEmailEnvelope(): OperationalEmailEnvelope {
  const fromName =
    readEnv("OPERATIONAL_EMAIL_FROM_NAME") ??
    OPERATIONAL_EMAIL_FROM_NAME_DEFAULT;
  const fromEmail = (
    readEnv("OPERATIONAL_EMAIL_FROM_EMAIL") ??
    OPERATIONAL_EMAIL_FROM_EMAIL_DEFAULT
  ).toLowerCase();
  const replyTo = (
    readEnv("OPERATIONAL_EMAIL_REPLY_TO") ??
    OPERATIONAL_EMAIL_REPLY_TO_DEFAULT
  ).toLowerCase();

  if (!fromEmail.includes("@")) {
    throw new Error("OPERATIONAL_EMAIL_FROM_EMAIL inválido.");
  }
  if (!replyTo.includes("@")) {
    throw new Error("OPERATIONAL_EMAIL_REPLY_TO inválido.");
  }

  return {
    fromName,
    fromEmail,
    from: `${fromName} <${fromEmail}>`,
    replyTo,
  };
}
