import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_NEXT = "/set-password";

/**
 * Public browser origin for redirects.
 *
 * Behind Render/Cloudflare, `request.nextUrl.origin` is often the internal
 * bind address (`http://localhost:10000`), which makes Location headers point
 * at localhost in the user's browser. Prefer forwarded host, then SITE_URL.
 */
function resolvePublicOrigin(request: NextRequest): string {
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (configured) {
    return configured;
  }

  const host = request.headers.get("host")?.trim();
  if (host && !/^localhost\b|^127\.0\.0\.1\b/i.test(host)) {
    return `${forwardedProto}://${host}`;
  }

  return request.nextUrl.origin;
}

/**
 * Accepts `redirect_to` (preferred in email templates) or legacy `next`.
 * Only same-origin absolute URLs or relative app paths are allowed.
 */
function safeNextPath(raw: string | null, requestOrigin: string): string {
  if (!raw) {
    return DEFAULT_NEXT;
  }

  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }

  try {
    const url = new URL(raw);
    if (url.origin === requestOrigin) {
      const path = `${url.pathname}${url.search}` || DEFAULT_NEXT;
      return path.startsWith("/") ? path : DEFAULT_NEXT;
    }
  } catch {
    // ignore invalid URLs
  }

  return DEFAULT_NEXT;
}

function redirectToPath(
  request: NextRequest,
  pathWithSearch: string,
): NextResponse {
  const origin = resolvePublicOrigin(request);
  const target = new URL(pathWithSearch, `${origin}/`);
  const location = new URL(`${target.pathname}${target.search}`, origin);
  return NextResponse.redirect(location);
}

function errorRedirect(request: NextRequest, code: string) {
  const url = new URL(DEFAULT_NEXT, "http://local.invalid");
  url.searchParams.set("error", code);
  return redirectToPath(request, `${url.pathname}${url.search}`);
}

/**
 * Confirms invite / recovery / signup links from Supabase email templates.
 *
 * Recommended CTA:
 * `/auth/confirm?token_hash=...&type=invite&redirect_to=/set-password`
 *
 * Also supports legacy `next=` and PKCE `code`. Without any of them the
 * request comes from the default Supabase template, which returns tokens in
 * the URL fragment: forward to `/set-password`, where the browser keeps the
 * fragment and the client establishes the session.
 */
export async function GET(request: NextRequest) {
  const publicOrigin = resolvePublicOrigin(request);
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNextPath(
    searchParams.get("redirect_to") ?? searchParams.get("next"),
    publicOrigin,
  );

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (error) {
      return errorRedirect(request, "invalid_or_expired");
    }

    return redirectToPath(request, next);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return errorRedirect(request, "invalid_or_expired");
    }

    return redirectToPath(request, next);
  }

  return redirectToPath(request, next);
}
