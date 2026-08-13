import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  blocksReleaseForImpact,
  deriveSessionResultFromBlockers,
  evaluateFindingBlocker,
  type StgFindingBlocker,
} from "@/services/stg/approval";
import {
  ensureStgTeamDefaults,
  listStgModulesWithScenarios,
} from "@/services/stg/catalog";
import { resolveStgJiraIssueForTeam } from "@/services/stg/jira-status";
import {
  mapStgFinding,
  mapStgScenarioRun,
  mapStgSession,
  mapStgSessionParticipant,
  mapStgSessionScenario,
} from "@/services/stg/mappers";
import type {
  OpenStgSessionInput,
  StgCoverageStats,
  StgFinding,
  StgRunStatus,
  StgScenarioRun,
  StgSession,
  StgSessionParticipant,
  StgSessionScenario,
  StgSessionStatus,
} from "@/types/stg";

export type StgSessionDetail = {
  session: StgSession;
  participants: StgSessionParticipant[];
  scenarios: StgSessionScenario[];
  runs: StgScenarioRun[];
  findings: StgFinding[];
  coverage: StgCoverageStats;
  blockers: StgFindingBlocker[];
};

export async function listStgSessions(input?: {
  teamId?: string;
  from?: string;
  to?: string;
  status?: StgSessionStatus;
  result?: StgSession["result"];
  versionLabel?: string;
  limit?: number;
}): Promise<StgSession[]> {
  const supabase = await createClient();
  let query = supabase
    .from("stg_sessions")
    .select("*")
    .order("scheduled_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(input?.limit ?? 50);

  if (input?.teamId) {
    query = query.eq("team_id", input.teamId);
  }
  if (input?.from) {
    query = query.gte("scheduled_on", input.from);
  }
  if (input?.to) {
    query = query.lte("scheduled_on", input.to);
  }
  if (input?.status) {
    query = query.eq("status", input.status);
  }
  if (input?.result) {
    query = query.eq("result", input.result);
  }
  if (input?.versionLabel?.trim()) {
    query = query.ilike("version_label", input.versionLabel.trim());
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao listar sessões STG: ${error.message}`);
  }
  return (data ?? []).map((row) => mapStgSession(row as Record<string, unknown>));
}

export async function getStgSession(
  sessionId: string,
): Promise<StgSession | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stg_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao carregar sessão STG: ${error.message}`);
  }
  return data ? mapStgSession(data as Record<string, unknown>) : null;
}

export function computeStgCoverage(
  runs: StgScenarioRun[],
): StgCoverageStats {
  const expected_runs = runs.length;
  const done_runs = runs.filter((row) => row.status === "done").length;
  const skipped_runs = runs.filter((row) => row.status === "skipped").length;
  const pending_runs = runs.filter((row) => row.status === "pending").length;
  return {
    expected_runs,
    done_runs,
    skipped_runs,
    pending_runs,
    ratio: expected_runs === 0 ? null : done_runs / expected_runs,
  };
}

export async function getStgSessionDetail(
  sessionId: string,
): Promise<StgSessionDetail | null> {
  const session = await getStgSession(sessionId);
  if (!session) {
    return null;
  }

  const supabase = await createClient();
  const [
    participantsRes,
    scenariosRes,
    findingsRes,
  ] = await Promise.all([
    supabase
      .from("stg_session_participants")
      .select("*")
      .eq("session_id", sessionId),
    supabase
      .from("stg_session_scenarios")
      .select("*")
      .eq("session_id", sessionId)
      .order("sort_order", { ascending: true }),
    supabase.from("stg_findings").select("*").eq("session_id", sessionId),
  ]);

  if (participantsRes.error) {
    throw new Error(
      `Falha ao carregar participantes: ${participantsRes.error.message}`,
    );
  }
  if (scenariosRes.error) {
    throw new Error(
      `Falha ao carregar cenários da sessão: ${scenariosRes.error.message}`,
    );
  }
  if (findingsRes.error) {
    throw new Error(`Falha ao carregar findings: ${findingsRes.error.message}`);
  }

  const participants = (participantsRes.data ?? []).map((row) =>
    mapStgSessionParticipant(row as Record<string, unknown>),
  );
  const scenarios = (scenariosRes.data ?? []).map((row) =>
    mapStgSessionScenario(row as Record<string, unknown>),
  );
  const findings = (findingsRes.data ?? []).map((row) =>
    mapStgFinding(row as Record<string, unknown>),
  );

  const scenarioIds = scenarios.map((row) => row.id);
  let runs: StgScenarioRun[] = [];
  if (scenarioIds.length > 0) {
    const { data, error } = await supabase
      .from("stg_scenario_runs")
      .select("*")
      .in("session_scenario_id", scenarioIds);
    if (error) {
      throw new Error(`Falha ao carregar execuções: ${error.message}`);
    }
    runs = (data ?? []).map((row) =>
      mapStgScenarioRun(row as Record<string, unknown>),
    );
  }

  const blockers = await evaluateSessionBlockers(session, findings);

  return {
    session,
    participants,
    scenarios,
    runs,
    findings,
    coverage: computeStgCoverage(runs),
    blockers,
  };
}

