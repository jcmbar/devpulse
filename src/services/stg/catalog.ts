import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_STG_APPROVAL_POLICY,
  parseStgApprovalPolicy,
} from "@/services/stg/constants";
import {
  mapStgDefaultParticipant,
  mapStgModule,
  mapStgScenario,
  mapStgTeamDefaults,
} from "@/services/stg/mappers";
import type {
  StgApprovalPolicy,
  StgDefaultParticipant,
  StgDefaultParticipantRole,
  StgModule,
  StgModuleWithScenarios,
  StgScenario,
  StgTeamDefaults,
  UpsertStgModuleInput,
  UpsertStgScenarioInput,
} from "@/types/stg";

export async function ensureStgTeamDefaults(
  teamId: string,
): Promise<StgTeamDefaults> {
  const existing = await getStgTeamDefaults(teamId);
  if (existing) {
    return existing;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stg_team_defaults")
    .upsert(
      {
        team_id: teamId,
        default_environment: "staging",
        approval_policy: DEFAULT_STG_APPROVAL_POLICY,
      },
      { onConflict: "team_id" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao criar defaults STG do time: ${error.message}`);
  }
  return mapStgTeamDefaults(data as Record<string, unknown>);
}

export async function getStgTeamDefaults(
  teamId: string,
): Promise<StgTeamDefaults | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stg_team_defaults")
    .select("*")
    .eq("team_id", teamId)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao carregar defaults STG: ${error.message}`);
  }
  return data ? mapStgTeamDefaults(data as Record<string, unknown>) : null;
}

export async function updateStgTeamDefaults(input: {
  teamId: string;
  defaultEnvironment?: string;
  approvalPolicy?: StgApprovalPolicy;
  notes?: string | null;
}): Promise<StgTeamDefaults> {
  await ensureStgTeamDefaults(input.teamId);
  const supabase = await createClient();

  const payload: Record<string, unknown> = {};
  if (input.defaultEnvironment != null) {
    const env = input.defaultEnvironment.trim();
    if (!env) {
      throw new Error("Ambiente padrão não pode ser vazio.");
    }
    payload.default_environment = env;
  }
  if (input.approvalPolicy != null) {
    payload.approval_policy = parseStgApprovalPolicy(input.approvalPolicy);
  }
  if (input.notes !== undefined) {
    payload.notes = input.notes;
  }

  const { data, error } = await supabase
    .from("stg_team_defaults")
    .update(payload)
    .eq("team_id", input.teamId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar defaults STG: ${error.message}`);
  }
  return mapStgTeamDefaults(data as Record<string, unknown>);
}

export async function listStgModulesWithScenarios(
  teamId: string,
  options?: { includeInactive?: boolean },
): Promise<StgModuleWithScenarios[]> {
  const supabase = await createClient();
  let moduleQuery = supabase
    .from("stg_modules")
    .select("*")
    .eq("team_id", teamId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!options?.includeInactive) {
    moduleQuery = moduleQuery.eq("is_active", true);
  }

  const { data: modules, error: moduleError } = await moduleQuery;
  if (moduleError) {
    throw new Error(`Falha ao listar módulos STG: ${moduleError.message}`);
  }

  const mappedModules = (modules ?? []).map((row) =>
    mapStgModule(row as Record<string, unknown>),
  );
  if (mappedModules.length === 0) {
    return [];
  }

  let scenarioQuery = supabase
    .from("stg_scenarios")
    .select("*")
    .in(
      "module_id",
      mappedModules.map((row) => row.id),
    )
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!options?.includeInactive) {
    scenarioQuery = scenarioQuery.eq("is_active", true);
  }

  const { data: scenarios, error: scenarioError } = await scenarioQuery;
  if (scenarioError) {
    throw new Error(`Falha ao listar cenários STG: ${scenarioError.message}`);
  }

  const byModule = new Map<string, StgScenario[]>();
  for (const row of scenarios ?? []) {
    const scenario = mapStgScenario(row as Record<string, unknown>);
    const list = byModule.get(scenario.module_id) ?? [];
    list.push(scenario);
    byModule.set(scenario.module_id, list);
  }

  return mappedModules.map((module) => ({
    ...module,
    scenarios: byModule.get(module.id) ?? [],
  }));
}

export async function upsertStgModule(
  input: UpsertStgModuleInput,
): Promise<StgModule> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Informe o nome do módulo.");
  }

  const supabase = await createClient();
  const payload = {
    team_id: input.teamId,
    name,
    sort_order: input.sortOrder ?? 0,
    is_active: input.isActive ?? true,
  };

  const query = input.id
    ? supabase.from("stg_modules").update(payload).eq("id", input.id)
    : supabase.from("stg_modules").insert(payload);

  const { data, error } = await query.select("*").single();
  if (error) {
    if (error.code === "23505") {
      throw new Error("Já existe um módulo com este nome neste time.");
    }
    throw new Error(`Falha ao salvar módulo STG: ${error.message}`);
  }
  return mapStgModule(data as Record<string, unknown>);
}

export async function upsertStgScenario(
  input: UpsertStgScenarioInput,
): Promise<StgScenario> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Informe o nome do cenário.");
  }

  const supabase = await createClient();
  const payload = {
    module_id: input.moduleId,
    name,
    summary: input.summary?.trim() || null,
    sort_order: input.sortOrder ?? 0,
    is_active: input.isActive ?? true,
  };

  const query = input.id
    ? supabase.from("stg_scenarios").update(payload).eq("id", input.id)
    : supabase.from("stg_scenarios").insert(payload);

  const { data, error } = await query.select("*").single();
  if (error) {
    if (error.code === "23505") {
      throw new Error("Já existe um cenário com este nome neste módulo.");
    }
    throw new Error(`Falha ao salvar cenário STG: ${error.message}`);
  }
  return mapStgScenario(data as Record<string, unknown>);
}

export async function listStgDefaultParticipants(
  teamId: string,
): Promise<StgDefaultParticipant[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stg_default_participants")
    .select("*")
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `Falha ao listar participantes padrão STG: ${error.message}`,
    );
  }
  return (data ?? []).map((row) =>
    mapStgDefaultParticipant(row as Record<string, unknown>),
  );
}

export async function setStgDefaultParticipant(input: {
  teamId: string;
  developerId: string;
  role: StgDefaultParticipantRole;
}): Promise<StgDefaultParticipant> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stg_default_participants")
    .upsert(
      {
        team_id: input.teamId,
        developer_id: input.developerId,
        role: input.role,
      },
      { onConflict: "team_id,developer_id" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Falha ao salvar participante padrão STG: ${error.message}`,
    );
  }
  return mapStgDefaultParticipant(data as Record<string, unknown>);
}

export async function removeStgDefaultParticipant(input: {
  teamId: string;
  developerId: string;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("stg_default_participants")
    .delete()
    .eq("team_id", input.teamId)
    .eq("developer_id", input.developerId);

  if (error) {
    throw new Error(
      `Falha ao remover participante padrão STG: ${error.message}`,
    );
  }
}

/**
 * Suggest session participants: defaults first, then other active developers
 * on the team as optional.
 */
export async function suggestStgSessionParticipants(
  teamId: string,
): Promise<
  Array<{ developerId: string; participation: "required" | "optional" }>
> {
  const defaults = await listStgDefaultParticipants(teamId);
  const defaultIds = new Set(defaults.map((row) => row.developer_id));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("developers")
    .select("id")
    .eq("team_id", teamId)
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(
      `Falha ao sugerir participantes STG: ${error.message}`,
    );
  }

  const suggestions: Array<{
    developerId: string;
    participation: "required" | "optional";
  }> = defaults.map((row) => ({
    developerId: row.developer_id,
    participation: row.role,
  }));

  for (const row of data ?? []) {
    const id = String(row.id);
    if (defaultIds.has(id)) {
      continue;
    }
    suggestions.push({ developerId: id, participation: "optional" });
  }

  return suggestions;
}
