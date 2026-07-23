import "server-only";

import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfileByIdAdmin } from "@/services/profiles/admin";
import { normalizeEmail } from "@/services/auth/shared";

export type AccessInviteState = "pending" | "activated" | "not_found";

export type AccessInviteTarget = {
  state: AccessInviteState;
  email: string;
  profileId: string | null;
  authUserId: string | null;
  fullName: string | null;
  invitedAt: string | null;
  lastSignInAt: string | null;
  passwordSetAt: string | null;
};

function readPasswordSetAt(user: User): string | null {
  const value = user.user_metadata?.password_set_at;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Pending = invited / never finished password setup.
 * Activated only with strong signals (password_set_at or non-invite sign-in).
 * Prefer pending over false "activated".
 */
export function classifyAccessInviteState(user: User): Exclude<
  AccessInviteState,
  "not_found"
> {
  if (readPasswordSetAt(user)) {
    return "activated";
  }

  if (user.invited_at) {
    return "pending";
  }

  if (user.last_sign_in_at) {
    return "activated";
  }

  return "pending";
}

export async function findAuthUserById(userId: string): Promise<User | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);

  if (error) {
    if (error.message.toLowerCase().includes("not found")) {
      return null;
    }
    throw new Error(`Falha ao buscar usuário Auth: ${error.message}`);
  }

  return data.user ?? null;
}

export async function findAuthUserByEmail(email: string): Promise<User | null> {
  const normalized = normalizeEmail(email);
  const admin = createAdminClient();

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", normalized)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Falha ao buscar profile por e-mail: ${profileError.message}`);
  }

  if (profile?.id) {
    return findAuthUserById(profile.id);
  }

  // Fallback for rare auth.users without profile row.
  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Falha ao listar usuários Auth: ${error.message}`);
    }

    const match = data.users.find(
      (user) => normalizeEmail(user.email ?? "") === normalized,
    );
    if (match) {
      return match;
    }

    if (data.users.length < perPage) {
      break;
    }
    page += 1;
  }

  return null;
}

export async function resolveAccessInviteTarget(input: {
  profileId?: string | null;
  email?: string | null;
}): Promise<AccessInviteTarget | null> {
  const emailHint = input.email ? normalizeEmail(input.email) : null;

  if (input.profileId) {
    const [profile, user] = await Promise.all([
      getProfileByIdAdmin(input.profileId),
      findAuthUserById(input.profileId),
    ]);

    if (!user && !profile) {
      return emailHint
        ? resolveAccessInviteTarget({ email: emailHint })
        : null;
    }

    if (!user) {
      return {
        state: "not_found",
        email: profile?.email ?? emailHint ?? "",
        profileId: profile?.id ?? input.profileId,
        authUserId: null,
        fullName: profile?.full_name ?? null,
        invitedAt: null,
        lastSignInAt: null,
        passwordSetAt: null,
      };
    }

    return {
      state: classifyAccessInviteState(user),
      email: user.email ?? profile?.email ?? emailHint ?? "",
      profileId: profile?.id ?? user.id,
      authUserId: user.id,
      fullName:
        profile?.full_name ??
        (typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : null),
      invitedAt: user.invited_at ?? null,
      lastSignInAt: user.last_sign_in_at ?? null,
      passwordSetAt: readPasswordSetAt(user),
    };
  }

  if (!emailHint) {
    return null;
  }

  const user = await findAuthUserByEmail(emailHint);
  if (!user) {
    return {
      state: "not_found",
      email: emailHint,
      profileId: null,
      authUserId: null,
      fullName: null,
      invitedAt: null,
      lastSignInAt: null,
      passwordSetAt: null,
    };
  }

  const profile = await getProfileByIdAdmin(user.id);

  return {
    state: classifyAccessInviteState(user),
    email: user.email ?? emailHint,
    profileId: profile?.id ?? user.id,
    authUserId: user.id,
    fullName:
      profile?.full_name ??
      (typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : null),
    invitedAt: user.invited_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
    passwordSetAt: readPasswordSetAt(user),
  };
}
