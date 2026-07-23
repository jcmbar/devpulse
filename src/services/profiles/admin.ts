import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, UserRole } from "@/types/profile";

const VALID_ROLES: UserRole[] = ["admin", "gestor", "dev"];

export function isUserRole(value: string): value is UserRole {
  return VALID_ROLES.includes(value as UserRole);
}

/**
 * Upserts public.profiles using the service role so invite/create flows
 * do not depend solely on the auth.users trigger timing.
 */
export async function upsertProfileAdmin(input: {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
}): Promise<Profile> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("profiles")
    .upsert(
      {
        id: input.id,
        email: input.email,
        full_name: input.fullName,
        role: input.role,
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Profile não sincronizado após criar o usuário: ${error.message}`,
    );
  }

  return data;
}

export async function getProfileByIdAdmin(
  id: string,
): Promise<Profile | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load profile (admin): ${error.message}`);
  }

  return data;
}
