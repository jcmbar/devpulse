import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeJustificationJiraKey,
  pickLatestJustifications,
  planJustificationCopies,
  type JustificationCopyInsert,
  type JustificationCopyPlan,
  type JustificationCopySource,
  type JustificationCopyUpdate,
} from "@/lib/metrics/delay-justification-copy";
import type {
  DelayJustificationDecisionInput,
  DelayJustificationKind,
  DelayJustificationRequest,
  DelayJustificationStatus,
  DelayJustificationSubmitInput,
} from "@/types/delay-justification";

function mapRow(row: Record<string, unknown>): DelayJustificationRequest {
  const kindRaw = String(row.kind ?? "delay");
  const kind: DelayJustificationKind =
    kindRaw === "rework" ? "rework" : "delay";

  return {
    id: String(row.id),
    import_id: String(row.import_id),
    jira_card_id: (row.jira_card_id as string | null) ?? null,
    jira_key: String(row.jira_key),
    developer_id: String(row.developer_id),
    kind,
    due_on: (row.due_on as string | null) ?? null,
    unit_test_delivery_on: (row.unit_test_delivery_on as string | null) ?? null,
    delay_days: row.delay_days == null ? null : Number(row.delay_days),
    requester_profile_id: String(row.requester_profile_id),
    developer_note: String(row.developer_note),
    requested_at: String(row.requested_at),
    status: row.status as DelayJustificationStatus,
    reviewer_profile_id: (row.reviewer_profile_id as string | null) ?? null,
    reviewer_note: (row.reviewer_note as string | null) ?? null,
    reviewed_at: (row.reviewed_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function normalizeJiraKey(value: string): string {
  return normalizeJustificationJiraKey(value);
}

/**
 * Latest request per (jira_key, kind) for a developer within one Compilado batch.
 * Preference: accepted > rejected > pending (by requested_at within same status).
 */
export async function listDelayJustificationsForDeveloperImport(input: {
  importId: string;
  developerId: string;
  kind?: DelayJustificationKind | "all";
}): Promise<DelayJustificationRequest[]> {
  return listDelayJustificationsForDeveloperImports({
    importIds: [input.importId],
    developerId: input.developerId,
    kind: input.kind,
  });
}

/**
 * Latest request per (jira_key, kind) across one or more Compilado batches.
 * Prefer accepted > rejected > pending (then newest requested_at).
 */
export async function listDelayJustificationsForDeveloperImports(input: {
  importIds: string[];
  developerId: string;
  kind?: DelayJustificationKind | "all";
}): Promise<DelayJustificationRequest[]> {
  const importIds = [
    ...new Set(input.importIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (importIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  let query = supabase
    .from("delay_justification_requests")
    .select("*")
    .in("import_id", importIds)
    .eq("developer_id", input.developerId)
    .order("requested_at", { ascending: false });

  if (input.kind && input.kind !== "all") {
    query = query.eq("kind", input.kind);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Falha ao listar justificativas: ${error.message}`);
  }

  const rows = (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
  return pickLatestPerKeyAndKind(rows);
}

export async function listAcceptedDelayKeysByDeveloper(input: {
  importId: string;
  developerIds?: string[];
}): Promise<Map<string, Set<string>>> {
  return listAcceptedKeysByDeveloper({
    ...input,
    kind: "delay",
  });
}

export async function listAcceptedReworkKeysByDeveloper(input: {
  importId: string;
  developerIds?: string[];
}): Promise<Map<string, Set<string>>> {
  return listAcceptedKeysByDeveloper({
    ...input,
    kind: "rework",
  });
}

async function listAcceptedKeysByDeveloper(input: {
  importId: string;
  developerIds?: string[];
  kind: DelayJustificationKind;
}): Promise<Map<string, Set<string>>> {
  const supabase = await createClient();
  let query = supabase
    .from("delay_justification_requests")
    .select("developer_id, jira_key")
    .eq("import_id", input.importId)
    .eq("kind", input.kind)
    .eq("status", "accepted");

  if (input.developerIds && input.developerIds.length > 0) {
    query = query.in("developer_id", input.developerIds);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(
      `Falha ao listar ${input.kind === "rework" ? "retrabalhos" : "atrasos"} acatados: ${error.message}`,
    );
  }

  const map = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const developerId = String(row.developer_id);
    const key = normalizeJiraKey(String(row.jira_key));
    const set = map.get(developerId) ?? new Set<string>();
    set.add(key);
    map.set(developerId, set);
  }
  return map;
}

/**
 * Pending justifications awaiting gestor decision, per developer, by kind.
 */
/**
 * Pending justification keys per developer.
 *
 * Callers must intersect these with the cards still classified as
 * atraso/retrabalho: a reclassification (or a Jira re-sync) can leave a pending
 * request on a card that no longer belongs to the metric, and such a request
 * cannot be decided from the audit drawer.
 */
export async function listPendingJustificationKeysByDeveloper(input: {
  importId: string;
  developerIds?: string[];
  kind: DelayJustificationKind;
}): Promise<Map<string, Set<string>>> {
  const supabase = await createClient();
  let query = supabase
    .from("delay_justification_requests")
    .select("developer_id, jira_key")
    .eq("import_id", input.importId)
    .eq("kind", input.kind)
    .eq("status", "pending");

  if (input.developerIds && input.developerIds.length > 0) {
    query = query.in("developer_id", input.developerIds);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(
      `Falha ao listar justificativas pendentes (${input.kind}): ${error.message}`,
    );
  }

  const map = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const developerId = String(row.developer_id);
    const keys = map.get(developerId) ?? new Set<string>();
    keys.add(normalizeJiraKey(String(row.jira_key)));
    map.set(developerId, keys);
  }
  return map;
}

export async function listPendingJustificationCountsByDeveloper(input: {
  importId: string;
  developerIds?: string[];
  kind: DelayJustificationKind;
}): Promise<Map<string, number>> {
  const keysByDeveloper = await listPendingJustificationKeysByDeveloper(input);
  return new Map(
    [...keysByDeveloper].map(([developerId, keys]) => [developerId, keys.size]),
  );
}

/** @deprecated Prefer listPendingJustificationCountsByDeveloper({ kind: "delay" }) */
export async function listPendingDelayJustificationCountsByDeveloper(input: {
  importId: string;
  developerIds?: string[];
}): Promise<Map<string, number>> {
  return listPendingJustificationCountsByDeveloper({
    ...input,
    kind: "delay",
  });
}

export async function listDelayJustificationsForImportKeys(input: {
  importId: string;
  developerId: string;
  jiraKeys: string[];
  kind?: DelayJustificationKind;
}): Promise<Map<string, DelayJustificationRequest>> {
  if (input.jiraKeys.length === 0) {
    return new Map();
  }

  const kind = input.kind ?? "delay";
  const supabase = await createClient();
  const keys = input.jiraKeys.map(normalizeJiraKey);
  const { data, error } = await supabase
    .from("delay_justification_requests")
    .select("*")
    .eq("import_id", input.importId)
    .eq("developer_id", input.developerId)
    .eq("kind", kind)
    .in("jira_key", keys)
    .order("requested_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao carregar justificativas do audit: ${error.message}`);
  }

  const latest = pickLatestPerKeyAndKind(
    (data ?? []).map((row) => mapRow(row as Record<string, unknown>)),
  );
  return new Map(latest.map((row) => [normalizeJiraKey(row.jira_key), row]));
}

function pickLatestPerKeyAndKind(
  rows: DelayJustificationRequest[],
): DelayJustificationRequest[] {
  return pickLatestJustifications(rows);
}

export async function submitDelayJustification(
  input: DelayJustificationSubmitInput,
): Promise<DelayJustificationRequest> {
  const note = input.developerNote.trim();
  if (!note) {
    throw new Error("A justificativa do developer é obrigatória.");
  }

  const kind = input.kind;
  const label = kind === "rework" ? "retrabalho" : "atraso";
  const supabase = await createClient();
  const jiraKey = normalizeJiraKey(input.jiraKey);

  const { data: existing, error: existingError } = await supabase
    .from("delay_justification_requests")
    .select("id, status")
    .eq("import_id", input.importId)
    .eq("developer_id", input.developerId)
    .eq("jira_key", jiraKey)
    .eq("kind", kind)
    .in("status", ["pending", "accepted"])
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Falha ao validar pedido existente: ${existingError.message}`);
  }
  if (existing?.status === "pending") {
    throw new Error(
      `Já existe um pedido de ${label} pendente para este card neste lote.`,
    );
  }
  if (existing?.status === "accepted") {
    throw new Error(`Este ${label} já foi acatado neste lote.`);
  }

  const { data, error } = await supabase
    .from("delay_justification_requests")
    .insert({
      import_id: input.importId,
      jira_card_id: input.jiraCardId,
      jira_key: jiraKey,
      developer_id: input.developerId,
      kind,
      due_on: input.dueOn,
      unit_test_delivery_on: input.unitTestDeliveryOn,
      delay_days: input.delayDays,
      requester_profile_id: input.requesterProfileId,
      developer_note: note,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao criar justificativa: ${error.message}`);
  }

  const created = mapRow(data as Record<string, unknown>);
  try {
    await mirrorJustificationsToLiveTeamImports(created.import_id);
  } catch (mirrorError) {
    console.error(
      "[delay-justifications] falha ao espelhar envio nos lotes ativos",
      mirrorError,
    );
  }
  return created;
}

export async function decideDelayJustification(
  input: DelayJustificationDecisionInput,
): Promise<DelayJustificationRequest> {
  const note = input.reviewerNote.trim();
  if (!note) {
    throw new Error("A justificativa do gestor é obrigatória.");
  }

  const supabase = await createClient();
  const { data: current, error: loadError } = await supabase
    .from("delay_justification_requests")
    .select("*")
    .eq("id", input.requestId)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Falha ao carregar pedido: ${loadError.message}`);
  }
  if (!current) {
    throw new Error("Pedido de justificativa não encontrado.");
  }
  if (current.status !== "pending") {
    throw new Error("Só é possível decidir pedidos pendentes.");
  }

  const { data, error } = await supabase
    .from("delay_justification_requests")
    .update({
      status: input.decision,
      reviewer_profile_id: input.reviewerProfileId,
      reviewer_note: note,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.requestId)
    .eq("status", "pending")
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao registrar decisão: ${error.message}`);
  }

  const decided = mapRow(data as Record<string, unknown>);
  try {
    await mirrorJustificationsToLiveTeamImports(decided.import_id);
  } catch (mirrorError) {
    console.error(
      "[delay-justifications] falha ao espelhar decisão nos lotes ativos",
      mirrorError,
    );
  }
  return decided;
}

export type CopyJustificationsBetweenImportsResult = {
  considered: number;
  copied: number;
  updated: number;
  skippedNoCard: number;
  skippedAlreadyPresent: number;
};

const EMPTY_COPY_RESULT: CopyJustificationsBetweenImportsResult = {
  considered: 0,
  copied: 0,
  updated: 0,
  skippedNoCard: 0,
  skippedAlreadyPresent: 0,
};

function toCopySource(row: DelayJustificationRequest): JustificationCopySource {
  return {
    developer_id: row.developer_id,
    jira_key: row.jira_key,
    kind: row.kind,
    status: row.status,
    requested_at: row.requested_at,
    developer_note: row.developer_note,
    requester_profile_id: row.requester_profile_id,
    reviewer_profile_id: row.reviewer_profile_id,
    reviewer_note: row.reviewer_note,
    reviewed_at: row.reviewed_at,
    due_on: row.due_on,
    unit_test_delivery_on: row.unit_test_delivery_on,
    delay_days: row.delay_days,
  };
}

function insertPayload(
  toImportId: string,
  row: JustificationCopyInsert,
): Record<string, unknown> {
  return {
    import_id: toImportId,
    jira_card_id: row.jira_card_id,
    jira_key: row.jira_key,
    developer_id: row.developer_id,
    kind: row.kind,
    due_on: row.due_on,
    unit_test_delivery_on: row.unit_test_delivery_on,
    delay_days: row.delay_days,
    requester_profile_id: row.requester_profile_id,
    developer_note: row.developer_note,
    requested_at: row.requested_at,
    status: row.status,
    reviewer_profile_id: row.reviewer_profile_id,
    reviewer_note: row.reviewer_note,
    reviewed_at: row.reviewed_at,
  };
}

function updatePayload(row: JustificationCopyUpdate): Record<string, unknown> {
  return {
    jira_card_id: row.jira_card_id,
    due_on: row.due_on,
    unit_test_delivery_on: row.unit_test_delivery_on,
    delay_days: row.delay_days,
    requester_profile_id: row.requester_profile_id,
    developer_note: row.developer_note,
    requested_at: row.requested_at,
    status: row.status,
    reviewer_profile_id: row.reviewer_profile_id,
    reviewer_note: row.reviewer_note,
    reviewed_at: row.reviewed_at,
  };
}

async function applyJustificationCopyPlan(input: {
  toImportId: string;
  plan: JustificationCopyPlan;
}): Promise<CopyJustificationsBetweenImportsResult> {
  const admin = createAdminClient();

  if (input.plan.inserts.length > 0) {
    const { error: insertError } = await admin
      .from("delay_justification_requests")
      .insert(
        input.plan.inserts.map((row) => insertPayload(input.toImportId, row)),
      );
    if (insertError) {
      throw new Error(
        `Falha ao copiar justificativas para o lote novo: ${insertError.message}`,
      );
    }
  }

  for (const row of input.plan.updates) {
    const { error: updateError } = await admin
      .from("delay_justification_requests")
      .update(updatePayload(row))
      .eq("id", row.id)
      .eq("import_id", input.toImportId);
    if (updateError) {
      throw new Error(
        `Falha ao atualizar justificativa copiada: ${updateError.message}`,
      );
    }
  }

  return {
    considered: input.plan.considered,
    copied: input.plan.inserts.length,
    updated: input.plan.updates.length,
    skippedNoCard: input.plan.skippedNoCard,
    skippedAlreadyPresent: input.plan.skippedAlreadyPresent,
  };
}

async function listCompletedImportIdsForTeam(
  teamId: string,
): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("imports")
    .select("id")
    .eq("team_id", teamId)
    .eq("status", "completed");
  if (error) {
    throw new Error(
      `Falha ao listar lotes do time para copiar justificativas: ${error.message}`,
    );
  }
  return (data ?? []).map((row) => String(row.id));
}