async function evaluateSessionBlockers(
  session: StgSession,
  findings: StgFinding[],
): Promise<StgFindingBlocker[]> {
  const policy = session.approval_policy_snapshot;
  const blockers: StgFindingBlocker[] = [];

  for (const finding of findings) {
    let statusGroup = finding.status_group_cached;
    let jiraStatus = finding.jira_status_cached;
    let hasLinkedIssue = Boolean(finding.jira_issue_id);

    if (finding.jira_key) {
      const resolved = await resolveStgJiraIssueForTeam({
        teamId: session.team_id,
        jiraKey: finding.jira_key,
      });
      if (resolved) {
        statusGroup = resolved.statusGroup;
        jiraStatus = resolved.status;
        hasLinkedIssue = true;
      } else {
        hasLinkedIssue = Boolean(finding.jira_issue_id);
      }
    }

    const blocker = evaluateFindingBlocker({
      finding,
      policy,
      statusGroup,
      jiraStatus,
      hasLinkedIssue,
    });
    if (blocker) {
      blockers.push(blocker);
    }
  }

  return blockers;
}

/**
 * Open a session: snapshot policy, scenarios, participants, and materialize runs.
 */
export async function openStgSession(
  input: OpenStgSessionInput,
): Promise<StgSession> {
  const versionLabel = input.versionLabel.trim();
  if (!versionLabel) {
    throw new Error("Informe a versão/release da sessão.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledOn)) {
    throw new Error("Data da sessão inválida (use YYYY-MM-DD).");
  }
  if (input.participants.length === 0) {
    throw new Error("Inclua ao menos um participante na sessão.");
  }

  const defaults = await ensureStgTeamDefaults(input.teamId);
  const catalog = await listStgModulesWithScenarios(input.teamId);
  const allScenarios = catalog.flatMap((module) =>
    module.scenarios.map((scenario) => ({
      module,
      scenario,
    })),
  );

  const selected =
    input.scenarioIds && input.scenarioIds.length > 0
      ? allScenarios.filter((row) =>
          input.scenarioIds!.includes(row.scenario.id),
        )
      : allScenarios;

  if (selected.length === 0) {
    throw new Error(
      "Nenhum cenário ativo no catálogo deste time. Cadastre o catálogo antes de abrir a sessão.",
    );
  }

  const activeParticipants = input.participants.filter(
    (row) => row.participation !== "excluded",
  );

  const supabase = await createClient();
  const environment =
    input.environment?.trim() || defaults.default_environment || "staging";

  const { data: sessionRow, error: sessionError } = await supabase
    .from("stg_sessions")
    .insert({
      team_id: input.teamId,
      scheduled_on: input.scheduledOn,
      version_label: versionLabel,
      environment,
      status: "planned",
      result: "pending",
      scope_notes: input.scopeNotes?.trim() || null,
      approval_policy_snapshot: defaults.approval_policy,
      created_by: input.createdByProfileId ?? null,
    })
    .select("*")
    .single();

  if (sessionError) {
    if (sessionError.code === "23505") {
      throw new Error(
        "Já existe uma sessão STG neste time para a mesma data e versão.",
      );
    }
    throw new Error(`Falha ao criar sessão STG: ${sessionError.message}`);
  }

  const session = mapStgSession(sessionRow as Record<string, unknown>);

  const { error: participantsError } = await supabase
    .from("stg_session_participants")
    .insert(
      input.participants.map((row) => ({
        session_id: session.id,
        developer_id: row.developerId,
        participation: row.participation,
      })),
    );

  if (participantsError) {
    await supabase.from("stg_sessions").delete().eq("id", session.id);
    throw new Error(
      `Falha ao gravar participantes: ${participantsError.message}`,
    );
  }

  const scenarioPayload = selected.map((row, index) => ({
    session_id: session.id,
    module_name: row.module.name,
    scenario_name: row.scenario.name,
    summary: row.scenario.summary,
    source_scenario_id: row.scenario.id,
    sort_order: index,
    is_included: true,
  }));

  const { data: sessionScenarios, error: scenariosError } = await supabase
    .from("stg_session_scenarios")
    .insert(scenarioPayload)
    .select("*");

  if (scenariosError || !sessionScenarios) {
    await supabase.from("stg_sessions").delete().eq("id", session.id);
    throw new Error(
      `Falha ao gravar cenários da sessão: ${scenariosError?.message ?? "sem dados"}`,
    );
  }

  if (activeParticipants.length > 0) {
    const runPayload = sessionScenarios.flatMap((scenarioRow) =>
      activeParticipants.map((participant) => ({
        session_scenario_id: String(scenarioRow.id),
        developer_id: participant.developerId,
        status: "pending" as const,
      })),
    );

    const { error: runsError } = await supabase
      .from("stg_scenario_runs")
      .insert(runPayload);

    if (runsError) {
      await supabase.from("stg_sessions").delete().eq("id", session.id);
      throw new Error(
        `Falha ao materializar execuções: ${runsError.message}`,
      );
    }
  }

  return session;
}

export async function updateStgScenarioRunStatus(input: {
  runId: string;
  status: StgRunStatus;
  note?: string | null;
}): Promise<StgScenarioRun> {
  const supabase = await createClient();
  const completedAt =
    input.status === "done" || input.status === "skipped"
      ? new Date().toISOString()
      : null;

  const payload: Record<string, unknown> = {
    status: input.status,
    completed_at: completedAt,
  };
  if (input.note !== undefined) {
    payload.note = input.note;
  }

  const { data, error } = await supabase
    .from("stg_scenario_runs")
    .update(payload)
    .eq("id", input.runId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar execução STG: ${error.message}`);
  }
  return mapStgScenarioRun(data as Record<string, unknown>);
}

export async function updateStgSessionStatus(input: {
  sessionId: string;
  status: StgSessionStatus;
}): Promise<StgSession> {
  const supabase = await createClient();
  const payload: Record<string, unknown> = { status: input.status };
  if (input.status === "closed") {
    payload.closed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("stg_sessions")
    .update(payload)
    .eq("id", input.sessionId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar status da sessão: ${error.message}`);
  }

  const session = mapStgSession(data as Record<string, unknown>);
  return recalculateStgSessionResult(session.id);
}

