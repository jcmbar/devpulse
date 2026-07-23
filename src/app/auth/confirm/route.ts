import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/set-password";
  }
  return next;
}

function errorRedirect(request: NextRequest, code: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/set-password";
  url.search = "";
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

/**
 * Confirms invite / recovery / signup links from Supabase email templates.
 * Supports token_hash+type (recommended) and PKCE `code` when present.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (error) {
      return errorRedirect(request, "invalid_or_expired");
    }

    const url = request.nextUrl.clone();
    url.pathname = next;
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return errorRedirect(request, "invalid_or_expired");
    }

    const url = request.nextUrl.clone();
    url.pathname = next;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return errorRedirect(request, "missing_token");
}