const IN_FILTER_CHUNK = 80;

type DestCardRow = {
  id: string;
  jira_key: string;
  developer_id: string | null;
  due_on: string | null;
  unit_test_delivery_on: string | null;
  delay_days: number | null;
};

function mapDestCard(card: Record<string, unknown>): DestCardRow {
  return {
    id: String(card.id),
    jira_key: String(card.jira_key),
    developer_id: (card.developer_id as string | null) ?? null,
    due_on: (card.due_on as string | null) ?? null,
    unit_test_delivery_on:
      (card.unit_test_delivery_on as string | null) ?? null,
    delay_days: card.delay_days == null ? null : Number(card.delay_days),
  };
}

async function listDestCardsByKeys(
  importId: string,
  jiraKeys: string[],
): Promise<DestCardRow[]> {
  const keys = [
    ...new Set(jiraKeys.map(normalizeJiraKey).filter(Boolean)),
  ];
  if (keys.length === 0) {
    return [];
  }

  const admin = createAdminClient();
  const rows: DestCardRow[] = [];
  for (let index = 0; index < keys.length; index += IN_FILTER_CHUNK) {
    const chunk = keys.slice(index, index + IN_FILTER_CHUNK);
    const { data, error } = await admin
      .from("jira_cards")
      .select("id, jira_key, developer_id, due_on, unit_test_delivery_on, delay_days")
      .eq("import_id", importId)
      .in("jira_key", chunk);
    if (error) {
      throw new Error(
        `Falha ao ler cards do lote novo para copiar justificativas: ${error.message}`,
      );
    }
    for (const card of data ?? []) {
      rows.push(mapDestCard(card as Record<string, unknown>));
    }
  }
  return rows;
}

