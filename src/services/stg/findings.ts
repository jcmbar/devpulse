import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  blocksReleaseForImpact,
} from "@/services/stg/approval";
import { normalizeJiraKey } from "@/services/stg/constants";
import { resolveStgJiraIssueForTeam } from "@/services/stg/jira-status";
import { mapStgFinding } from "@/services/stg/mappers";
import {
  getStgSession,
  recalculateStgSessionResult,
} from "@/services/stg/sessions";
import type { StgFinding, StgFindingImpact } from "@/types/stg";

export type UpsertStgFindingInput = {
  sessionId: string;
  title: string;
  description?: string | null;
  foundByDeveloperId: string;
  impact: StgFindingImpact;
  sessionScenarioId?: string | null;
  jiraKey?: string | null;
  notes?: string | null;
  id?: string;
};

async function enrichFindingJiraFields(input: {
  teamId: string;
  jiraKey: string | null;
}): Promise<{
  jira_key: string | null;
  jira_issue_id: string | null;
  status_group_cached: string | null;
  jira_status_cached: string | null;
}> {
  const key = normalizeJiraKey(input.jiraKey);
  if (!key) {
    return {
      jira_key: null,
      jira_issue_id: null,
      status_group_cached: null,
      jira_status_cached: null,
    };
  }

  const resolved = await resolveStgJiraIssueForTeam({
    teamId: input.teamId,
    jiraKey: key,
  });

  if (!resolved) {
    // Key informed but not found in sync → treat as missing card at gate time.
    return {
      jira_key: key,
      jira_issue_id: null,
      status_group_cached: "other",
      jira_status_cached: null,
    };
  }

  return {
    jira_key: resolved.jiraKey,
    jira_issue_id: resolved.issueId,
    status_group_cached: resolved.statusGroup,
    jira_status_cached: resolved.status,
  };
}

export async function upsertStgFinding(
  input: UpsertStgFindingInput,
): Promise<StgFinding> {
  const title = input.title.trim();
  if (!title) {
    throw new Error("Informe o título do apontamento.");
  }

  const session = await getStgSession(input.sessionId);
  if (!session) {
    throw new Error("Sessão STG não encontrada.");
  }
  if (session.status === "closed") {
    throw new Error("Sessão fechada — não é possível alterar apontamentos.");
  }

  const policy = session.approval_policy_snapshot;
  const jiraFields = await enrichFindingJiraFields({
    teamId: session.team_id,
    jiraKey: input.jiraKey ?? null,
  });

  const payload = {
    session_id: input.sessionId,
    session_scenario_id: input.sessionScenarioId ?? null,
    title,
    description: input.description?.trim() || null,
    found_by_developer_id: input.foundByDeveloperId,
    impact: input.impact,
    blocks_release: blocksReleaseForImpact(input.impact, policy),
    notes: input.notes?.trim() || null,
    ...jiraFields,
  };

  const supabase = await createClient();
  const query = input.id
    ? supabase.from("stg_findings").update(payload).eq("id", input.id)
    : supabase.from("stg_findings").insert(payload);

  const { data, error } = await query.select("*").single();
  if (error) {
    throw new Error(`Falha ao salvar apontamento STG: ${error.message}`);
  }

  await recalculateStgSessionResult(input.sessionId);
  return mapStgFinding(data as Record<string, unknown>);
}

export async function deleteStgFinding(findingId: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stg_findings")
    .delete()
    .eq("id", findingId)
    .select("session_id")
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao remover apontamento STG: ${error.message}`);
  }
  if (data?.session_id) {
    await recalculateStgSessionResult(String(data.session_id));
  }
}

export async function refreshStgFindingJiraStatus(
  findingId: string,
): Promise<StgFinding> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("stg_findings")
    .select("*")
    .eq("id", findingId)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao carregar apontamento: ${error.message}`);
  }
  if (!row) {
    throw new Error("Apontamento não encontrado.");
  }

  const finding = mapStgFinding(row as Record<string, unknown>);
  const session = await getStgSession(finding.session_id);
  if (!session) {
    throw new Error("Sessão STG não encontrada.");
  }

  const jiraFields = await enrichFindingJiraFields({
    teamId: session.team_id,
    jiraKey: finding.jira_key,
  });

  const { data, error: updateError } = await supabase
    .from("stg_findings")
    .update(jiraFields)
    .eq("id", findingId)
    .select("*")
    .single();

  if (updateError) {
    throw new Error(
      `Falha ao atualizar status Jira do apontamento: ${updateError.message}`,
    );
  }

  await recalculateStgSessionResult(finding.session_id);
  return mapStgFinding(data as Record<string, unknown>);
}
