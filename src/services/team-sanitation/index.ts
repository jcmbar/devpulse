import "server-only";

import { detectJiraKeyPrefixes } from "@/lib/imports/jira-key-prefix";
import { createClient } from "@/lib/supabase/server";
import { listTeamsAdmin, normalizeTeamCode } from "@/services/teams";
import type { Team } from "@/types/team";
import type {
  TeamAssignmentEntityType,
  TeamAssignmentReview,
  TeamAssignmentStatus,
  TeamInferenceDecision,
} from "@/types/team-assignment-review";

function mapReview(row: Record<string, unknown>): TeamAssignmentReview {
  const evidence = row.evidence;
  return {
    id: String(row.id),
    entity_type: row.entity_type as TeamAssignmentEntityType,
    entity_id: String(row.entity_id),
    status: row.status as TeamAssignmentStatus,
    suggested_team_id: (row.suggested_team_id as string | null) ?? null,
    assigned_team_id: (row.assigned_team_id as string | null) ?? null,
    reason: String(row.reason),
    evidence:
      evidence && typeof evidence === "object" && !Array.isArray(evidence)
        ? (evidence as Record<string, unknown>)
        : {},
    decided_by: (row.decided_by as string | null) ?? null,
    decided_at: (row.decided_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function teamByPrefix(teams: Team[]): Map<string, Team> {
  return new Map(teams.map((team) => [team.jira_key_prefix.toUpperCase(), team]));
}

function teamByCode(teams: Team[]): Map<string, Team> {
  return new Map(teams.map((team) => [team.code.toUpperCase(), team]));
}

function inferFromPrefixes(
  jiraKeys: string[],
  teams: Team[],
  context: string,
): TeamInferenceDecision {
  const detection = detectJiraKeyPrefixes(jiraKeys);
  const byPrefix = teamByPrefix(teams);

  if (detection.keysWithPrefix === 0) {
    return {
      outcome: "pending",
      suggestedTeamId: null,
      reason: `${context}: nenhuma chave Jira válida (PROJETO-123) encontrada.`,
      evidence: { detection },
    };
  }

  if (detection.prefixes.length > 1) {
    return {
      outcome: "pending",
      suggestedTeamId: null,
      reason: `${context}: mistura de prefixos (${detection.prefixes.join(", ")}).`,
      evidence: { detection },
    };
  }

  const prefix = detection.prefixes[0];
  const team = byPrefix.get(prefix);
  if (!team) {
    return {
      outcome: "pending",
      suggestedTeamId: null,
      reason: `${context}: prefixo "${prefix}" sem time cadastrado.`,
      evidence: { detection, prefix },
    };
  }

  return {
    outcome: "assign",
    teamId: team.id,
    teamName: team.name,
    reason: `${context}: único prefixo ${prefix} → time ${team.name}.`,
    evidence: { detection, prefix, teamId: team.id, teamCode: team.code },
  };
}

async function listJiraKeysForImport(importId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jira_cards")
    .select("jira_key")
    .eq("import_id", importId);

  if (error) {
    throw new Error(`Failed to load cards for import: ${error.message}`);
  }

  return (data ?? []).map((row) => String(row.jira_key));
}

async function listJiraKeysForDeveloper(developerId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jira_cards")
    .select("jira_key")
    .eq("developer_id", developerId);

  if (error) {
    throw new Error(`Failed to load cards for developer: ${error.message}`);
  }

  return (data ?? []).map((row) => String(row.jira_key));
}

async function listImportTeamIdsForDeveloper(
  developerId: string,
): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jira_cards")
    .select("import_id, imports!inner(team_id)")
    .eq("developer_id", developerId);

  if (error) {
    // Fallback without embed if relationship cache is stale.
    const { data: cards, error: cardsError } = await supabase
      .from("jira_cards")
      .select("import_id")
      .eq("developer_id", developerId);
    if (cardsError) {
      throw new Error(`Failed to load developer imports: ${cardsError.message}`);
    }
    const importIds = Array.from(
      new Set((cards ?? []).map((row) => String(row.import_id))),
    );
    if (importIds.length === 0) {
      return [];
    }
    const { data: imports, error: importsError } = await supabase
      .from("imports")
      .select("id, team_id")
      .in("id", importIds);
    if (importsError) {
      throw new Error(`Failed to load imports: ${importsError.message}`);
    }
    return (imports ?? [])
      .map((row) => row.team_id as string | null)
      .filter((id): id is string => Boolean(id));
  }

  const teamIds: string[] = [];
  for (const row of data ?? []) {
    const imports = row.imports as
      | { team_id: string | null }
      | { team_id: string | null }[]
      | null;
    const importRow = Array.isArray(imports) ? imports[0] : imports;
    if (importRow?.team_id) {
      teamIds.push(importRow.team_id);
    }
  }
  return teamIds;
}

export function inferImportTeamDecision(
  jiraKeys: string[],
  teams: Team[],
): TeamInferenceDecision {
  return inferFromPrefixes(jiraKeys, teams, "Import");
}

export function inferDeveloperTeamDecision(input: {
  teamCode: string;
  jiraKeys: string[];
  importTeamIds: string[];
  teams: Team[];
}): TeamInferenceDecision {
  const code = normalizeTeamCode(input.teamCode);
  if (code) {
    const byCode = teamByCode(input.teams);
    const team = byCode.get(code);
    if (team) {
      return {
        outcome: "assign",
        teamId: team.id,
        teamName: team.name,
        reason: `Developer: team_code "${code}" casa exatamente com teams.code.`,
        evidence: { teamCode: code, teamId: team.id },
      };
    }
  }

  const uniqueImportTeams = Array.from(new Set(input.importTeamIds));
  if (uniqueImportTeams.length === 1) {
    const team = input.teams.find((row) => row.id === uniqueImportTeams[0]);
    if (team) {
      return {
        outcome: "assign",
        teamId: team.id,
        teamName: team.name,
        reason: `Developer: todos os imports vinculados já têm o mesmo team_id (${team.name}).`,
        evidence: {
          importTeamIds: uniqueImportTeams,
          teamId: team.id,
        },
      };
    }
  }

  if (uniqueImportTeams.length > 1) {
    return {
      outcome: "pending",
      suggestedTeamId: null,
      reason: `Developer: cards em imports de times diferentes (${uniqueImportTeams.length}).`,
      evidence: { importTeamIds: uniqueImportTeams },
    };
  }

  return inferFromPrefixes(input.jiraKeys, input.teams, "Developer (chaves)");
}

async function upsertReview(input: {
  entityType: TeamAssignmentEntityType;
  entityId: string;
  status: TeamAssignmentStatus;
  suggestedTeamId?: string | null;
  assignedTeamId?: string | null;
  reason: string;
  evidence: Record<string, unknown>;
  decidedBy?: string | null;
}): Promise<TeamAssignmentReview> {
  const supabase = await createClient();
  const decidedAt =
    input.status === "auto_assigned" ||
    input.status === "manual_assigned" ||
    input.status === "skipped"
      ? new Date().toISOString()
      : null;

  const { data, error } = await supabase
    .from("team_assignment_reviews")
    .upsert(
      {
        entity_type: input.entityType,
        entity_id: input.entityId,
        status: input.status,
        suggested_team_id: input.suggestedTeamId ?? null,
        assigned_team_id: input.assignedTeamId ?? null,
        reason: input.reason,
        evidence: input.evidence,
        decided_by: input.decidedBy ?? null,
        decided_at: decidedAt,
      },
      { onConflict: "entity_type,entity_id" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to save assignment review: ${error.message}`);
  }

  return mapReview(data);
}

export type SanitationRunResult = {
  importsAutoAssigned: number;
  importsPending: number;
  importsSkipped: number;
  developersAutoAssigned: number;
  developersPending: number;
  developersSkipped: number;
};

/**
 * Safe backfill: never overwrites existing team_id.
 * Writes audit rows for every analyzed entity without team_id.
 */
export async function runTeamSanitationBackfill(input?: {
  decidedBy?: string | null;
}): Promise<SanitationRunResult> {
  const supabase = await createClient();
  const teams = await listTeamsAdmin({ includeInactive: true });
  const decidedBy = input?.decidedBy ?? null;

  const result: SanitationRunResult = {
    importsAutoAssigned: 0,
    importsPending: 0,
    importsSkipped: 0,
    developersAutoAssigned: 0,
    developersPending: 0,
    developersSkipped: 0,
  };

  const { data: imports, error: importsError } = await supabase
    .from("imports")
    .select("id, team_id, source_label, status")
    .is("team_id", null)
    .order("created_at", { ascending: true });

  if (importsError) {
    throw new Error(`Failed to list imports for sanitation: ${importsError.message}`);
  }

  for (const row of imports ?? []) {
    if (row.team_id) {
      result.importsSkipped += 1;
      continue;
    }

    const keys = await listJiraKeysForImport(row.id);
    const decision = inferImportTeamDecision(keys, teams);

    if (decision.outcome === "assign") {
      const { error } = await supabase
        .from("imports")
        .update({ team_id: decision.teamId })
        .eq("id", row.id)
        .is("team_id", null);

      if (error) {
        throw new Error(`Failed to backfill import team: ${error.message}`);
      }

      await upsertReview({
        entityType: "import",
        entityId: row.id,
        status: "auto_assigned",
        suggestedTeamId: decision.teamId,
        assignedTeamId: decision.teamId,
        reason: decision.reason,
        evidence: {
          ...decision.evidence,
          sourceLabel: row.source_label,
        },
        decidedBy,
      });
      result.importsAutoAssigned += 1;
      continue;
    }

    if (decision.outcome === "skip") {
      await upsertReview({
        entityType: "import",
        entityId: row.id,
        status: "skipped",
        reason: decision.reason,
        evidence: decision.evidence,
        decidedBy,
      });
      result.importsSkipped += 1;
      continue;
    }

    await upsertReview({
      entityType: "import",
      entityId: row.id,
      status: "pending",
      suggestedTeamId: decision.suggestedTeamId,
      reason: decision.reason,
      evidence: {
        ...decision.evidence,
        sourceLabel: row.source_label,
      },
    });
    result.importsPending += 1;
  }

  const { data: developers, error: developersError } = await supabase
    .from("developers")
    .select("id, full_name, team_id, team_code")
    .is("team_id", null)
    .order("full_name", { ascending: true });

  if (developersError) {
    throw new Error(
      `Failed to list developers for sanitation: ${developersError.message}`,
    );
  }

  for (const row of developers ?? []) {
    if (row.team_id) {
      result.developersSkipped += 1;
      continue;
    }

    const [keys, importTeamIds] = await Promise.all([
      listJiraKeysForDeveloper(row.id),
      listImportTeamIdsForDeveloper(row.id),
    ]);

    const decision = inferDeveloperTeamDecision({
      teamCode: row.team_code ?? "",
      jiraKeys: keys,
      importTeamIds,
      teams,
    });

    if (decision.outcome === "assign") {
      const team = teams.find((item) => item.id === decision.teamId);
      const { error } = await supabase
        .from("developers")
        .update({
          team_id: decision.teamId,
          team_code: team?.code ?? "",
        })
        .eq("id", row.id)
        .is("team_id", null);

      if (error) {
        throw new Error(`Failed to backfill developer team: ${error.message}`);
      }

      await upsertReview({
        entityType: "developer",
        entityId: row.id,
        status: "auto_assigned",
        suggestedTeamId: decision.teamId,
        assignedTeamId: decision.teamId,
        reason: decision.reason,
        evidence: {
          ...decision.evidence,
          fullName: row.full_name,
        },
        decidedBy,
      });
      result.developersAutoAssigned += 1;
      continue;
    }

    if (decision.outcome === "skip") {
      await upsertReview({
        entityType: "developer",
        entityId: row.id,
        status: "skipped",
        reason: decision.reason,
        evidence: decision.evidence,
        decidedBy,
      });
      result.developersSkipped += 1;
      continue;
    }

    await upsertReview({
      entityType: "developer",
      entityId: row.id,
      status: "pending",
      suggestedTeamId: decision.suggestedTeamId,
      reason: decision.reason,
      evidence: {
        ...decision.evidence,
        fullName: row.full_name,
        teamCode: row.team_code,
      },
    });
    result.developersPending += 1;
  }

  return result;
}

export type PendingReviewRow = TeamAssignmentReview & {
  entity_label: string;
  suggested_team_name: string | null;
};

export async function listTeamAssignmentReviews(input?: {
  status?: TeamAssignmentStatus | "all";
  entityType?: TeamAssignmentEntityType | "all";
}): Promise<PendingReviewRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("team_assignment_reviews")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (input?.status && input.status !== "all") {
    query = query.eq("status", input.status);
  }
  if (input?.entityType && input.entityType !== "all") {
    query = query.eq("entity_type", input.entityType);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list assignment reviews: ${error.message}`);
  }

  const reviews = (data ?? []).map((row) => mapReview(row));
  const teams = await listTeamsAdmin({ includeInactive: true });
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));

  const importIds = reviews
    .filter((row) => row.entity_type === "import")
    .map((row) => row.entity_id);
  const developerIds = reviews
    .filter((row) => row.entity_type === "developer")
    .map((row) => row.entity_id);

  const labelById = new Map<string, string>();

  if (importIds.length > 0) {
    const { data: imports } = await supabase
      .from("imports")
      .select("id, source_label")
      .in("id", importIds);
    for (const row of imports ?? []) {
      labelById.set(row.id, row.source_label ?? row.id);
    }
  }

  if (developerIds.length > 0) {
    const { data: developers } = await supabase
      .from("developers")
      .select("id, full_name")
      .in("id", developerIds);
    for (const row of developers ?? []) {
      labelById.set(row.id, row.full_name);
    }
  }

  return reviews.map((review) => ({
    ...review,
    entity_label: labelById.get(review.entity_id) ?? review.entity_id,
    suggested_team_name: review.suggested_team_id
      ? teamNameById.get(review.suggested_team_id) ?? null
      : null,
  }));
}

