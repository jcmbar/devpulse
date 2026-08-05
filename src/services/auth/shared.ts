import "server-only";

/** Public app origin used in Auth invite/recovery redirects. */
export function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000"
  );
}

/**
 * Entry point for invite/recovery links, sent as `redirectTo` to the Admin API.
 *
 * Email templates should build the CTA from `{{ .RedirectTo }}` so the link
 * origin follows the environment that sent the email (local vs produção),
 * instead of the single global `{{ .SiteURL }}`.
 *
 * Must be listed in Supabase Authentication → Redirect URLs.
 */
export function getAuthConfirmRedirectTo(): string {
  return `${getSiteUrl()}/auth/confirm`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
