import "server-only";

import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  classifyAccessInviteState,
  type AccessInviteTarget,
} from "@/services/auth/access-status";
import { normalizeEmail } from "@/services/auth/shared";
import type { DeveloperListItem } from "@/services/developers/admin";

export type DeveloperAccessKind =
  | "no_access"
  | "invite_pending"
  | "active";

export type DeveloperAccessAction =
  | "invite"
  | "resend_invite"
  | "reset_password"
  | "link_profile";

export type DeveloperAccessInfo = {
  kind: DeveloperAccessKind;
  label: string;
  description: string;
  profileLinked: boolean;
  email: string | null;
  invitedAt: string | null;
  lastSignInAt: string | null;
  passwordSetAt: string | null;
  relevantAt: string | null;
  relevantAtLabel: string | null;
  inviteTarget: AccessInviteTarget | null;
  suggestedActions: DeveloperAccessAction[];
};

function readPasswordSetAt(user: User): string | null {
  const value = user.user_metadata?.password_set_at;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function kindFromUser(user: User | null): DeveloperAccessKind {
  if (!user) {
    return "no_access";
  }

  // Strongest signal: password explicitly set in our app flow.
  if (readPasswordSetAt(user)) {
    return "active";
  }

  // Invited users without password_set_at stay pending (avoids false "Ativo").
  if (user.invited_at) {
    return "invite_pending";
  }

  // Non-invite users who already signed in are treated as active.
  if (user.last_sign_in_at) {
    return "active";
  }

  // Exists in Auth but unclear → prefer pending over false active.
  return "invite_pending";
}

function labelForKind(kind: DeveloperAccessKind): string {
  switch (kind) {
    case "active":
      return "Ativo";
    case "invite_pending":
      return "Convite pendente";
    case "no_access":
    default:
      return "Sem acesso";
  }
}

function descriptionFor(input: {
  kind: DeveloperAccessKind;
  profileLinked: boolean;
  hasAuthUser: boolean;
}): string {
  if (input.kind === "active") {
    return input.profileLinked
      ? "Acesso concluído com senha definida (ou login ativo)."
      : "Há usuário Auth ativo, mas o profile ainda não está vinculado a este developer.";
  }

  if (input.kind === "invite_pending") {
    return input.profileLinked
      ? "Convite enviado; o usuário ainda não concluiu a definição de senha."
      : "Há usuário convidado pelo e-mail, mas sem vínculo de profile neste developer.";
  }

  if (input.profileLinked && !input.hasAuthUser) {
    return "Há profile vinculado, mas o usuário não foi encontrado em Authentication.";
  }

  return "Este developer ainda não tem usuário de acesso no Auth.";
}

function relevantDate(input: {
  kind: DeveloperAccessKind;
  invitedAt: string | null;
  lastSignInAt: string | null;
  passwordSetAt: string | null;
}): { at: string | null; label: string | null } {
  if (input.kind === "active") {
    if (input.passwordSetAt) {
      return { at: input.passwordSetAt, label: "Senha definida em" };
    }
    if (input.lastSignInAt) {
      return { at: input.lastSignInAt, label: "Último acesso em" };
    }
  }

  if (input.kind === "invite_pending" && input.invitedAt) {
    return { at: input.invitedAt, label: "Convidado em" };
  }

  if (input.lastSignInAt) {
    return { at: input.lastSignInAt, label: "Último evento em" };
  }

  return { at: null, label: null };
}

function suggestedActions(input: {
  kind: DeveloperAccessKind;
  profileLinked: boolean;
  hasAuthUser: boolean;
}): DeveloperAccessAction[] {
  const actions: DeveloperAccessAction[] = [];

  if (!input.profileLinked && input.hasAuthUser) {
    actions.push("link_profile");
  }

  if (input.kind === "no_access") {
    actions.push("invite");
    if (!input.profileLinked) {
      actions.push("link_profile");
    }
    return actions;
  }

  if (input.kind === "invite_pending") {
    actions.push("resend_invite");
    return actions;
  }

  // active
  actions.push("reset_password");
  return actions;
}

function toInviteTarget(input: {
  user: User | null;
  profileId: string | null;
  email: string | null;
  fullName: string | null;
}): AccessInviteTarget | null {
  if (!input.email && !input.user && !input.profileId) {
    return null;
  }

  if (!input.user) {
    return {
      state: "not_found",
      email: input.email ?? "",
      profileId: input.profileId,
      authUserId: null,
      fullName: input.fullName,
      invitedAt: null,
      lastSignInAt: null,
      passwordSetAt: null,
    };
  }

  return {
    state: classifyAccessInviteState(input.user),
    email: input.user.email ?? input.email ?? "",
    profileId: input.profileId ?? input.user.id,
    authUserId: input.user.id,
    fullName:
      input.fullName ??
      (typeof input.user.user_metadata?.full_name === "string"
        ? input.user.user_metadata.full_name
        : null),
    invitedAt: input.user.invited_at ?? null,
    lastSignInAt: input.user.last_sign_in_at ?? null,
    passwordSetAt: readPasswordSetAt(input.user),
  };
}

function buildAccessInfo(input: {
  developer: DeveloperListItem;
  user: User | null;
}): DeveloperAccessInfo {
  const profileLinked = Boolean(input.developer.profile_id);
  const kind = kindFromUser(input.user);
  const passwordSetAt = input.user ? readPasswordSetAt(input.user) : null;
  const invitedAt = input.user?.invited_at ?? null;
  const lastSignInAt = input.user?.last_sign_in_at ?? null;
  const email =
    input.developer.profile?.email ??
    input.user?.email ??
    input.developer.email ??
    null;
  const { at, label } = relevantDate({
    kind,
    invitedAt,
    lastSignInAt,
    passwordSetAt,
  });

  return {
    kind,
    label: labelForKind(kind),
    description: descriptionFor({
      kind,
      profileLinked,
      hasAuthUser: Boolean(input.user),
    }),
    profileLinked,
    email,
    invitedAt,
    lastSignInAt,
    passwordSetAt,
    relevantAt: at,
    relevantAtLabel: label,
    inviteTarget: toInviteTarget({
      user: input.user,
      profileId: input.developer.profile?.id ?? input.developer.profile_id,
      email,
      fullName:
        input.developer.profile?.full_name ?? input.developer.full_name,
    }),
    suggestedActions: suggestedActions({
      kind,
      profileLinked,
      hasAuthUser: Boolean(input.user),
    }),
  };
}

async function loadAuthUsersIndex(): Promise<{
  byId: Map<string, User>;
  byEmail: Map<string, User>;
}> {
  const admin = createAdminClient();
  const byId = new Map<string, User>();
  const byEmail = new Map<string, User>();

  let page = 1;
  const perPage = 200;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Falha ao listar usuários Auth: ${error.message}`);
    }

    for (const user of data.users) {
      byId.set(user.id, user);
      if (user.email) {
        byEmail.set(normalizeEmail(user.email), user);
      }
    }

    if (data.users.length < perPage) {
      break;
    }
    page += 1;
  }

  return { byId, byEmail };
}

function resolveUserForDeveloper(
  developer: DeveloperListItem,
  index: { byId: Map<string, User>; byEmail: Map<string, User> },
): User | null {
  const profileId = developer.profile?.id ?? developer.profile_id;
  if (profileId) {
    const byProfile = index.byId.get(profileId);
    if (byProfile) {
      return byProfile;
    }
  }

  const email = developer.profile?.email ?? developer.email;
  if (email) {
    return index.byEmail.get(normalizeEmail(email)) ?? null;
  }

  return null;
}

export async function resolveDeveloperAccessInfo(
  developer: DeveloperListItem,
): Promise<DeveloperAccessInfo> {
  const index = await loadAuthUsersIndex();
  return buildAccessInfo({
    developer,
    user: resolveUserForDeveloper(developer, index),
  });
}

export async function resolveDevelopersAccessInfoMap(
  developers: DeveloperListItem[],
): Promise<Map<string, DeveloperAccessInfo>> {
  if (developers.length === 0) {
    return new Map();
  }

  const index = await loadAuthUsersIndex();
  const map = new Map<string, DeveloperAccessInfo>();

  for (const developer of developers) {
    map.set(
      developer.id,
      buildAccessInfo({
        developer,
        user: resolveUserForDeveloper(developer, index),
      }),
    );
  }

  return map;
}

export function formatAccessDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