async function listJustificationRowsForImports(
  importIds: string[],
): Promise<DelayJustificationRequest[]> {
  const admin = createAdminClient();
  const rows: DelayJustificationRequest[] = [];
  for (let index = 0; index < importIds.length; index += IN_FILTER_CHUNK) {
    const chunk = importIds.slice(index, index + IN_FILTER_CHUNK);
    const { data, error } = await admin
      .from("delay_justification_requests")
      .select("*")
      .in("import_id", chunk)
      .in("status", ["pending", "accepted", "rejected"]);
    if (error) {
      throw new Error(
        `Falha ao ler justificativas dos lotes anteriores: ${error.message}`,
      );
    }
    for (const row of data ?? []) {
      rows.push(mapRow(row as Record<string, unknown>));
    }
  }
  return rows;
}

async function listLiveImportIdsForTeam(teamId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("imports")
    .select("id")
    .eq("team_id", teamId)
    .eq("status", "completed")
    .is("archived_at", null);
  if (error) {
    throw new Error(
      `Falha ao listar lotes ativos do time: ${error.message}`,
    );
  }
  return (data ?? []).map((row) => String(row.id));
}

/**
 * Copy the strongest justification per card from prior Compilado lotes onto
 * `toImportId`. Passing several `fromImportIds` recovers rows submitted or
 * decided on an older lote after the previous rematerialize already ran.
 */
