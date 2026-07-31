import "server-only";

import { createClient } from "@/lib/supabase/server";
import { asJiraFieldMappings } from "@/lib/jira/field-mappings";
import type {
  JiraIntegration,
  JiraIntegrationWriteInput,
  JiraFieldMappings,
  JiraSyncRun,
  JiraSyncRunMode,
  JiraSyncRunStatus,
  JiraIssue,
  JiraProject,
} from "@/types/jira-integration";

function asMappings(value: unknown): JiraFieldMappings {
  return asJiraFieldMappings(value);
}

function mapIntegration(row: Record<string, unknown>): JiraIntegration {
  return {
    id: String(row.id),
    team_id: String(row.team_id),
    name: String(row.name),
    base_url: String(row.base_url),
    email: String(row.email),
    api_token_secret_ref: String(row.api_token_secret_ref),
    is_enabled: Boolean(row.is_enabled),
    project_keys: Array.isArray(row.project_keys)
      ? row.project_keys.map(String)
      : [],
    jql_extra: (row.jql_extra as string | null) ?? null,
    sync_window_days: Number(row.sync_window_days ?? 90),
    safety_overlap_minutes: Number(row.safety_overlap_minutes ?? 15),
    include_worklogs: Boolean(row.include_worklogs ?? true),
    include_changelog: Boolean(row.include_changelog ?? true),
    sync_cursor_updated_at: (row.sync_cursor_updated_at as string | null) ?? null,
    last_successful_sync_at:
      (row.last_successful_sync_at as string | null) ?? null,
    field_mappings: asMappings(row.field_mappings),
    settings:
      row.settings && typeof row.settings === "object"
        ? (row.settings as Record<string, unknown>)
        : {},
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapSyncRun(row: Record<string, unknown>): JiraSyncRun {
  return {
    id: String(row.id),
    integration_id: String(row.integration_id),
    mode: row.mode as JiraSyncRunMode,
    status: row.status as JiraSyncRunStatus,
    trigger_source: String(row.trigger_source ?? "manual"),
    started_at: (row.started_at as string | null) ?? null,
    finished_at: (row.finished_at as string | null) ?? null,
    cursor_from: (row.cursor_from as string | null) ?? null,
    cursor_to: (row.cursor_to as string | null) ?? null,
    jql: (row.jql as string | null) ?? null,
    issues_fetched: Number(row.issues_fetched ?? 0),
    issues_upserted: Number(row.issues_upserted ?? 0),
    status_events_upserted: Number(row.status_events_upserted ?? 0),
    assignee_events_upserted: Number(row.assignee_events_upserted ?? 0),
    worklogs_upserted: Number(row.worklogs_upserted ?? 0),
    pages_fetched: Number(row.pages_fetched ?? 0),
    api_requests: Number(row.api_requests ?? 0),
    error_message: (row.error_message as string | null) ?? null,
    error_details:
      row.error_details && typeof row.error_details === "object"
        ? (row.error_details as Record<string, unknown>)
        : null,
    metrics:
      row.metrics && typeof row.metrics === "object"
        ? (row.metrics as Record<string, unknown>)
        : {},
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapIssue(row: Record<string, unknown>): JiraIssue {
  return {
    id: String(row.id),
    integration_id: String(row.integration_id),
    project_id: (row.project_id as string | null) ?? null,
    jira_id: String(row.jira_id),
    jira_key: String(row.jira_key),
    summary: (row.summary as string | null) ?? null,
    issue_type: (row.issue_type as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    status_category: (row.status_category as string | null) ?? null,
    priority: (row.priority as string | null) ?? null,
    labels: Array.isArray(row.labels) ? row.labels.map(String) : [],
    assignee_account_id: (row.assignee_account_id as string | null) ?? null,
    assignee_display_name: (row.assignee_display_name as string | null) ?? null,
    reporter_account_id: (row.reporter_account_id as string | null) ?? null,
    story_points:
      row.story_points == null ? null : Number(row.story_points),
    created_at_jira: (row.created_at_jira as string | null) ?? null,
    updated_at_jira: (row.updated_at_jira as string | null) ?? null,
    resolved_at_jira: (row.resolved_at_jira as string | null) ?? null,
    unit_test_delivery_on:
      (row.unit_test_delivery_on as string | null) ?? null,
    due_on: (row.due_on as string | null) ?? null,
    estimate_hours:
      row.estimate_hours == null ? null : Number(row.estimate_hours),
    parent_key: (row.parent_key as string | null) ?? null,
    content_hash: (row.content_hash as string | null) ?? null,
    last_synced_at: (row.last_synced_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapProject(row: Record<string, unknown>): JiraProject {
  return {
    id: String(row.id),
    integration_id: String(row.integration_id),
    jira_id: String(row.jira_id),
    key: String(row.key),
    name: String(row.name),
    style: (row.style as string | null) ?? null,
    field_mappings: asMappings(row.field_mappings),
    last_synced_at: (row.last_synced_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listJiraIntegrations(): Promise<JiraIntegration[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jira_integrations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao listar integrações Jira: ${error.message}`);
  }

  return (data ?? []).map((row) => mapIntegration(row as Record<string, unknown>));
}

export async function getJiraIntegration(
  id: string,
): Promise<JiraIntegration | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jira_integrations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao carregar integração Jira: ${error.message}`);
  }
  return data ? mapIntegration(data as Record<string, unknown>) : null;
}

export async function upsertJiraIntegration(
  input: JiraIntegrationWriteInput,
): Promise<JiraIntegration> {
  const supabase = await createClient();
  const payload: Record<string, unknown> = {
    team_id: input.teamId,
    name: input.name.trim(),
    base_url: input.baseUrl.trim().replace(/\/+$/, ""),
    email: input.email.trim(),
    api_token_secret_ref: input.apiTokenSecretRef.trim().toUpperCase(),
    is_enabled: input.isEnabled ?? false,
    project_keys: (input.projectKeys ?? []).map((k) => k.trim().toUpperCase()),
    jql_extra: input.jqlExtra?.trim() || null,
    sync_window_days: input.syncWindowDays ?? 90,
    safety_overlap_minutes: input.safetyOverlapMinutes ?? 15,
    include_worklogs: input.includeWorklogs ?? true,
    include_changelog: input.includeChangelog ?? true,
  };
  // Preserve existing mappings when the connection form does not send them.
  if (input.fieldMappings !== undefined) {
    payload.field_mappings = input.fieldMappings;
  }

  const { data, error } = await supabase
    .from("jira_integrations")
    .upsert(payload, { onConflict: "team_id" })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao salvar integração Jira: ${error.message}`);
  }

  return mapIntegration(data as Record<string, unknown>);
}

export async function updateJiraIntegrationFieldMappings(input: {
  integrationId: string;
  fieldMappings: JiraFieldMappings;
  settingsPatch?: Record<string, unknown>;
}): Promise<JiraIntegration> {
  const supabase = await createClient();
  const existing = await getJiraIntegration(input.integrationId);
  if (!existing) {
    throw new Error("Integração Jira não encontrada.");
  }

  const settings = {
    ...existing.settings,
    ...(input.settingsPatch ?? {}),
  };

  const { data, error } = await supabase
    .from("jira_integrations")
    .update({
      field_mappings: input.fieldMappings,
      settings,
    })
    .eq("id", input.integrationId)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Falha ao salvar field mappings da integração: ${error.message}`,
    );
  }

  return mapIntegration(data as Record<string, unknown>);
}

export async function updateJiraIntegrationCursor(input: {
  integrationId: string;
  syncCursorUpdatedAt: string;
  lastSuccessfulSyncAt: string;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("jira_integrations")
    .update({
      sync_cursor_updated_at: input.syncCursorUpdatedAt,
      last_successful_sync_at: input.lastSuccessfulSyncAt,
    })
    .eq("id", input.integrationId);

  if (error) {
    throw new Error(`Falha ao atualizar cursor Jira: ${error.message}`);
  }
}

export async function createJiraSyncRun(input: {
  integrationId: string;
  mode: JiraSyncRunMode;
  createdBy: string | null;
  jql: string;
  cursorFrom: string;
  cursorTo: string;
}): Promise<JiraSyncRun> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jira_sync_runs")
    .insert({
      integration_id: input.integrationId,
      mode: input.mode,
      status: "pending" satisfies JiraSyncRunStatus,
      trigger_source: "manual",
      created_by: input.createdBy,
      jql: input.jql,
      cursor_from: input.cursorFrom,
      cursor_to: input.cursorTo,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao criar sync run: ${error.message}`);
  }

  return mapSyncRun(data as Record<string, unknown>);
}

export async function updateJiraSyncRun(
  id: string,
  patch: Partial<{
    status: JiraSyncRunStatus;
    started_at: string | null;
    finished_at: string | null;
    issues_fetched: number;
    issues_upserted: number;
    status_events_upserted: number;
    assignee_events_upserted: number;
    worklogs_upserted: number;
    pages_fetched: number;
    api_requests: number;
    error_message: string | null;
    error_details: Record<string, unknown> | null;
    metrics: Record<string, unknown>;
  }>,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("jira_sync_runs")
    .update(patch)
    .eq("id", id);

  if (error) {
    throw new Error(`Falha ao atualizar sync run: ${error.message}`);
  }
}

export async function listRecentJiraSyncRuns(
  integrationId: string,
  limit = 10,
): Promise<JiraSyncRun[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jira_sync_runs")
    .select("*")
    .eq("integration_id", integrationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Falha ao listar sync runs: ${error.message}`);
  }

  return (data ?? []).map((row) => mapSyncRun(row as Record<string, unknown>));
}

export async function upsertJiraProjects(
  integrationId: string,
  projects: Array<{
    jiraId: string;
    key: string;
    name: string;
    style?: string | null;
    rawPayload?: Record<string, unknown>;
  }>,
): Promise<Map<string, string>> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const keyToId = new Map<string, string>();

  if (projects.length === 0) {
    return keyToId;
  }

  const rows = projects.map((project) => ({
    integration_id: integrationId,
    jira_id: project.jiraId,
    key: project.key,
    name: project.name,
    style: project.style ?? null,
    raw_payload: project.rawPayload ?? null,
    last_synced_at: now,
  }));

  const { data, error } = await supabase
    .from("jira_projects")
    .upsert(rows, { onConflict: "integration_id,jira_id" })
    .select("id, key");

  if (error) {
    throw new Error(`Falha ao upsert projetos Jira: ${error.message}`);
  }

  for (const row of data ?? []) {
    keyToId.set(String(row.key), String(row.id));
  }

  return keyToId;
}

export async function listJiraProjects(
  integrationId: string,
): Promise<JiraProject[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jira_projects")
    .select("*")
    .eq("integration_id", integrationId)
    .order("key", { ascending: true });

  if (error) {
    throw new Error(`Falha ao listar projetos Jira: ${error.message}`);
  }

  return (data ?? []).map((row) => mapProject(row as Record<string, unknown>));
}

export async function updateJiraProjectFieldMappings(input: {
  integrationId: string;
  projectId: string;
  fieldMappings: JiraFieldMappings;
}): Promise<JiraProject> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jira_projects")
    .update({ field_mappings: input.fieldMappings })
    .eq("id", input.projectId)
    .eq("integration_id", input.integrationId)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Falha ao salvar field mappings do projeto: ${error.message}`,
    );
  }

  return mapProject(data as Record<string, unknown>);
}

export async function countJiraIssues(integrationId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("jira_issues")
    .select("id", { count: "exact", head: true })
    .eq("integration_id", integrationId);

  if (error) {
    throw new Error(`Falha ao contar issues Jira: ${error.message}`);
  }
  return count ?? 0;
}

export async function listSampleJiraIssues(
  integrationId: string,
  limit = 20,
): Promise<JiraIssue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jira_issues")
    .select("*")
    .eq("integration_id", integrationId)
    .order("updated_at_jira", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw new Error(`Falha ao listar issues Jira: ${error.message}`);
  }

  return (data ?? []).map((row) => mapIssue(row as Record<string, unknown>));
}
