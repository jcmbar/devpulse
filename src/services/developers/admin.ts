import { createClient } from "@/lib/supabase/server";
import {
  toPaginatedList,
  type PaginatedList,
} from "@/lib/admin-list-query";
import { resolveTeamLabel } from "@/services/teams/labels";
import type { Developer } from "@/types/developer";
import type { Profile } from "@/types/profile";

export type DeveloperListItem = Developer & {
  profile: Pick<Profile, "id" | "email" | "full_name" | "role"> | null;
  cards_count: number;
};

export type CreateDeveloperInput = {
  fullName: string;
  email: string | null;
  jiraAccountId: string | null;
  isActive: boolean;
  profileId?: string | null;
  teamId?: string | null;
  stateCode?: string;
  cityCode?: string;
};

export type UpdateDeveloperInput = {
  developerId: string;
  fullName: string;
  email: string | null;
  jiraAccountId: string | null;
  isActive: boolean;
  teamId?: string | null;
  stateCode?: string;
  cityCode?: string;
};

export type ListDevelopersAdminInput = {
  /** Filter by developers.team_id — never by team_code. */
  teamId?: string | null;
  /** When true, only rows with team_id IS NULL (legacy). */
  unassignedOnly?: boolean;
  /** Case-insensitive search on full_name / email. */
  q?: string | null;
};

export type ListDevelopersAdminPagedInput = ListDevelopersAdminInput & {
  page: number;
  pageSize: number;
};

function normalizeCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function mapDeveloperRow(row: {
  id: string;
  profile_id: string | null;
  full_name: string;
  email: string | null;
  jira_account_id: string | null;
  is_active: boolean;
  team_id?: string | null;
  state_code?: string | null;
  city_code?: string | null;
  team_code?: string | null;
  created_at: string;
  updated_at: string;
}): Developer {
  return {
    id: row.id,
    profile_id: row.profile_id,
    full_name: row.full_name,
    email: row.email,
    jira_account_id: row.jira_account_id,
    is_active: row.is_active,
    team_id: row.team_id ?? null,
    state_code: normalizeCode(row.state_code),
    city_code: normalizeCode(row.city_code),
    team_code: normalizeCode(row.team_code),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function resolveTeamCode(
  teamId: string | null | undefined,
): Promise<{ teamId: string | null; teamCode: string }> {
  if (!teamId) {
    return { teamId: null, teamCode: "" };
  }

  const label = await resolveTeamLabel(teamId);
  if (!label) {
    throw new Error("Time selecionado não encontrado.");
  }

  return { teamId: label.id, teamCode: normalizeCode(label.code) };
}

function sanitizeSearchTerm(value: string): string {
  return value
    .trim()
    .replace(/[%_,.()"\\]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function mapDeveloperListRow(row: Record<string, unknown>): DeveloperListItem {
  const cardsRelation = row.jira_cards as { count: number }[] | null;
  const developer = mapDeveloperRow(
    row as Parameters<typeof mapDeveloperRow>[0],
  );
  return {
    ...developer,
    profile: row.profile as DeveloperListItem["profile"],
    cards_count: cardsRelation?.[0]?.count ?? 0,
  };
}

const DEVELOPER_LIST_SELECT = `
  *,
  profile:profiles!profile_id (
    id,
    email,
    full_name,
    role
  ),
  jira_cards (count)
`;

function applyDeveloperFilters(
  // PostgREST builder chain (filter methods).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  input?: ListDevelopersAdminInput,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  let next = query;

  if (input?.unassignedOnly) {
    next = next.is("team_id", null);
  } else if (input?.teamId) {
    next = next.eq("team_id", input.teamId);
  }

  const q = sanitizeSearchTerm(input?.q ?? "");
  if (q) {
    const pattern = `%${q}%`;
    next = next.or(`full_name.ilike."${pattern}",email.ilike."${pattern}"`);
  }

  return next;
}

/** Full list (gestor/config). Optional team_id + search; no pagination. */
export async function listDevelopersAdmin(
  input?: ListDevelopersAdminInput,
): Promise<DeveloperListItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("developers")
    .select(DEVELOPER_LIST_SELECT)
    .order("full_name", { ascending: true });

  query = applyDeveloperFilters(query, input);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list developers: ${error.message}`);
  }

  return (data ?? []).map((row) =>
    mapDeveloperListRow(row as Record<string, unknown>),
  );
}

/** Paginated admin list. Filters only by team_id (+ optional q). */
export async function listDevelopersAdminPaged(
  input: ListDevelopersAdminPagedInput,
): Promise<PaginatedList<DeveloperListItem>> {
  const supabase = await createClient();
  const pageSize = Math.max(1, input.pageSize);
  const requestedPage = Math.max(1, Math.floor(input.page));

  let countQuery = supabase
    .from("developers")
    .select("id", { count: "exact", head: true });
  countQuery = applyDeveloperFilters(countQuery, input);

  const { count, error: countError } = await countQuery;
  if (countError) {
    throw new Error(`Failed to count developers: ${countError.message}`);
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const page = Math.min(requestedPage, totalPages);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("developers")
    .select(DEVELOPER_LIST_SELECT)
    .order("full_name", { ascending: true })
    .range(from, to);

  query = applyDeveloperFilters(query, input);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list developers: ${error.message}`);
  }

  return toPaginatedList({
    items: (data ?? []).map((row) =>
      mapDeveloperListRow(row as Record<string, unknown>),
    ),
    total,
    page,
    pageSize,
  });
}

export async function getDeveloperAdmin(
  developerId: string,
): Promise<DeveloperListItem | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("developers")
    .select(
      `
      *,
      profile:profiles!profile_id (
        id,
        email,
        full_name,
        role
      ),
      jira_cards (count)
    `,
    )
    .eq("id", developerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load developer: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const cardsRelation = data.jira_cards as { count: number }[] | null;
  const developer = mapDeveloperRow(data);

  return {
    ...developer,
    profile: data.profile as DeveloperListItem["profile"],
    cards_count: cardsRelation?.[0]?.count ?? 0,
  };
}

export async function createDeveloperAdmin(
  input: CreateDeveloperInput,
): Promise<Developer> {
  const supabase = await createClient();
  const team = await resolveTeamCode(input.teamId);

  const { data, error } = await supabase
    .from("developers")
    .insert({
      full_name: input.fullName,
      email: input.email,
      jira_account_id: input.jiraAccountId,
      is_active: input.isActive,
      profile_id: input.profileId ?? null,
      team_id: team.teamId,
      team_code: team.teamCode,
      state_code: normalizeCode(input.stateCode),
      city_code: normalizeCode(input.cityCode),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create developer: ${error.message}`);
  }

  return mapDeveloperRow(data);
}

export async function updateDeveloperAdmin(
  input: UpdateDeveloperInput,
): Promise<Developer> {
  const supabase = await createClient();
  const team = await resolveTeamCode(input.teamId);

  const { data, error } = await supabase
    .from("developers")
    .update({
      full_name: input.fullName,
      email: input.email,
      jira_account_id: input.jiraAccountId,
      is_active: input.isActive,
      team_id: team.teamId,
      team_code: team.teamCode,
      state_code: normalizeCode(input.stateCode),
      city_code: normalizeCode(input.cityCode),
    })
    .eq("id", input.developerId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update developer: ${error.message}`);
  }

  return mapDeveloperRow(data);
}

export async function linkDeveloperProfileAdmin(input: {
  developerId: string;
  profileId: string;
}): Promise<Developer> {
  const supabase = await createClient();

  const { data: occupied, error: occupiedError } = await supabase
    .from("developers")
    .select("id")
    .eq("profile_id", input.profileId)
    .neq("id", input.developerId)
    .maybeSingle();

  if (occupiedError) {
    throw new Error(`Failed to validate profile link: ${occupiedError.message}`);
  }

  if (occupied) {
    throw new Error("Este profile já está vinculado a outro developer.");
  }

  const { data, error } = await supabase
    .from("developers")
    .update({ profile_id: input.profileId })
    .eq("id", input.developerId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to link profile: ${error.message}`);
  }

  return mapDeveloperRow(data);
}

export async function unlinkDeveloperProfileAdmin(
  developerId: string,
): Promise<Developer> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("developers")
    .update({ profile_id: null })
    .eq("id", developerId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to unlink profile: ${error.message}`);
  }

  return mapDeveloperRow(data);
}

export async function searchProfilesAdmin(query: string): Promise<
  Pick<Profile, "id" | "email" | "full_name" | "role">[]
> {
  const supabase = await createClient();
  const term = query.trim();

  let request = supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .order("email", { ascending: true })
    .limit(50);

  if (term) {
    const safeTerm = term.replace(/[%_,]/g, "");
    if (safeTerm.length > 0) {
      request = request.or(
        `email.ilike.%${safeTerm}%,full_name.ilike.%${safeTerm}%`,
      );
    }
  }

  const { data, error } = await request;

  if (error) {
    throw new Error(`Failed to search profiles: ${error.message}`);
  }

  return data ?? [];
}