export async function waiveStgSession(input: {
  sessionId: string;
  reason: string;
  waivedByProfileId: string;
}): Promise<StgSession> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("Informe o motivo do waiver.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stg_sessions")
    .update({
      result: "waived",
      waive_reason: reason,
      waived_by: input.waivedByProfileId,
      waived_at: new Date().toISOString(),
    })
    .eq("id", input.sessionId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao registrar waiver STG: ${error.message}`);
  }
  return mapStgSession(data as Record<string, unknown>);
}

export async function recalculateStgSessionResult(
  sessionId: string,
): Promise<StgSession> {
  const detail = await getStgSessionDetail(sessionId);
  if (!detail) {
    throw new Error("Sessão STG não encontrada.");
  }

  if (detail.session.result === "waived") {
    return detail.session;
  }

  const nextResult = deriveSessionResultFromBlockers({
    sessionStatus: detail.session.status,
    waived: false,
    blockers: detail.blockers,
  });

  if (nextResult === detail.session.result) {
    return detail.session;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stg_sessions")
    .update({
      result: nextResult,
      waive_reason: null,
      waived_by: null,
      waived_at: null,
    })
    .eq("id", sessionId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao recalcular resultado STG: ${error.message}`);
  }
  return mapStgSession(data as Record<string, unknown>);
}

export { blocksReleaseForImpact };
