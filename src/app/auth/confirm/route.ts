import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_NEXT = "/set-password";

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

function errorRedirect(request: NextRequest, code: string) {
  const url = request.nextUrl.clone();
  url.pathname = DEFAULT_NEXT;
  url.search = "";
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

function redirectToNext(request: NextRequest, next: string) {
  const url = request.nextUrl.clone();
  const target = new URL(next, request.nextUrl.origin);
  url.pathname = target.pathname;
  url.search = target.search;
  url.hash = "";
  return NextResponse.redirect(url);
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
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNextPath(
    searchParams.get("redirect_to") ?? searchParams.get("next"),
    origin,
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

    return redirectToNext(request, next);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return errorRedirect(request, "invalid_or_expired");
    }

    return redirectToNext(request, next);
  }

  return redirectToNext(request, next);
}
