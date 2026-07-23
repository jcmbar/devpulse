import { createClient } from "@/lib/supabase/server";
import { normalizeHolidayCode } from "@/lib/metrics/holiday-eligibility";
import type { Developer } from "@/types/developer";

function coerceDeveloper(row: Record<string, unknown>): Developer {
  return {
    id: String(row.id),
    profile_id: (row.profile_id as string | null) ?? null,
    full_name: String(row.full_name),
    email: (row.email as string | null) ?? null,
    jira_account_id: (row.jira_account_id as string | null) ?? null,
    is_active: Boolean(row.is_active),
    team_id: (row.team_id as string | null) ?? null,
    state_code: normalizeHolidayCode(row.state_code as string | null),
    city_code: normalizeHolidayCode(row.city_code as string | null),
    team_code: normalizeHolidayCode(row.team_code as string | null),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function getDeveloperByProfileId(
  profileId: string,
): Promise<Developer | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("developers")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load developer: ${error.message}`);
  }

  return data ? coerceDeveloper(data) : null;
}

export async function findUnlinkedDeveloperByEmail(
  email: string,
): Promise<Developer | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("developers")
    .select("*")
    .is("profile_id", null)
    .ilike("email", email)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to find developer by email: ${error.message}`);
  }

  return data ? coerceDeveloper(data) : null;
}

export async function createDeveloperForProfile(input: {
  profileId: string;
  fullName: string;
  email: string;
}): Promise<Developer> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("developers")
    .insert({
      profile_id: input.profileId,
      full_name: input.fullName,
      email: input.email,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create developer: ${error.message}`);
  }

  return coerceDeveloper(data);
}

export async function linkDeveloperToProfile(input: {
  developerId: string;
  profileId: string;
  fullName: string;
}): Promise<Developer> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("developers")
    .update({
      profile_id: input.profileId,
      full_name: input.fullName,
    })
    .eq("id", input.developerId)
    .is("profile_id", null)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to link developer: ${error.message}`);
  }

  return coerceDeveloper(data);
}

export {
  assignDeveloperTeamIfEmpty,
  findOrCreateDeveloperByResponsible,
  listDevelopers,
} from "./resolve";

export {
  createDeveloperAdmin,
  getDeveloperAdmin,
  linkDeveloperProfileAdmin,
  listDevelopersAdmin,
  listDevelopersAdminPaged,
  searchProfilesAdmin,
  unlinkDeveloperProfileAdmin,
  updateDeveloperAdmin,
} from "./admin";

export type {
  CreateDeveloperInput,
  DeveloperListItem,
  ListDevelopersAdminInput,
  ListDevelopersAdminPagedInput,
  UpdateDeveloperInput,
} from "./admin";

