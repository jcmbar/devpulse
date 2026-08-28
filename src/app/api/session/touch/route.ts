import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  appSessionCookieOptions,
  SESSION_ID_COOKIE,
} from "@/lib/auth/session-ttl";
import { createClient } from "@/lib/supabase/server";
import { touchAppSession } from "@/services/auth/app-sessions";

/** Bumps last-activity cookie via proxy. Used by the idle-session guard. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse(null, { status: 401 });
  }

  const jar = await cookies();
  const currentSessionId = jar.get(SESSION_ID_COOKIE)?.value;
  const sessionId =
    currentSessionId && /^[0-9a-f-]{36}$/i.test(currentSessionId)
      ? currentSessionId
      : crypto.randomUUID();

  try {
    const persistedSessionId = await touchAppSession({
      sessionId,
      profileId: user.id,
    });
    if (persistedSessionId !== currentSessionId) {
      jar.set(
        SESSION_ID_COOKIE,
        persistedSessionId,
        appSessionCookieOptions(),
      );
    }
  } catch (error) {
    console.error("[api/session/touch] failed to persist session", error);
  }

  return new NextResponse(null, { status: 204 });
}