export async function getSanitationSummary(): Promise<{
  importsWithoutTeam: number;
  developersWithoutTeam: number;
  pendingReviews: number;
  autoAssigned: number;
  manualAssigned: number;
}> {
  const supabase = await createClient();

  const [
    { count: importsWithoutTeam, error: e1 },
    { count: developersWithoutTeam, error: e2 },
    { count: pendingReviews, error: e3 },
    { count: autoAssigned, error: e4 },
    { count: manualAssigned, error: e5 },
  ] = await Promise.all([
    supabase
      .from("imports")
      .select("id", { count: "exact", head: true })
      .is("team_id", null),
    supabase
      .from("developers")
      .select("id", { count: "exact", head: true })
      .is("team_id", null),
    supabase
      .from("team_assignment_reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("team_assignment_reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "auto_assigned"),
    supabase
      .from("team_assignment_reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "manual_assigned"),
  ]);

  if (e1 || e2 || e3 || e4 || e5) {
    throw new Error(
      `Failed to load sanitation summary: ${
        e1?.message ?? e2?.message ?? e3?.message ?? e4?.message ?? e5?.message
      }`,
    );
  }

  return {
    importsWithoutTeam: importsWithoutTeam ?? 0,
    developersWithoutTeam: developersWithoutTeam ?? 0,
    pendingReviews: pendingReviews ?? 0,
    autoAssigned: autoAssigned ?? 0,
    manualAssigned: manualAssigned ?? 0,
  };
}

export async function manuallyAssignImportTeam(input: {
  importId: string;
  teamId: string;
  decidedBy: string;
}): Promise<void> {
  const supabase = await createClient();
  const teams = await listTeamsAdmin({ includeInactive: true });
  const team = teams.find((row) => row.id === input.teamId);
  if (!team) {
    throw new Error("Time inválido.");
  }

  const { data: current, error: loadError } = await supabase
    .from("imports")
    .select("id, team_id, source_label")
    .eq("id", input.importId)
    .maybeSingle();

  if (loadError || !current) {
    throw new Error("Import não encontrado.");
  }
  if (current.team_id) {
    throw new Error("Este import já tem team_id. Não sobrescrevemos automaticamente.");
  }

  const { error } = await supabase
    .from("imports")
    .update({ team_id: input.teamId })
    .eq("id", input.importId)
    .is("team_id", null);

  if (error) {
    throw new Error(`Failed to assign import team: ${error.message}`);
  }

  await upsertReview({
    entityType: "import",
    entityId: input.importId,
    status: "manual_assigned",
    suggestedTeamId: input.teamId,
    assignedTeamId: input.teamId,
    reason: `Atribuição manual pelo admin/gestor → ${team.name}.`,
    evidence: {
      sourceLabel: current.source_label,
      teamId: team.id,
      teamCode: team.code,
      manual: true,
    },
    decidedBy: input.decidedBy,
  });
}

export async function manuallyAssignDeveloperTeam(input: {
  developerId: string;
  teamId: string;
  decidedBy: string;
}): Promise<void> {
  const supabase = await createClient();
  const teams = await listTeamsAdmin({ includeInactive: true });
  const team = teams.find((row) => row.id === input.teamId);
  if (!team) {
    throw new Error("Time inválido.");
  }

  const { data: current, error: loadError } = await supabase
    .from("developers")
    .select("id, team_id, full_name")
    .eq("id", input.developerId)
    .maybeSingle();

  if (loadError || !current) {
    throw new Error("Developer não encontrado.");
  }
  if (current.team_id) {
    throw new Error(
      "Este developer já tem team_id. Não sobrescrevemos automaticamente.",
    );
  }

  const { error } = await supabase
    .from("developers")
    .update({
      team_id: input.teamId,
      team_code: team.code,
    })
    .eq("id", input.developerId)
    .is("team_id", null);

  if (error) {
    throw new Error(`Failed to assign developer team: ${error.message}`);
  }

  await upsertReview({
    entityType: "developer",
    entityId: input.developerId,
    status: "manual_assigned",
    suggestedTeamId: input.teamId,
    assignedTeamId: input.teamId,
    reason: `Atribuição manual pelo admin/gestor → ${team.name}.`,
    evidence: {
      fullName: current.full_name,
      teamId: team.id,
      teamCode: team.code,
      manual: true,
    },
    decidedBy: input.decidedBy,
  });
}
