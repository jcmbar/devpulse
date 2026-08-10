import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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
  return value.trim().toUpperCase();
}

function compositeKey(jiraKey: string, kind: DelayJustificationKind): string {
  return `${normalizeJiraKey(jiraKey)}::${kind}`;
}

/**
 * Latest request per (jira_key, kind) for a developer within one Compilado batch.
 * Preference: accepted > pending > rejected (by requested_at within same status).
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
 * Prefer accepted > pending > rejected (then newest requested_at).
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
  const rank: Record<DelayJustificationStatus, number> = {
    accepted: 3,
    pending: 2,
    rejected: 1,
  };
  const best = new Map<string, DelayJustificationRequest>();
  for (const row of rows) {
    const key = compositeKey(row.jira_key, row.kind);
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

function developerKeyKind(
  developerId: string,
  jiraKey: string,
  kind: DelayJustificationKind,
): string {
  return `${developerId}::${normalizeJiraKey(jiraKey)}::${kind}`;
}

function pickLatestPerDeveloperKeyKind(
  rows: DelayJustificationRequest[],
): DelayJustificationRequest[] {
  const rank: Record<DelayJustificationStatus, number> = {
    accepted: 3,
    pending: 2,
    rejected: 1,
  };
  const best = new Map<string, DelayJustificationRequest>();
  for (const row of rows) {
    const key = developerKeyKind(row.developer_id, row.jira_key, row.kind);
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

export type CopyJustificationsBetweenImportsResult = {
  considered: number;
  copied: number;
  skippedNoCard: number;
  skippedAlreadyPresent: number;
};

/**
 * Copy pending/accepted/rejected justifications from one Compilado batch to
 * another (e.g. after Jira rematerialize). Matches on
 * `(developer_id, jira_key, kind)` when the card still exists on the destination
 * batch. Uses the service role to bypass insert RLS (developers-only).
 */
export async function copyJustificationsBetweenImports(input: {
  fromImportId: string;
  toImportId: string;
}): Promise<CopyJustificationsBetweenImportsResult> {
  if (input.fromImportId === input.toImportId) {
    return {
      considered: 0,
      copied: 0,
      skippedNoCard: 0,
      skippedAlreadyPresent: 0,
    };
  }

  const admin = createAdminClient();

  const { data: sourceData, error: sourceError } = await admin
    .from("delay_justification_requests")
    .select("*")
    .eq("import_id", input.fromImportId)
    .in("status", ["pending", "accepted", "rejected"]);

  if (sourceError) {
    throw new Error(
      `Falha ao ler justificativas do lote anterior: ${sourceError.message}`,
    );
  }

  const sourceRows = pickLatestPerDeveloperKeyKind(
    (sourceData ?? []).map((row) => mapRow(row as Record<string, unknown>)),
  );

  if (sourceRows.length === 0) {
    return {
      considered: 0,
      copied: 0,
      skippedNoCard: 0,
      skippedAlreadyPresent: 0,
    };
  }

  const { data: destCards, error: cardsError } = await admin
    .from("jira_cards")
    .select("id, jira_key, developer_id, due_on, unit_test_delivery_on, delay_days")
    .eq("import_id", input.toImportId)
    .not("developer_id", "is", null);

  if (cardsError) {
    throw new Error(
      `Falha ao ler cards do lote novo para copiar justificativas: ${cardsError.message}`,
    );
  }

  const cardByDeveloperKey = new Map<
    string,
    {
      id: string;
      due_on: string | null;
      unit_test_delivery_on: string | null;
      delay_days: number | null;
    }
  >();
  for (const card of destCards ?? []) {
    if (!card.developer_id) {
      continue;
    }
    const key = `${String(card.developer_id)}::${normalizeJiraKey(String(card.jira_key))}`;
    cardByDeveloperKey.set(key, {
      id: String(card.id),
      due_on: (card.due_on as string | null) ?? null,
      unit_test_delivery_on: (card.unit_test_delivery_on as string | null) ?? null,
      delay_days: card.delay_days == null ? null : Number(card.delay_days),
    });
  }

  const { data: existingDest, error: existingError } = await admin
    .from("delay_justification_requests")
    .select("developer_id, jira_key, kind, status")
    .eq("import_id", input.toImportId)
    .in("status", ["pending", "accepted"]);

  if (existingError) {
    throw new Error(
      `Falha ao validar justificativas já existentes no lote novo: ${existingError.message}`,
    );
  }

  const blockedKeys = new Set<string>();
  for (const row of existingDest ?? []) {
    blockedKeys.add(
      developerKeyKind(
        String(row.developer_id),
        String(row.jira_key),
        row.kind === "rework" ? "rework" : "delay",
      ),
    );
  }

  const inserts: Record<string, unknown>[] = [];
  let skippedNoCard = 0;
  let skippedAlreadyPresent = 0;

  for (const row of sourceRows) {
    const identity = developerKeyKind(row.developer_id, row.jira_key, row.kind);
    const cardKey = `${row.developer_id}::${normalizeJiraKey(row.jira_key)}`;
    const card = cardByDeveloperKey.get(cardKey);
    if (!card) {
      skippedNoCard += 1;
      continue;
    }

    if (
      (row.status === "pending" || row.status === "accepted") &&
      blockedKeys.has(identity)
    ) {
      skippedAlreadyPresent += 1;
      continue;
    }

    inserts.push({
      import_id: input.toImportId,
      jira_card_id: card.id,
      jira_key: normalizeJiraKey(row.jira_key),
      developer_id: row.developer_id,
      kind: row.kind,
      due_on: card.due_on ?? row.due_on,
      unit_test_delivery_on:
        card.unit_test_delivery_on ?? row.unit_test_delivery_on,
      delay_days: card.delay_days ?? row.delay_days,
      requester_profile_id: row.requester_profile_id,
      developer_note: row.developer_note,
      requested_at: row.requested_at,
      status: row.status,
      reviewer_profile_id: row.reviewer_profile_id,
      reviewer_note: row.reviewer_note,
      reviewed_at: row.reviewed_at,
    });

    if (row.status === "pending" || row.status === "accepted") {
      blockedKeys.add(identity);
    }
  }

  if (inserts.length === 0) {
    return {
      considered: sourceRows.length,
      copied: 0,
      skippedNoCard,
      skippedAlreadyPresent,
    };
  }

  const { error: insertError } = await admin
    .from("delay_justification_requests")
    .insert(inserts);

  if (insertError) {
    throw new Error(
      `Falha ao copiar justificativas para o lote novo: ${insertError.message}`,
    );
  }

  return {
    considered: sourceRows.length,
    copied: inserts.length,
    skippedNoCard,
    skippedAlreadyPresent,
  };
}
