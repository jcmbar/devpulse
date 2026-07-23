import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveAccessInviteTarget,
  type AccessInviteTarget,
} from "@/services/auth/access-status";
import {
  getSiteUrl,
  isValidEmail,
  normalizeEmail,
} from "@/services/auth/shared";

export type ResendAccessInviteInput = {
  profileId?: string | null;
  email?: string | null;
  /** When true, send password recovery even if access looks completed. */
  forcePasswordReset?: boolean;
};

export type ResendAccessInviteResult = {
  message: string;
  target: AccessInviteTarget;
  mode: "invite_recovery" | "password_reset";
};

function mapResendError(message: string): string {
  const lower = message.toLowerCase();

  if (
    lower.includes("rate limit") ||
    lower.includes("email rate") ||
    lower.includes("over_email_send_rate_limit")
  ) {
    return "Limite de envio de e-mail atingido. Aguarde alguns minutos e tente de novo.";
  }

  if (
    lower.includes("smtp") ||
    lower.includes("error sending") ||
    lower.includes("error sending invite") ||
    lower.includes("error sending recovery") ||
    lower.includes("mail")
  ) {
    return `Falha no envio de e-mail (SMTP). Verifique Authentication → SMTP no Supabase. Detalhe: ${message}`;
  }

  if (
    lower.includes("not allowed") ||
    lower.includes("forbidden") ||
    lower.includes("permission")
  ) {
    return "Sem permissão para reenviar convite. Verifique a service role e o papel do operador.";
  }

  if (
    lower.includes("service_role") ||
    lower.includes("service role") ||
    lower.includes("supabase_service_role_key") ||
    lower.includes("placeholder") ||
    lower.includes(".env.local")
  ) {
    return message;
  }

  return message;
}

/**
 * Re-sends access email for an existing Auth user without creating a duplicate.
 *
 * Technical choice:
 * - `inviteUserByEmail` fails for existing users ("already registered").
 * - `generateLink({ type: 'invite' })` only builds a URL; it does not send email.
 * - `resetPasswordForEmail` sends via Supabase SMTP and reuses `/set-password`.
 */
export async function resendAccessInvite(
  input: ResendAccessInviteInput,
): Promise<ResendAccessInviteResult> {
  const target = await resolveAccessInviteTarget({
    profileId: input.profileId,
    email: input.email,
  });

  if (!target || !target.email) {
    throw new Error(
      "Usuário não encontrado. Informe um e-mail/profile válido para reenviar.",
    );
  }

  if (!isValidEmail(target.email)) {
    throw new Error("E-mail inválido.");
  }

  if (target.state === "not_found" || !target.authUserId) {
    throw new Error(
      "Usuário não encontrado em Authentication. Envie um convite novo em vez de reenviar.",
    );
  }

  if (target.state === "activated" && !input.forcePasswordReset) {
    throw new Error(
      "Este usuário já concluiu o acesso. Marque “Enviar redefinição de senha” se quiser um novo link.",
    );
  }

  const admin = createAdminClient();
  const siteUrl = getSiteUrl();
  const email = normalizeEmail(target.email);

  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/set-password`,
  });

  if (error) {
    throw new Error(mapResendError(error.message));
  }

  const mode =
    target.state === "activated" || input.forcePasswordReset
      ? "password_reset"
      : "invite_recovery";

  return {
    target,
    mode,
    message:
      mode === "password_reset"
        ? "Link de redefinição de senha enviado. O usuário deve abrir o e-mail e definir uma nova senha em /set-password."
        : "Convite reenviado. O usuário deve abrir o e-mail e definir a senha em /set-password.",
  };
}
