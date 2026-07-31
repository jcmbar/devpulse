/**
 * Jira Cloud account IDs are opaque strings (often `digits:uuid`).
 * This is a minimal guard against emails / spaces / garbage paste.
 */

export function normalizeJiraAccountId(
  raw: string | null | undefined,
): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * @returns error message, or null when valid (including empty → clear).
 */
export function validateJiraAccountId(
  raw: string | null | undefined,
): string | null {
  const value = normalizeJiraAccountId(raw);
  if (value == null) {
    return null;
  }

  if (value.includes("@")) {
    return "Parece um e-mail; cole o Account ID do Jira (não o e-mail).";
  }

  if (/\s/.test(value)) {
    return "O Account ID não pode conter espaços.";
  }

  if (value.length < 5) {
    return "Account ID muito curto.";
  }

  if (value.length > 128) {
    return "Account ID muito longo (máx. 128).";
  }

  if (!/^[A-Za-z0-9:_-]+$/.test(value)) {
    return "Use apenas letras, números, dois-pontos, hífen ou underscore.";
  }

  return null;
}
