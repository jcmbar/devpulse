import "server-only";

/**
 * Public app origin used in Auth invite/recovery redirects.
 *
 * Prefer an explicit `NEXT_PUBLIC_SITE_URL`. On hosted platforms, fall back to
 * the platform URL so production never silently embeds localhost in emails.
 */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (configured) {
    return configured;
  }

  const renderUrl = process.env.RENDER_EXTERNAL_URL?.trim().replace(/\/$/, "");
  if (renderUrl) {
    return renderUrl;
  }

  const vercelUrl = process.env.VERCEL_URL?.trim().replace(/\/$/, "");
  if (vercelUrl) {
    return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
  }

  if (process.env.NODE_ENV === "production") {
    console.error(
      "[auth] NEXT_PUBLIC_SITE_URL is missing in production; invite/recovery links will break. Set it to the public app origin.",
    );
  }

  return "http://localhost:3000";
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
