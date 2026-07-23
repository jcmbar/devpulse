import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { linkDeveloperProfileAdmin } from "@/services/developers/admin";
import {
  getSiteUrl,
  isValidEmail,
  normalizeEmail,
} from "@/services/auth/shared";
import {
  isUserRole,
  upsertProfileAdmin,
} from "@/services/profiles/admin";
import type { Profile, UserRole } from "@/types/profile";

export type InviteAccessUserInput = {
  email: string;
  fullName: string;
  role: UserRole;
  developerId?: string | null;
  developerEmail?: string | null;
  linkToDeveloper?: boolean;
};

export type InviteAccessUserResult = {
  profile: Pick<Profile, "id" | "email" | "full_name" | "role">;
  linked: boolean;
  message: string;
};

function mapInviteError(message: string): string {
  const lower = message.toLowerCase();

  if (
    lower.includes("already been registered") ||
    lower.includes("already registered") ||
    lower.includes("user already exists") ||
    lower.includes("email_exists")
  ) {
    return "Já existe um usuário com este e-mail. Use “Reenviar convite” ou vincule o profile existente.";
  }

  if (
    lower.includes("invalid") &&
    (lower.includes("email") || lower.includes("format"))
  ) {
    return "E-mail inválido.";
  }

  if (
    lower.includes("not allowed") ||
    lower.includes("forbidden") ||
    lower.includes("permission")
  ) {
    return "Sem permissão para convidar usuários. Verifique a service role e o papel do operador.";
  }

  if (
    lower.includes("service_role") ||
    lower.includes("service role") ||
    lower.includes("supabase_service_role_key") ||
    lower.includes("placeholder") ||
    lower.includes(".env.local")
  ) {
    return message;
  }

  return message;
}

/**
 * Invites a user via Supabase Auth Admin API (inviteUserByEmail).
 * Creates auth.users, syncs public.profiles, optionally links a developer.
 */
export async function inviteAccessUser(
  input: InviteAccessUserInput,
): Promise<InviteAccessUserResult> {
  const email = normalizeEmail(input.email);
  const fullName = input.fullName.trim();
  const role = input.role;

  if (!email || !isValidEmail(email)) {
    throw new Error("E-mail inválido.");
  }

  if (!fullName) {
    throw new Error("Informe o nome do usuário.");
  }

  if (!isUserRole(role)) {
    throw new Error("Role inválida. Use admin, gestor ou dev.");
  }

  const siteUrl = getSiteUrl();
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      role,
    },
    redirectTo: `${siteUrl}/set-password`,
  });

  if (error) {
    throw new Error(mapInviteError(error.message));
  }

  const user = data.user;
  if (!user?.id) {
    throw new Error("Convite enviado, mas o usuário não retornou id.");
  }

  const profile = await upsertProfileAdmin({
    id: user.id,
    email: user.email ?? email,
    fullName,
    role,
  });

  const emailsMatch =
    Boolean(input.developerEmail) &&
    normalizeEmail(input.developerEmail!) === email;

  const shouldLink =
    Boolean(input.developerId) &&
    (input.linkToDeveloper === true ||
      (input.linkToDeveloper !== false && emailsMatch));

  let linked = false;
  let linkNote: string | null = null;

  if (shouldLink && input.developerId) {
    try {
      await linkDeveloperProfileAdmin({
        developerId: input.developerId,
        profileId: profile.id,
      });
      linked = true;
    } catch (error) {
      linkNote =
        error instanceof Error
          ? error.message
          : "Não foi possível vincular o profile ao developer.";
    }
  }

  if (linked) {
    return {
      profile: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        role: profile.role,
      },
      linked: true,
      message:
        "Convite enviado, profile sincronizado e vinculado ao developer.",
    };
  }

  return {
    profile: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
    },
    linked: false,
    message: linkNote
      ? `Convite enviado e profile sincronizado, mas o vínculo falhou: ${linkNote}`
      : "Convite enviado e profile sincronizado. Vincule o profile abaixo se necessário.",
  };
}
