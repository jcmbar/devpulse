import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Team } from "@/types/team";

export type TeamLabel = {
  id: string;
  name: string;
  code: string;
  jiraKeyPrefix: string;
  isActive: boolean;
};

export function formatTeamLabel(
  team: Pick<TeamLabel, "name" | "jiraKeyPrefix"> &
    Partial<Pick<TeamLabel, "code">>,
): string {
  return `${team.name} (${team.jiraKeyPrefix})`;
}

export function toTeamLabel(team: Team): TeamLabel {
  return {
    id: team.id,
    name: team.name,
    code: team.code,
    jiraKeyPrefix: team.jira_key_prefix,
    isActive: team.is_active,
  };
}

/** Map teams.code → label (display / legacy fallback only). */
export function buildTeamCodeLabelMap(
  byId: Map<string, TeamLabel>,
): Map<string, TeamLabel> {
  const byCode = new Map<string, TeamLabel>();
  for (const label of byId.values()) {
    const code = label.code.trim().toUpperCase();
    if (code) {
      byCode.set(code, label);
    }
  }
  return byCode;
}

/**
 * Display resolver: team_id first; optional team_code only as legacy fallback.
 * Never use free-form code as assignment source of truth.
 */
export function resolveDisplayTeamLabel(input: {
  teamId: string | null | undefined;
  teamCode?: string | null | undefined;
  byId: Map<string, TeamLabel>;
  byCode?: Map<string, TeamLabel>;
}): TeamLabel | null {
  if (input.teamId) {
    return input.byId.get(input.teamId) ?? null;
  }
  const code = (input.teamCode ?? "").trim().toUpperCase();
  if (!code || !input.byCode) {
    return null;
  }
  return input.byCode.get(code) ?? null;
}

/**
 * Map team_id → label. Central resolver for UI and holiday matching.
 */
export async function getTeamLabelMap(
  teamIds?: string[],
): Promise<Map<string, TeamLabel>> {
  const supabase = await createClient();
  let query = supabase
    .from("teams")
    .select("id, name, code, jira_key_prefix, is_active");

  if (teamIds && teamIds.length > 0) {
    query = query.in("id", Array.from(new Set(teamIds)));
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load team labels: ${error.message}`);
  }

  const map = new Map<string, TeamLabel>();
  for (const row of data ?? []) {
    map.set(row.id, {
      id: row.id,
      name: row.name,
      code: row.code,
      jiraKeyPrefix: row.jira_key_prefix,
      isActive: row.is_active,
    });
  }
  return map;
}

export async function resolveTeamLabel(
  teamId: string | null | undefined,
): Promise<TeamLabel | null> {
  if (!teamId) {
    return null;
  }
  const map = await getTeamLabelMap([teamId]);
  return map.get(teamId) ?? null;
}

/**
 * Holiday match key for a developer: always from teams.code via team_id.
 * Never trust free-form developers.team_code as source of truth.
 */
export async function resolveTeamCodesByDeveloperIds(
  developerIds: string[],
): Promise<
  Map<
    string,
    {
      teamId: string | null;
      teamCode: string;
      teamName: string | null;
    }
  >
> {
  const result = new Map<
    string,
    { teamId: string | null; teamCode: string; teamName: string | null }
  >();

  if (developerIds.length === 0) {
    return result;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("developers")
    .select("id, team_id")
    .in("id", developerIds);

  if (error) {
    throw new Error(`Failed to load developer teams: ${error.message}`);
  }

  const teamIds = (data ?? [])
    .map((row) => row.team_id as string | null)
    .filter((id): id is string => Boolean(id));
  const labels = await getTeamLabelMap(teamIds);

  for (const row of data ?? []) {
    const teamId = (row.team_id as string | null) ?? null;
    const label = teamId ? labels.get(teamId) : undefined;
    result.set(row.id, {
      teamId,
      teamCode: label?.code ?? "",
      teamName: label?.name ?? null,
    });
  }

  for (const id of developerIds) {
    if (!result.has(id)) {
      result.set(id, { teamId: null, teamCode: "", teamName: null });
    }
  }

  return result;
}
