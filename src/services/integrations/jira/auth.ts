import "server-only";

const SECRET_REF_RE = /^[A-Z][A-Z0-9_]*$/;

/**
 * Resolve Jira API token from an env var name stored on the integration.
 * Never persists the raw token in the database.
 */
export function resolveJiraApiToken(secretRef: string): string {
  const ref = secretRef.trim();
  if (!SECRET_REF_RE.test(ref)) {
    throw new Error(
      "Referência de secret inválida. Use um nome de env no formato JIRA_TOKEN_TEAM.",
    );
  }

  const value = process.env[ref]?.trim() ?? "";
  if (!value) {
    throw new Error(
      `Secret ${ref} não encontrado em process.env. Defina no .env.local (ou secrets do host).`,
    );
  }

  return value;
}

export function createJiraAuthHeader(email: string, apiToken: string): string {
  const token = Buffer.from(`${email}:${apiToken}`, "utf8").toString("base64");
  return `Basic ${token}`;
}
