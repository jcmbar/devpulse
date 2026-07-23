import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/types/profile";

export async function getProfileById(id: string): Promise<Profile | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load profile: ${error.message}`);
  }

  return data;
}

export async function ensureProfile(user: User): Promise<Profile> {
  const existing = await getProfileById(user.id);

  if (existing) {
    return existing;
  }

  const supabase = await createClient();
  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : null;

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email ?? "",
      full_name: fullName,
      role: "dev" satisfies UserRole,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create profile: ${error.message}`);
  }

  return data;
}

export async function updateProfileName(
  profileId: string,
  fullName: string,
): Promise<Profile> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", profileId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update profile name: ${error.message}`);
  }

  return data;
}
