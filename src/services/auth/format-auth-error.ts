import "server-only";

type AuthLikeError = {
  message?: string;
  code?: string;
  status?: number;
  __isAuthError?: boolean;
};

function isAuthLikeError(error: unknown): error is AuthLikeError {
  return (
    typeof error === "object" &&
    error !== null &&
    ("__isAuthError" in error || "code" in error || "status" in error)
  );
}

function readAuthMessage(error: AuthLikeError): string {
  const message = error.message?.trim() ?? "";
  if (message && message !== "{}") {
    return message;
  }
  return "";
}

function mapInviteErrorCode(code: string): string | null {
  const normalized = code.trim().toLowerCase();
  if (
    normalized === "email_exists" ||
    normalized === "user_already_exists" ||
    normalized === "identity_already_exists"
  ) {
    return "Já existe um usuário com este e-mail. Use “Reenviar convite” ou vincule o profile existente.";
  }
  if (normalized === "over_email_send_rate_limit") {
    return "Limite de envio de e-mail atingido. Aguarde alguns minutos e tente de novo.";
  }
  if (normalized === "unexpected_failure") {
    return "Falha inesperada ao enviar o convite. Verifique SMTP e Redirect URLs no Supabase.";
  }
  return null;
}

function mapInviteMessage(message: string): string {
  const lower = message.toLowerCase();

  if (
    lower.includes("already been registered") ||
    lower.includes("already registered") ||
    lower.includes("user already exists") ||
    lower.includes("email_exists")
  ) {
    return "Já existe um usuário com este e-mail. Use “Reenviar convite” ou vincule o profile existente.";
  }

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
    lower.includes("mail")
  ) {
    return `Falha no envio de e-mail (SMTP). Verifique Authentication → SMTP no Supabase. Detalhe: ${message}`;
  }

  if (
    lower.includes("invalid") &&
    (lower.includes("email") || lower.includes("format"))
  ) {
    return "E-mail inválido.";
  }

  if (
    lower.includes("not allowed") ||
    lower.includes("forbidden") ||
    lower.includes("permission")
  ) {
    return "Sem permissão para convidar usuários. Verifique a service role e o papel do operador.";
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

export function formatInviteAuthError(error: unknown): string {
  if (isAuthLikeError(error)) {
    const byCode = error.code ? mapInviteErrorCode(error.code) : null;
    if (byCode) {
      return byCode;
    }

    const message = readAuthMessage(error);
    if (message) {
      return mapInviteMessage(message);
    }

    if (error.code) {
      const status =
        typeof error.status === "number" ? `, HTTP ${error.status}` : "";
      return `Não foi possível convidar o usuário (${error.code}${status}). Verifique SMTP e Redirect URLs no Supabase.`;
    }
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (message && message !== "{}") {
      return mapInviteMessage(message);
    }
  }

  return "Não foi possível convidar o usuário. Verifique SMTP, Redirect URLs e se o e-mail já está cadastrado.";
}

export function formatActionError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message && message !== "{}") {
      return message;
    }
  }

  if (isAuthLikeError(error)) {
    const message = readAuthMessage(error);
    if (message) {
      return message;
    }
    if (error.code) {
      return `${fallback} (${error.code}).`;
    }
  }

  return fallback;
}
