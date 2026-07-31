import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  DelayJustificationDecisionInput,
  DelayJustificationRequest,
  DelayJustificationStatus,
  DelayJustificationSubmitInput,
} from "@/types/delay-justification";

function mapRow(row: Record<string, unknown>): DelayJustificationRequest {
  return {
    id: String(row.id),
    import_id: String(row.import_id),
    jira_card_id: (row.jira_card_id as string | null) ?? null,
    jira_key: String(row.jira_key),
    developer_id: String(row.developer_id),
    kind: "delay",
    due_on: (row.due_on as string | null) ?? null,
    unit_test_delivery_on: (row.unit_test_delivery_on as string | null) ?? null,
    delay_days:
      row.delay_days == null ? null : Number(row.delay_days),
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
  return value.trim().toUpperCase();
}

/**
 * Latest request per jira_key for a developer within one Compilado batch.
 * Preference: accepted > pending > rejected (by requested_at within same status).
 */
export async function listDelayJustificationsForDeveloperImport(input: {
  importId: string;
  developerId: string;
}): Promise<DelayJustificationRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("delay_justification_requests")
    .select("*")
    .eq("import_id", input.importId)
    .eq("developer_id", input.developerId)
    .eq("kind", "delay")
    .order("requested_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao listar justificativas: ${error.message}`);
  }

  const rows = (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
  return pickLatestPerKey(rows);
}

export async function listAcceptedDelayKeysByDeveloper(input: {
  importId: string;
  developerIds?: string[];
}): Promise<Map<string, Set<string>>> {
  const supabase = await createClient();
  let query = supabase
    .from("delay_justification_requests")
    .select("developer_id, jira_key")
    .eq("import_id", input.importId)
    .eq("kind", "delay")
    .eq("status", "accepted");

  if (input.developerIds && input.developerIds.length > 0) {
    query = query.in("developer_id", input.developerIds);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao listar atrasos acatados: ${error.message}`);
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

export async function listDelayJustificationsForImportKeys(input: {
  importId: string;
  developerId: string;
  jiraKeys: string[];
}): Promise<Map<string, DelayJustificationRequest>> {
  if (input.jiraKeys.length === 0) {
    return new Map();
  }

  const supabase = await createClient();
  const keys = input.jiraKeys.map(normalizeJiraKey);
  const { data, error } = await supabase
    .from("delay_justification_requests")
    .select("*")
    .eq("import_id", input.importId)
    .eq("developer_id", input.developerId)
    .eq("kind", "delay")
    .in("jira_key", keys)
    .order("requested_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao carregar justificativas do audit: ${error.message}`);
  }

  const latest = pickLatestPerKey(
    (data ?? []).map((row) => mapRow(row as Record<string, unknown>)),
  );
  return new Map(latest.map((row) => [normalizeJiraKey(row.jira_key), row]));
}

function pickLatestPerKey(
  rows: DelayJustificationRequest[],
): DelayJustificationRequest[] {
  const rank: Record<DelayJustificationStatus, number> = {
    accepted: 3,
    pending: 2,
    rejected: 1,
  };
  const best = new Map<string, DelayJustificationRequest>();
  for (const row of rows) {
    const key = normalizeJiraKey(row.jira_key);
    const current = best.get(key);
    if (!current) {
      best.set(key, row);
      continue;
    }
    const byStatus = rank[row.status] - rank[current.status];
    if (byStatus > 0) {
      best.set(key, row);
      continue;
    }
    if (byStatus === 0 && row.requested_at > current.requested_at) {
      best.set(key, row);
    }
  }
  return [...best.values()];
}

export async function submitDelayJustification(
  input: DelayJustificationSubmitInput,
): Promise<DelayJustificationRequest> {
  const note = input.developerNote.trim();
  if (!note) {
    throw new Error("A justificativa do developer é obrigatória.");
  }

  const supabase = await createClient();
  const jiraKey = normalizeJiraKey(input.jiraKey);

  const { data: existing, error: existingError } = await supabase
    .from("delay_justification_requests")
    .select("id, status")
    .eq("import_id", input.importId)
    .eq("developer_id", input.developerId)
    .eq("jira_key", jiraKey)
    .eq("kind", "delay")
    .in("status", ["pending", "accepted"])
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Falha ao validar pedido existente: ${existingError.message}`);
  }
  if (existing?.status === "pending") {
    throw new Error("Já existe um pedido pendente para este card neste lote.");
  }
  if (existing?.status === "accepted") {
    throw new Error("Este atraso já foi acatado neste lote.");
  }

  const { data, error } = await supabase
    .from("delay_justification_requests")
    .insert({
      import_id: input.importId,
      jira_card_id: input.jiraCardId,
      jira_key: jiraKey,
      developer_id: input.developerId,
      kind: "delay",
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

  return mapRow(data as Record<string, unknown>);
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

  return mapRow(data as Record<string, unknown>);
}
