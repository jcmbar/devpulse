export type ZeptoMailSmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  secure: boolean;
};

function readEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

/** ZeptoMail SMTP settings (TLS on 587). Credentials stay in env. */
export function getZeptoMailSmtpConfig(): ZeptoMailSmtpConfig {
  const host =
    readEnv("ZEPTOMAIL_SMTP_HOST", "SMTP_HOST") ?? "smtp.zeptomail.com";
  const port = Number(
    readEnv("ZEPTOMAIL_SMTP_PORT", "SMTP_PORT") ?? "587",
  );
  const user =
    readEnv("ZEPTOMAIL_SMTP_USER", "SMTP_USER") ?? "emailapikey";
  const password = readEnv(
    "ZEPTOMAIL_SMTP_PASSWORD",
    "ZEPTOMAIL_SMTP_PASS",
    "SMTP_PASSWORD",
    "SMTP_PASS",
  );

  if (!password) {
    throw new Error(
      "Senha SMTP ZeptoMail não configurada. Defina ZEPTOMAIL_SMTP_PASSWORD (ou SMTP_PASS) no ambiente.",
    );
  }
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("Porta SMTP ZeptoMail inválida.");
  }

  return {
    host,
    port,
    user,
    password,
    secure: port === 465,
  };
}
