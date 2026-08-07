export type ZeptoMailSmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  secure: boolean;
};

export type ZeptoMailTransportMode = "api" | "smtp";

/** Safe snapshot for UI — never includes the password. */
export type ZeptoMailSmtpPublicStatus = {
  passwordConfigured: boolean;
  host: string;
  port: number;
  user: string;
  transport: ZeptoMailTransportMode;
  apiUrl: string;
  /** Human-readable hint when misconfigured. */
  missingHint: string | null;
};

const PASSWORD_MISSING_HINT =
  "Configure ZEPTOMAIL_SMTP_PASSWORD (ou ZEPTOMAIL_API_TOKEN) no ambiente e reinicie/redeploye o serviço.";

const DEFAULT_API_URL = "https://api.zeptomail.com/v1.1/email";

function readEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

/** Strip accidental wrapping quotes from env values (common in dashboards). */
function unwrapEnvSecret(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function readSmtpPassword(): string | undefined {
  // Prefer dedicated ZeptoMail name; SMTP_PASS is a temporary fallback only.
  const raw = readEnv(
    "ZEPTOMAIL_SMTP_PASSWORD",
    "ZEPTOMAIL_SMTP_PASS",
    "SMTP_PASSWORD",
    "SMTP_PASS",
  );
  if (!raw) {
    return undefined;
  }
  const password = unwrapEnvSecret(raw);
  return password || undefined;
}

/**
 * Transport for operational mail.
 * Default is HTTPS API — Render Free blocks outbound SMTP on 25/465/587.
 * Set ZEPTOMAIL_TRANSPORT=smtp only when the host allows SMTP egress.
 */
export function getZeptoMailTransportMode(): ZeptoMailTransportMode {
  const raw = readEnv("ZEPTOMAIL_TRANSPORT", "EMAIL_TRANSPORT")?.toLowerCase();
  if (raw === "smtp") {
    return "smtp";
  }
  return "api";
}

export function getZeptoMailApiUrl(): string {
  return (readEnv("ZEPTOMAIL_API_URL") ?? DEFAULT_API_URL).replace(/\/$/, "");
}

/** Send-mail token for ZeptoMail REST API (same agent token as SMTP password in most setups). */
export function getZeptoMailApiToken(): string {
  const raw = readEnv("ZEPTOMAIL_API_TOKEN") ?? readSmtpPassword();
  if (!raw) {
    throw new Error(PASSWORD_MISSING_HINT);
  }
  return normalizeZeptoMailApiToken(unwrapEnvSecret(raw));
}

/**
 * Env dashboards often paste the full "Zoho-enczapikey …" header value.
 * Authorization must be built as `Zoho-enczapikey <token>` once.
 */
export function normalizeZeptoMailApiToken(value: string): string {
  let token = value.trim();
  token = token.replace(/^Authorization\s*:\s*/i, "").trim();
  token = token.replace(/^Zoho-enczapikey\s+/i, "").trim();
  return token;
}

/** Public status for the email settings panel (no secrets). */
export function getZeptoMailSmtpPublicStatus(): ZeptoMailSmtpPublicStatus {
  const host =
    readEnv("ZEPTOMAIL_SMTP_HOST", "SMTP_HOST") ?? "smtp.zeptomail.com";
  const port = Number(readEnv("ZEPTOMAIL_SMTP_PORT", "SMTP_PORT") ?? "587");
  const user = readEnv("ZEPTOMAIL_SMTP_USER", "SMTP_USER") ?? "emailapikey";
  const passwordConfigured = Boolean(
    readEnv("ZEPTOMAIL_API_TOKEN") || readSmtpPassword(),
  );
  const transport = getZeptoMailTransportMode();

  return {
    passwordConfigured,
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    user,
    transport,
    apiUrl: getZeptoMailApiUrl(),
    missingHint: passwordConfigured ? null : PASSWORD_MISSING_HINT,
  };
}

/**
 * ZeptoMail SMTP settings (TLS on 587 / SSL on 465). Credentials stay in env.
 * Throws with a clear, non-secret message when misconfigured.
 */
export function getZeptoMailSmtpConfig(): ZeptoMailSmtpConfig {
  const host = (
    readEnv("ZEPTOMAIL_SMTP_HOST", "SMTP_HOST") ?? "smtp.zeptomail.com"
  ).trim();
  const port = Number(readEnv("ZEPTOMAIL_SMTP_PORT", "SMTP_PORT") ?? "587");
  const user = (
    readEnv("ZEPTOMAIL_SMTP_USER", "SMTP_USER") ?? "emailapikey"
  ).trim();
  const password = readSmtpPassword();

  if (!host) {
    throw new Error("Host SMTP ZeptoMail não configurado (ZEPTOMAIL_SMTP_HOST).");
  }
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("Porta SMTP ZeptoMail inválida (ZEPTOMAIL_SMTP_PORT).");
  }
  if (!user) {
    throw new Error(
      "Usuário SMTP ZeptoMail não configurado (ZEPTOMAIL_SMTP_USER).",
    );
  }
  if (!password) {
    throw new Error(PASSWORD_MISSING_HINT);
  }

  return {
    host,
    port,
    user,
    password,
    secure: port === 465,
  };
}

export { PASSWORD_MISSING_HINT as ZEPTOMAIL_SMTP_PASSWORD_HINT };