export async function copyJustificationsOntoImport(input: {
  toImportId: string;
  fromImportIds: string[];
}): Promise<CopyJustificationsBetweenImportsResult> {
  const fromImportIds = [
    ...new Set(
      input.fromImportIds
        .map((id) => id.trim())
        .filter((id) => id.length > 0 && id !== input.toImportId),
    ),
  ];
  if (fromImportIds.length === 0) {
    return { ...EMPTY_COPY_RESULT };
  }

  const admin = createAdminClient();
  const sourceRows = await listJustificationRowsForImports(fromImportIds);
  if (sourceRows.length === 0) {
    return { ...EMPTY_COPY_RESULT };
  }

  const destCards = await listDestCardsByKeys(
    input.toImportId,
    sourceRows.map((row) => row.jira_key),
  );

  const { data: existingDest, error: existingError } = await admin
    .from("delay_justification_requests")
    .select("id, developer_id, jira_key, kind, status, requested_at")
    .eq("import_id", input.toImportId);

  if (existingError) {
    throw new Error(
      `Falha ao validar justificativas já existentes no lote novo: ${existingError.message}`,
    );
  }

  const plan = planJustificationCopies({
    sourceRows: sourceRows.map(toCopySource),
    destCards: destCards,
    destExisting: (existingDest ?? []).map((row) => ({
      id: String(row.id),
      developer_id: String(row.developer_id),
      jira_key: String(row.jira_key),
      kind: row.kind === "rework" ? "rework" : "delay",
      status: row.status as DelayJustificationStatus,
      requested_at: String(row.requested_at),
    })),
  });

  return applyJustificationCopyPlan({
    toImportId: input.toImportId,
    plan,
  });
}

