import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_ACTIVE_COOKIE,
  SESSION_STARTED_COOKIE,
  clearSessionTrackingCookieOptions,
  getSessionIdleMs,
  getSessionMaxMs,
  parseSessionTimestamp,
  sessionTrackingCookieOptions,
} from "@/lib/auth/session-ttl";

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value);
  });
  return to;
}

function clearTrackingCookies(response: NextResponse) {
  const clear = clearSessionTrackingCookieOptions();
  response.cookies.set(SESSION_STARTED_COOKIE, "", clear);
  response.cookies.set(SESSION_ACTIVE_COOKIE, "", clear);
  return response;
}

function shouldCountAsActivity(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  if (pathname === "/api/session/touch") {
    return true;
  }
  if (pathname.startsWith("/api/")) {
    return false;
  }
  if (request.headers.get("next-router-prefetch") === "1") {
    return false;
  }
  if (request.headers.get("rsc") === "1") {
    return false;
  }
  return true;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });

          Object.entries(headers).forEach(([key, value]) => {
            supabaseResponse.headers.set(key, value);
          });
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims().
  // Removing getClaims() can cause random logouts with SSR.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const { pathname } = request.nextUrl;
  const isAppRoute = pathname.startsWith("/app");
  const isLoginRoute = pathname.startsWith("/login");
  const maxMs = getSessionMaxMs();
  const idleMs = getSessionIdleMs();
  const now = Date.now();
  const trackingOptions = sessionTrackingCookieOptions();

  async function expireSession(reason: "expired" | "idle") {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (reason === "idle") {
      url.searchParams.set("idle", "1");
    } else {
      url.searchParams.set("expired", "1");
    }
    return clearTrackingCookies(
      copyCookies(supabaseResponse, NextResponse.redirect(url)),
    );
  }

  if (user && maxMs) {
    const started = parseSessionTimestamp(
      request.cookies.get(SESSION_STARTED_COOKIE)?.value,
    );
    if (started == null) {
      supabaseResponse.cookies.set(
        SESSION_STARTED_COOKIE,
        String(now),
        trackingOptions,
      );
    } else if (now - started >= maxMs) {
      return expireSession("expired");
    }
  }

  if (user && idleMs) {
    const lastActive = parseSessionTimestamp(
      request.cookies.get(SESSION_ACTIVE_COOKIE)?.value,
    );
    if (lastActive != null && now - lastActive >= idleMs) {
      return expireSession("idle");
    }
    if (lastActive == null || shouldCountAsActivity(request)) {
      supabaseResponse.cookies.set(
        SESSION_ACTIVE_COOKIE,
        String(now),
        trackingOptions,
      );
    }
  }

  if (
    !user &&
    (request.cookies.has(SESSION_STARTED_COOKIE) ||
      request.cookies.has(SESSION_ACTIVE_COOKIE))
  ) {
    clearTrackingCookies(supabaseResponse);
  }

  if (!user && isAppRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return copyCookies(supabaseResponse, NextResponse.redirect(url));
  }

  // Invitees may already have a temporary session while setting a password;
  // keep /set-password reachable even when authenticated.
  if (user && isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return copyCookies(supabaseResponse, NextResponse.redirect(url));
  }

  return supabaseResponse;
}
