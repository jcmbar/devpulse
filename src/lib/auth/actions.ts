"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  SESSION_ACTIVE_COOKIE,
  SESSION_STARTED_COOKIE,
  clearSessionTrackingCookieOptions,
} from "@/lib/auth/session-ttl";

async function clearSessionAndRedirect(path: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const jar = await cookies();
  const clear = clearSessionTrackingCookieOptions();
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