export async function copyJustificationsFromTeamHistory(input: {
  teamId: string;
  toImportId: string;
}): Promise<CopyJustificationsBetweenImportsResult> {
  const fromImportIds = await listCompletedImportIdsForTeam(input.teamId);
  return copyJustificationsOntoImport({
    toImportId: input.toImportId,
    fromImportIds,
  });
}

/**
 * After a submit/decision on a stale lote, copy onto every live Compilado
 * snapshot of the same team so the next sync is not required to see it.
 */
export async function mirrorJustificationsToLiveTeamImports(
  fromImportId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("imports")
    .select("team_id")
    .eq("id", fromImportId)
    .maybeSingle();
  if (error) {
    throw new Error(
      `Falha ao localizar o time do lote para espelhar justificativas: ${error.message}`,
    );
  }
  const teamId = data?.team_id ? String(data.team_id) : "";
  if (!teamId) {
    return;
  }

  const liveIds = await listLiveImportIdsForTeam(teamId);
  for (const toImportId of liveIds) {
    if (toImportId === fromImportId) {
      continue;
    }
    await copyJustificationsOntoImport({
      toImportId,
      fromImportIds: [fromImportId],
    });
  }
}

/**
 * Copy pending/accepted/rejected justifications from one Compilado batch to
 * another (e.g. after Jira rematerialize).
 */
export async function copyJustificationsBetweenImports(input: {
  fromImportId: string;
  toImportId: string;
}): Promise<CopyJustificationsBetweenImportsResult> {
  return copyJustificationsOntoImport({
    toImportId: input.toImportId,
    fromImportIds: [input.fromImportId],
  });
}
