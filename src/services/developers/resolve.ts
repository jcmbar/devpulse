import { createClient } from "@/lib/supabase/server";
import { normalizeHolidayCode } from "@/lib/metrics/holiday-eligibility";
import type { Developer } from "@/types/developer";
import {
  isDeveloperJobTitle,
  type DeveloperJobTitle,
} from "@/types/developer-compensation";

function mapDeveloper(row: {
  id: string;
  profile_id: string | null;
  full_name: string;
  email: string | null;
  jira_account_id: string | null;
  is_active: boolean;
  job_title?: string | null;
  team_id?: string | null;
  state_code?: string | null;
  city_code?: string | null;
  team_code?: string | null;
  avatar_path?: string | null;
  avatar_synced_at?: string | null;
  created_at: string;
  updated_at: string;
}): Developer {
  const jobRaw = String(row.job_title ?? "developer");
  const jobTitle: DeveloperJobTitle = isDeveloperJobTitle(jobRaw)
    ? jobRaw
    : "developer";

  return {
    id: row.id,
    profile_id: row.profile_id,
    full_name: row.full_name,
    email: row.email,
    jira_account_id: row.jira_account_id,
    is_active: row.is_active,
    job_title: jobTitle,
    team_id: row.team_id ?? null,
    state_code: normalizeHolidayCode(row.state_code),
    city_code: normalizeHolidayCode(row.city_code),
    team_code: normalizeHolidayCode(row.team_code),
    avatar_path: row.avatar_path ?? null,
    avatar_synced_at: row.avatar_synced_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listDevelopers(): Promise<Developer[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("developers").select("*");

  if (error) {
    throw new Error(`Failed to list developers: ${error.message}`);
  }

  return (data ?? []).map(mapDeveloper);
}

export async function findDevelopersByJiraAccountIds(
  accountIds: string[],
): Promise<Map<string, Developer>> {
  const unique = [
    ...new Set(
      accountIds
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  ];
  const map = new Map<string, Developer>();
  if (unique.length === 0) {
    return map;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("developers")
    .select("*")
    .in("jira_account_id", unique);

  if (error) {
    throw new Error(
      `Failed to find developers by jira_account_id: ${error.message}`,
    );
  }

  for (const row of data ?? []) {
    if (row.jira_account_id) {
      map.set(String(row.jira_account_id), mapDeveloper(row));
    }
  }

  return map;
}

export async function findOrCreateDeveloperByResponsible(input: {
  fullName: string | null;
  email: string | null;
}): Promise<Developer | null> {
  const fullName = input.fullName?.trim() || null;
  const email = input.email?.trim() || null;

  if (!fullName && !email) {
    return null;
  }

  const supabase = await createClient();

  if (email) {
    const { data: byEmail, error: emailError } = await supabase
      .from("developers")
      .select("*")
      .ilike("email", email)
      .maybeSingle();

    if (emailError) {
      throw new Error(`Failed to find developer by email: ${emailError.message}`);
    }

    if (byEmail) {
      return mapDeveloper(byEmail);
    }
  }

  if (fullName) {
    const { data: byName, error: nameError } = await supabase
      .from("developers")
      .select("*")
      .ilike("full_name", fullName)
      .maybeSingle();

    if (nameError) {
      throw new Error(`Failed to find developer by name: ${nameError.message}`);
    }

    if (byName) {
      return mapDeveloper(byName);
    }

    // Soft match: "Jefferson Calmon" ↔ "Jefferson Calmon Muniz Barreto"
    const { data: candidates, error: candidatesError } = await supabase
      .from("developers")
      .select("*")
      .order("full_name", { ascending: true })
      .limit(500);

    if (candidatesError) {
      throw new Error(
        `Failed to fuzzy-match developer by name: ${candidatesError.message}`,
      );
    }

    const normalizedIncoming = normalizePersonName(fullName);
    const softMatch = (candidates ?? []).find((candidate) => {
      const normalizedExisting = normalizePersonName(candidate.full_name);
      return (
        normalizedExisting === normalizedIncoming ||
        normalizedExisting.startsWith(`${normalizedIncoming} `) ||
        normalizedIncoming.startsWith(`${normalizedExisting} `)
      );
    });

    if (softMatch) {
      return mapDeveloper(softMatch);
    }
  }

  const { data, error } = await supabase
    .from("developers")
    .insert({
      full_name: fullName ?? email!,
      email,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create developer: ${error.message}`);
  }

  return mapDeveloper(data);
}

/**
 * Assign team only when developer has no team yet (never overwrite silently).
 */
export async function assignDeveloperTeamIfEmpty(input: {
  developerId: string;
  teamId: string;
  teamCode: string;
}): Promise<boolean> {
  const supabase = await createClient();
  const { data: current, error: loadError } = await supabase
    .from("developers")
    .select("team_id")
    .eq("id", input.developerId)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Failed to load developer team: ${loadError.message}`);
  }

  if (current?.team_id) {
    return false;
  }

  const { error } = await supabase
    .from("developers")
    .update({
      team_id: input.teamId,
      team_code: input.teamCode.trim().toUpperCase(),
    })
    .eq("id", input.developerId)
    .is("team_id", null);

  if (error) {
    throw new Error(`Failed to assign developer team: ${error.message}`);
  }

  return true;
}

function normalizePersonName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
