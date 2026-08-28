import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type AppSessionRecord = {
  id: string;
  profile_id: string;
  started_at: string;
  last_seen_at: string;
  ended_at: string | null;
};

export async function touchAppSession(input: {
  sessionId: string;
  profileId: string;
  now?: string;
}): Promise<string> {
  const admin = createAdminClient();
  const now = input.now ?? new Date().toISOString();
  const { data: current, error: lookupError } = await admin
    .from("app_sessions")
    .select("id, profile_id, ended_at")
    .eq("id", input.sessionId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Falha ao consultar sessão de acesso: ${lookupError.message}`);
  }

  if (
    current &&
    String(current.profile_id) === input.profileId &&
    current.ended_at == null
  ) {
    const { error } = await admin
      .from("app_sessions")
      .update({ last_seen_at: now })
      .eq("id", input.sessionId);
    if (error) {
      throw new Error(`Falha ao atualizar sessão de acesso: ${error.message}`);
    }
    return input.sessionId;
  }

  const sessionId = current ? crypto.randomUUID() : input.sessionId;
  const { error } = await admin.from("app_sessions").insert({
    id: sessionId,
    profile_id: input.profileId,
    started_at: now,
    last_seen_at: now,
  });
  if (error) {
    throw new Error(`Falha ao registrar sessão de acesso: ${error.message}`);
  }
  return sessionId;
}

export async function endAppSession(input: {
  sessionId: string;
  profileId: string;
  now?: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("app_sessions")
    .update({ ended_at: input.now ?? new Date().toISOString() })
    .eq("id", input.sessionId)
    .eq("profile_id", input.profileId)
    .is("ended_at", null);

  if (error) {
    throw new Error(`Falha ao finalizar sessão de acesso: ${error.message}`);
  }
}

export async function listLatestAppSessionsByProfileId(
  profileIds: string[],
): Promise<Map<string, AppSessionRecord>> {
  const result = new Map<string, AppSessionRecord>();
  if (profileIds.length === 0) {
    return result;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("app_sessions")
    .select("id, profile_id, started_at, last_seen_at, ended_at")
    .in("profile_id", profileIds)
    .order("last_seen_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao listar sessões de acesso: ${error.message}`);
  }

  for (const row of data ?? []) {
    const profileId = String(row.profile_id);
    if (!result.has(profileId)) {
      result.set(profileId, row as AppSessionRecord);
    }
  }

  return result;
}
