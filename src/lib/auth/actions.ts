"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { endAppSession } from "@/services/auth/app-sessions";
import {
  SESSION_ID_COOKIE,
  SESSION_ACTIVE_COOKIE,
  SESSION_STARTED_COOKIE,
  clearSessionTrackingCookieOptions,
} from "@/lib/auth/session-ttl";

async function clearSessionAndRedirect(path: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const jar = await cookies();
  const sessionId = jar.get(SESSION_ID_COOKIE)?.value;
  if (user && sessionId) {
    try {
      await endAppSession({ sessionId, profileId: user.id });
    } catch {
      // Session tracking must not prevent logout.
    }
  }
  await supabase.auth.signOut();
  const clear = clearSessionTrackingCookieOptions();
  jar.set(SESSION_ID_COOKIE, "", clear);
  jar.set(SESSION_STARTED_COOKIE, "", clear);
  jar.set(SESSION_ACTIVE_COOKIE, "", clear);
  redirect(path);
}

export async function signOut() {
  await clearSessionAndRedirect("/login");
}

export async function signOutIdle() {
  await clearSessionAndRedirect("/login?idle=1");
}
