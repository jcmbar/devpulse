import "server-only";

/** Public app origin used in Auth invite/recovery redirects. */
export function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000"
  );
}

/**
 * Final destination after invite/recovery session is established.
 * Must be listed in Supabase Authentication → Redirect URLs.
 * Email templates should send users through `/auth/confirm` first.
 */
export function getSetPasswordRedirectTo(): string {
  return `${getSiteUrl()}/set-password`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
