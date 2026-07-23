import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Team, TeamWriteInput } from "@/types/team";

function mapTeam(row: Record<string, unknown>): Team {
  const settings = row.jira_settings;
  return {
    id: String(row.id),
    name: String(row.name),
    code: String(row.code),
    jira_key_prefix: String(row.jira_key_prefix),
    is_active: Boolean(row.is_active),
    jira_base_url: (row.jira_base_url as string | null) ?? null,
    jira_project_key: (row.jira_project_key as string | null) ?? null,
    jira_email: (row.jira_email as string | null) ?? null,
    jira_api_token_secret_ref:
      (row.jira_api_token_secret_ref as string | null) ?? null,
    jira_integration_enabled: Boolean(row.jira_integration_enabled),
    jira_settings:
      settings && typeof settings === "object" && !Array.isArray(settings)
        ? (settings as Record<string, unknown>)
        : {},
    notes: (row.notes as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function normalizeTeamCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeJiraKeyPrefix(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function assertTeamWrite(input: TeamWriteInput): {
  name: string;
  code: string;
  jiraKeyPrefix: string;
} {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Informe o nome do time.");
  }
  if (name.length > 120) {
    throw new Error("Nome do time muito longo (máx. 120).");
  }

  const code = normalizeTeamCode(input.code);
  if (!code || !/^[A-Z][A-Z0-9_]*$/.test(code)) {
    throw new Error(
      "Código inválido. Use letras/números/underscore (ex.: PRIME, PROJETOS_ESPECIAIS).",
    );
  }

  const jiraKeyPrefix = normalizeJiraKeyPrefix(input.jiraKeyPrefix);
  if (!jiraKeyPrefix || !/^[A-Z][A-Z0-9]*$/.test(jiraKeyPrefix)) {
    throw new Error(
      "Prefixo Jira inválido. Use só letras/números (ex.: AP, PE, ATHOS).",
    );
  }

  return { name, code, jiraKeyPrefix };
}

function uniqueMessage(error: { code?: string; message: string }): string | null {
  const msg = error.message.toLowerCase();
  if (error.code === "23505" || msg.includes("duplicate")) {
    if (msg.includes("jira_key_prefix")) {
      return "Já existe um time com este prefixo Jira.";
    }
    if (msg.includes("code")) {
      return "Já existe um time com este código.";
    }
    return "Time duplicado (código ou prefixo).";
  }
  return null;
}

export async function listTeamsAdmin(input?: {
  includeInactive?: boolean;
}): Promise<Team[]> {
  const supabase = await createClient();
  let query = supabase.from("teams").select("*").order("name", { ascending: true });

  if (!input?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list teams: ${error.message}`);
  }

  return (data ?? []).map((row) => mapTeam(row));
}

export async function getTeamById(id: string): Promise<Team | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load team: ${error.message}`);
  }

  return data ? mapTeam(data) : null;
}

export async function findTeamByJiraKeyPrefix(
  prefix: string,
): Promise<Team | null> {
  const normalized = normalizeJiraKeyPrefix(prefix);
  if (!normalized) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .eq("jira_key_prefix", normalized)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve team by prefix: ${error.message}`);
  }

  return data ? mapTeam(data) : null;
}

export async function createTeam(input: TeamWriteInput): Promise<Team> {
  const parsed = assertTeamWrite(input);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("teams")
    .insert({
      name: parsed.name,
      code: parsed.code,
      jira_key_prefix: parsed.jiraKeyPrefix,
      is_active: input.isActive,
      jira_base_url: input.jiraBaseUrl?.trim() || null,
      jira_project_key:
        input.jiraProjectKey?.trim().toUpperCase() || parsed.jiraKeyPrefix,
      jira_email: input.jiraEmail?.trim() || null,
      jira_api_token_secret_ref: input.jiraApiTokenSecretRef?.trim() || null,
      jira_integration_enabled: input.jiraIntegrationEnabled ?? false,
      notes: input.notes?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(uniqueMessage(error) ?? `Failed to create team: ${error.message}`);
  }

  return mapTeam(data);
}

export async function updateTeam(
  id: string,
  input: TeamWriteInput,
): Promise<Team> {
  if (!id.trim()) {
    throw new Error("Time inválido.");
  }

  const parsed = assertTeamWrite(input);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("teams")
    .update({
      name: parsed.name,
      code: parsed.code,
      jira_key_prefix: parsed.jiraKeyPrefix,
      is_active: input.isActive,
      jira_base_url: input.jiraBaseUrl?.trim() || null,
      jira_project_key:
        input.jiraProjectKey?.trim().toUpperCase() || parsed.jiraKeyPrefix,
      jira_email: input.jiraEmail?.trim() || null,
      jira_api_token_secret_ref: input.jiraApiTokenSecretRef?.trim() || null,
      jira_integration_enabled: input.jiraIntegrationEnabled ?? false,
      notes: input.notes?.trim() || null,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(uniqueMessage(error) ?? `Failed to update team: ${error.message}`);
  }

  // Keep developer.team_code denormalized in sync (auxiliary holiday key).
  // Canonical assignment remains developers.team_id.
  await supabase
    .from("developers")
    .update({ team_code: parsed.code })
    .eq("team_id", id);

  return mapTeam(data);
}

export async function setTeamActive(input: {
  id: string;
  isActive: boolean;
}): Promise<Team> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .update({ is_active: input.isActive })
    .eq("id", input.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update team status: ${error.message}`);
  }

  return mapTeam(data);
}

export {
  buildTeamCodeLabelMap,
  formatTeamLabel,
  getTeamLabelMap,
  resolveDisplayTeamLabel,
  resolveTeamCodesByDeveloperIds,
  resolveTeamLabel,
  toTeamLabel,
  type TeamLabel,
} from "@/services/teams/labels";
