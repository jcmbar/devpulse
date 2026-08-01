import "server-only";

import {
  endOfMonth,
  startOfMonth,
} from "@/lib/metrics/date-range";
import { getCardDeliveryFlags } from "@/lib/metrics/developer-period";
import { createClient } from "@/lib/supabase/server";
import { listDelayJustificationsForDeveloperImport } from "@/services/delay-justifications";
import { listJiraCardsByDeveloperAndImport } from "@/services/jira-cards";
import type { DelayJustificationRequest } from "@/types/delay-justification";
import type { JiraCard } from "@/types/jira-card";
import type {
  MonthlyClosing,
  MonthlyClosingAttachment,
  MonthlyClosingAttachmentType,
  MonthlyClosingCardAuditRow,
  MonthlyClosingEvent,
  MonthlyClosingEventType,
  MonthlyClosingItem,
  MonthlyClosingJustificationSnapshot,
  MonthlyClosingStatus,
} from "@/types/monthly-closing";

export const MONTHLY_CLOSING_STORAGE_BUCKET = "monthly-closing-attachments";

function mapAttachment(row: Record<string, unknown>): MonthlyClosingAttachment {
  return {
    id: String(row.id),
    monthly_closing_id: String(row.monthly_closing_id),
    type: row.type as MonthlyClosingAttachmentType,
    file_storage_key: String(row.file_storage_key),
    original_filename: String(row.original_filename),
    mime_type: String(row.mime_type),
    uploaded_at: String(row.uploaded_at),
    uploaded_by_user_id: (row.uploaded_by_user_id as string | null) ?? null,
    is_valid: row.is_valid == null ? null : Boolean(row.is_valid),
    validated_at: (row.validated_at as string | null) ?? null,
    validated_by_user_id: (row.validated_by_user_id as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

function assertEditableClosing(closing: MonthlyClosing): void {
  if (closing.status === "finalized" || closing.finalized_at) {
    throw new Error(
      "Este fechamento está finalizado e não pode ser alterado.",
    );
  }
}

function mapClosing(row: Record<string, unknown>): MonthlyClosing {
  return {
    id: String(row.id),
    developer_id: String(row.developer_id),
    team_id: (row.team_id as string | null) ?? null,
    year_month: String(row.year_month),
    status: row.status as MonthlyClosingStatus,
    period_start: String(row.period_start),
    period_end: String(row.period_end),
    source_mode: (row.source_mode as string | null) ?? null,
    import_id: (row.import_id as string | null) ?? null,
    snapshot_generated_at: (row.snapshot_generated_at as string | null) ?? null,
    started_at: (row.started_at as string | null) ?? null,
    submitted_at: (row.submitted_at as string | null) ?? null,
    manager_approved_at: (row.manager_approved_at as string | null) ?? null,
    closed_at: (row.closed_at as string | null) ?? null,
    finalized_at: (row.finalized_at as string | null) ?? null,
    started_by_user_id: (row.started_by_user_id as string | null) ?? null,
    submitted_by_user_id: (row.submitted_by_user_id as string | null) ?? null,
    manager_approved_by_user_id:
      (row.manager_approved_by_user_id as string | null) ?? null,
    finalized_by_user_id: (row.finalized_by_user_id as string | null) ?? null,
    manager_invoice_notes: (row.manager_invoice_notes as string | null) ?? null,
    manager_rejection_notes:
      (row.manager_rejection_notes as string | null) ?? null,
    manager_rejected_at: (row.manager_rejected_at as string | null) ?? null,
    manager_rejected_by_user_id:
      (row.manager_rejected_by_user_id as string | null) ?? null,
    developer_resubmission_notes:
      (row.developer_resubmission_notes as string | null) ?? null,
    resubmitted_at: (row.resubmitted_at as string | null) ?? null,
    resubmitted_by_user_id:
      (row.resubmitted_by_user_id as string | null) ?? null,
    jira_changed_after_finalized: Boolean(row.jira_changed_after_finalized),
    jira_changed_after_finalized_at:
      (row.jira_changed_after_finalized_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapItem(row: Record<string, unknown>): MonthlyClosingItem {
  return {
    id: String(row.id),
    monthly_closing_id: String(row.monthly_closing_id),
    jira_card_id: (row.jira_card_id as string | null) ?? null,
    jira_key: String(row.jira_key),
    summary: (row.summary as string | null) ?? null,
    status_name: (row.status_name as string | null) ?? null,
    estimate_hours:
      row.estimate_hours == null ? null : Number(row.estimate_hours),
    actual_hours: row.actual_hours == null ? null : Number(row.actual_hours),
    delay_days: row.delay_days == null ? null : Number(row.delay_days),
    is_delayed: Boolean(row.is_delayed),
    is_rework: Boolean(row.is_rework),
    rework_weight: Number(row.rework_weight ?? 0),
    due_on: (row.due_on as string | null) ?? null,
    unit_test_delivery_on: (row.unit_test_delivery_on as string | null) ?? null,
    delay_justification_status:
      (row.delay_justification_status as MonthlyClosingItem["delay_justification_status"]) ??
      null,
    delay_developer_note: (row.delay_developer_note as string | null) ?? null,
    delay_manager_note: (row.delay_manager_note as string | null) ?? null,
    rework_justification_status:
      (row.rework_justification_status as MonthlyClosingItem["rework_justification_status"]) ??
      null,
    rework_developer_note: (row.rework_developer_note as string | null) ?? null,
    rework_manager_note: (row.rework_manager_note as string | null) ?? null,
    included_in_closing: row.included_in_closing !== false,
    snapshot_payload_json:
      (row.snapshot_payload_json as Record<string, unknown> | null) ?? null,
    created_at: String(row.created_at),
  };
}

function mapEvent(row: Record<string, unknown>): MonthlyClosingEvent {
  return {
    id: String(row.id),
    monthly_closing_id: String(row.monthly_closing_id),
    event_type: String(row.event_type),
    from_status: (row.from_status as MonthlyClosingStatus | null) ?? null,
    to_status: (row.to_status as MonthlyClosingStatus | null) ?? null,
    actor_user_id: (row.actor_user_id as string | null) ?? null,
    payload_json: (row.payload_json as Record<string, unknown> | null) ?? null,
    created_at: String(row.created_at),
  };
}

async function appendEvent(input: {
  closingId: string;
  eventType: MonthlyClosingEventType;
  fromStatus?: MonthlyClosingStatus | null;
  toStatus?: MonthlyClosingStatus | null;
  actorUserId: string | null;
  payload?: Record<string, unknown> | null;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("monthly_closing_events").insert({
    monthly_closing_id: input.closingId,
    event_type: input.eventType,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    actor_user_id: input.actorUserId,
    payload_json: input.payload ?? null,
  });
  if (error) {
    throw new Error(`Falha ao registrar evento do fechamento: ${error.message}`);
  }
}

export async function getMonthlyClosingForDeveloperMonth(input: {
  developerId: string;
  yearMonth: string;
}): Promise<MonthlyClosing | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monthly_closings")
    .select("*")
    .eq("developer_id", input.developerId)
    .eq("year_month", input.yearMonth)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao carregar fechamento mensal: ${error.message}`);
  }
  return data ? mapClosing(data as Record<string, unknown>) : null;
}

export async function listMonthlyClosingsForDeveloperYear(input: {
  developerId: string;
  year: number;
}): Promise<MonthlyClosing[]> {
  const yearPrefix = `${input.year}-`;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monthly_closings")
    .select("*")
    .eq("developer_id", input.developerId)
    .like("year_month", `${yearPrefix}%`)
    .order("year_month", { ascending: true });

  if (error) {
    throw new Error(`Falha ao listar fechamentos do ano: ${error.message}`);
  }

  return (data ?? []).map((row) => mapClosing(row as Record<string, unknown>));
}

/** All monthly closings in a calendar year for the gestor status matrix. */
export async function listMonthlyClosingsForGestorYear(input: {
  year: number;
  teamId?: string | null;
}): Promise<MonthlyClosing[]> {
  const yearPrefix = `${input.year}-`;
  const supabase = await createClient();
  let query = supabase
    .from("monthly_closings")
    .select("*")
    .like("year_month", `${yearPrefix}%`)
    .order("year_month", { ascending: true });

  if (input.teamId) {
    query = query.eq("team_id", input.teamId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(
      `Falha ao listar fechamentos do ano (gestor): ${error.message}`,
    );
  }

  return (data ?? []).map((row) => mapClosing(row as Record<string, unknown>));
}

export async function listMonthlyClosingsInReview(input?: {
  teamId?: string | null;
  yearMonth?: string | null;
}): Promise<
  Array<
    MonthlyClosing & {
      developer_name: string;
      team_name: string | null;
      item_count: number;
    }
  >
> {
  return listMonthlyClosingsForGestorQueue({
    ...input,
    statuses: ["in_review", "closed"],
  });
}

export async function listFinalizedClosingsWithJiraDrift(input?: {
  teamId?: string | null;
  yearMonth?: string | null;
}): Promise<
  Array<
    MonthlyClosing & {
      developer_name: string;
      team_name: string | null;
      item_count: number;
    }
  >
> {
  const rows = await listMonthlyClosingsForGestorQueue({
    ...input,
    statuses: ["finalized"],
  });
  return rows.filter((row) => row.jira_changed_after_finalized);
}

async function listMonthlyClosingsForGestorQueue(input: {
  teamId?: string | null;
  yearMonth?: string | null;
  statuses: MonthlyClosingStatus[];
}): Promise<
  Array<
    MonthlyClosing & {
      developer_name: string;
      team_name: string | null;
      item_count: number;
    }
  >
> {
  const supabase = await createClient();
  let query = supabase
    .from("monthly_closings")
    .select("*")
    .in("status", input.statuses)
    .order("submitted_at", { ascending: false });

  if (input.teamId) {
    query = query.eq("team_id", input.teamId);
  }
  if (input.yearMonth) {
    query = query.eq("year_month", input.yearMonth);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao listar fechamentos: ${error.message}`);
  }

  const closings = (data ?? []).map((row) =>
    mapClosing(row as Record<string, unknown>),
  );
  if (closings.length === 0) {
    return [];
  }

  const closingIds = closings.map((row) => row.id);
  const developerIds = [...new Set(closings.map((row) => row.developer_id))];
  const teamIds = [
    ...new Set(
      closings
        .map((row) => row.team_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [{ data: items }, { data: developers }, { data: teams }] =
    await Promise.all([
      supabase
        .from("monthly_closing_items")
        .select("monthly_closing_id")
        .in("monthly_closing_id", closingIds),
      supabase
        .from("developers")
        .select("id, full_name")
        .in("id", developerIds),
      teamIds.length > 0
        ? supabase.from("teams").select("id, name").in("id", teamIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);

  const countByClosing = new Map<string, number>();
  for (const item of items ?? []) {
    const id = String(item.monthly_closing_id);
    countByClosing.set(id, (countByClosing.get(id) ?? 0) + 1);
  }
  const nameByDeveloper = new Map(
    (developers ?? []).map((row) => [String(row.id), String(row.full_name)]),
  );
  const nameByTeam = new Map(
    (teams ?? []).map((row) => [String(row.id), String(row.name)]),
  );

  return closings.map((closing) => ({
    ...closing,
    developer_name: nameByDeveloper.get(closing.developer_id) ?? "Developer",
    team_name: closing.team_id
      ? (nameByTeam.get(closing.team_id) ?? null)
      : null,
    item_count: countByClosing.get(closing.id) ?? 0,
  }));
}

export async function getMonthlyClosingById(
  closingId: string,
): Promise<MonthlyClosing | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monthly_closings")
    .select("*")
    .eq("id", closingId)
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao carregar fechamento: ${error.message}`);
  }
  return data ? mapClosing(data as Record<string, unknown>) : null;
}

export async function listMonthlyClosingItems(
  closingId: string,
): Promise<MonthlyClosingItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monthly_closing_items")
    .select("*")
    .eq("monthly_closing_id", closingId)
    .order("jira_key", { ascending: true });
  if (error) {
    throw new Error(`Falha ao listar itens do fechamento: ${error.message}`);
  }
  return (data ?? []).map((row) => mapItem(row as Record<string, unknown>));
}

export async function listMonthlyClosingEvents(
  closingId: string,
): Promise<MonthlyClosingEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monthly_closing_events")
    .select("*")
    .eq("monthly_closing_id", closingId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`Falha ao listar eventos do fechamento: ${error.message}`);
  }
  return (data ?? []).map((row) => mapEvent(row as Record<string, unknown>));
}

function justificationSnapshot(
  row: DelayJustificationRequest | undefined,
): MonthlyClosingJustificationSnapshot {
  if (!row) {
    return { status: null, developerNote: null, managerNote: null };
  }
  return {
    status: row.status,
    developerNote: row.developer_note,
    managerNote: row.reviewer_note,
  };
}

function isDecided(
  status: MonthlyClosingJustificationSnapshot["status"],
): boolean {
  return status === "accepted" || status === "rejected";
}

export function buildMonthlyClosingAuditRows(input: {
  cards: JiraCard[];
  justifications: DelayJustificationRequest[];
}): MonthlyClosingCardAuditRow[] {
  const delayByKey = new Map<string, DelayJustificationRequest>();
  const reworkByKey = new Map<string, DelayJustificationRequest>();
  for (const row of input.justifications) {
    const key = row.jira_key.trim().toUpperCase();
    if (row.kind === "rework") {
      reworkByKey.set(key, row);
    } else {
      delayByKey.set(key, row);
    }
  }

  return input.cards.map((card) => {
    const flags = getCardDeliveryFlags(card);
    const key = card.jira_key.trim().toUpperCase();
    const delayJustification = justificationSnapshot(delayByKey.get(key));
    const reworkJustification = justificationSnapshot(reworkByKey.get(key));
    const blockReasons: string[] = [];

    if (flags.isDelayed === true && !isDecided(delayJustification.status)) {
      blockReasons.push(
        delayJustification.status === "pending"
          ? "Justificativa de atraso pendente de decisão do gestor"
          : "Justificativa de atraso ausente (precisa ser enviada e decidida)",
      );
    }
    if (flags.isRework && !isDecided(reworkJustification.status)) {
      blockReasons.push(
        reworkJustification.status === "pending"
          ? "Justificativa de retrabalho pendente de decisão do gestor"
          : "Justificativa de retrabalho ausente (precisa ser enviada e decidida)",
      );
    }

    return {
      cardId: card.id,
      jiraKey: card.jira_key,
      summary: card.summary,
      status: card.status,
      estimateHours: card.estimate_hours,
      actualHours: card.time_spent_hours,
      delayDays: card.delay_days,
      isDelayed: flags.isDelayed === true,
      isRework: flags.isRework,
      reworkWeight: card.rework_weight,
      dueOn: card.due_on,
      unitTestDeliveryOn: card.unit_test_delivery_on,
      delayJustification,
      reworkJustification,
      blocksSubmit: blockReasons.length > 0,
      blockReasons,
    };
  });
}

export async function loadMonthlyClosingAuditForDeveloper(input: {
  developerId: string;
  importId: string;
  yearMonth: string;
}): Promise<{
  cards: JiraCard[];
  justifications: DelayJustificationRequest[];
  auditRows: MonthlyClosingCardAuditRow[];
  canSubmit: boolean;
  blockingCount: number;
}> {
  const periodStart = startOfMonth(input.yearMonth);
  const periodEnd = endOfMonth(input.yearMonth);
  const [cards, justifications] = await Promise.all([
    listJiraCardsByDeveloperAndImport({
      developerId: input.developerId,
      importId: input.importId,
      rangeStart: periodStart,
      rangeEnd: periodEnd,
    }),
    listDelayJustificationsForDeveloperImport({
      importId: input.importId,
      developerId: input.developerId,
      kind: "all",
    }),
  ]);

  const auditRows = buildMonthlyClosingAuditRows({ cards, justifications });
  const blockingCount = auditRows.filter((row) => row.blocksSubmit).length;
  return {
    cards,
    justifications,
    auditRows,
    canSubmit: auditRows.length > 0 && blockingCount === 0,
    blockingCount,
  };
}

export async function startMonthlyClosing(input: {
  developerId: string;
  teamId: string | null;
  yearMonth: string;
  importId: string | null;
  sourceMode: string | null;
  actorUserId: string;
}): Promise<MonthlyClosing> {
  if (!/^\d{4}-\d{2}$/.test(input.yearMonth)) {
    throw new Error("Mês inválido. Use o formato YYYY-MM.");
  }

  const existing = await getMonthlyClosingForDeveloperMonth({
    developerId: input.developerId,
    yearMonth: input.yearMonth,
  });
  if (existing) {
    if (existing.status !== "open") {
      throw new Error(
        "Este mês já está em fechamento ou concluído e não pode ser reiniciado.",
      );
    }
    return existing;
  }

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("monthly_closings")
    .insert({
      developer_id: input.developerId,
      team_id: input.teamId,
      year_month: input.yearMonth,
      status: "open",
      period_start: startOfMonth(input.yearMonth),
      period_end: endOfMonth(input.yearMonth),
      source_mode: input.sourceMode,
      import_id: input.importId,
      started_at: now,
      started_by_user_id: input.actorUserId,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao iniciar fechamento: ${error.message}`);
  }

  const closing = mapClosing(data as Record<string, unknown>);
  await appendEvent({
    closingId: closing.id,
    eventType: "closing_started",
    fromStatus: null,
    toStatus: "open",
    actorUserId: input.actorUserId,
    payload: {
      yearMonth: input.yearMonth,
      importId: input.importId,
    },
  });
  return closing;
}

export async function submitMonthlyClosingForReview(input: {
  closingId: string;
  developerId: string;
  importId: string;
  sourceMode: string | null;
  actorUserId: string;
  /** Required when resubmitting from rejected. */
  developerResubmissionNotes?: string | null;
}): Promise<MonthlyClosing> {
  const closing = await getMonthlyClosingById(input.closingId);
  if (!closing) {
    throw new Error("Fechamento não encontrado.");
  }
  if (closing.developer_id !== input.developerId) {
    throw new Error("Você só pode enviar o próprio fechamento.");
  }
  if (closing.status !== "open" && closing.status !== "rejected") {
    throw new Error(
      "Só é possível enviar fechamentos Abertos ou com ajuste necessário.",
    );
  }
  assertEditableClosing(closing);

  const isResubmit = closing.status === "rejected";
  const resubmissionNotes = (input.developerResubmissionNotes ?? "").trim();
  if (isResubmit && !resubmissionNotes) {
    throw new Error(
      "Informe a resposta/justificativa ao reenviar o fechamento.",
    );
  }

  const audit = await loadMonthlyClosingAuditForDeveloper({
    developerId: input.developerId,
    importId: input.importId,
    yearMonth: closing.year_month,
  });

  if (audit.auditRows.length === 0) {
    throw new Error(
      "Não há cards entregues neste mês para incluir no fechamento.",
    );
  }
  if (!audit.canSubmit) {
    throw new Error(
      `Ainda há ${audit.blockingCount} card(s) com justificativa pendente ou ausente.`,
    );
  }

  const supabase = await createClient();
  const now = new Date().toISOString();
  const fromStatus = closing.status;

  const { error: deleteError } = await supabase
    .from("monthly_closing_items")
    .delete()
    .eq("monthly_closing_id", closing.id);
  if (deleteError) {
    throw new Error(
      `Falha ao limpar snapshot anterior: ${deleteError.message}`,
    );
  }

  const itemRows = audit.auditRows.map((row) => ({
    monthly_closing_id: closing.id,
    jira_card_id: row.cardId,
    jira_key: row.jiraKey.trim().toUpperCase(),
    summary: row.summary,
    status_name: row.status,
    estimate_hours: row.estimateHours,
    actual_hours: row.actualHours,
    delay_days: row.delayDays,
    is_delayed: row.isDelayed,
    is_rework: row.isRework,
    rework_weight: row.reworkWeight,
    due_on: row.dueOn,
    unit_test_delivery_on: row.unitTestDeliveryOn,
    delay_justification_status: row.delayJustification.status,
    delay_developer_note: row.delayJustification.developerNote,
    delay_manager_note: row.delayJustification.managerNote,
    rework_justification_status: row.reworkJustification.status,
    rework_developer_note: row.reworkJustification.developerNote,
    rework_manager_note: row.reworkJustification.managerNote,
    included_in_closing: true,
    snapshot_payload_json: {
      cardId: row.cardId,
      jiraKey: row.jiraKey,
      isDelayed: row.isDelayed,
      isRework: row.isRework,
      delayJustification: row.delayJustification,
      reworkJustification: row.reworkJustification,
    },
  }));

  const { error: insertItemsError } = await supabase
    .from("monthly_closing_items")
    .insert(itemRows);
  if (insertItemsError) {
    throw new Error(
      `Falha ao gerar snapshot do fechamento: ${insertItemsError.message}`,
    );
  }

  await appendEvent({
    closingId: closing.id,
    eventType: "snapshot_generated",
    fromStatus,
    toStatus: fromStatus,
    actorUserId: input.actorUserId,
    payload: {
      itemCount: itemRows.length,
      importId: input.importId,
      resubmit: isResubmit,
    },
  });

  const updatePayload: Record<string, unknown> = {
    status: "in_review",
    import_id: input.importId,
    source_mode: input.sourceMode,
    snapshot_generated_at: now,
    submitted_at: now,
    submitted_by_user_id: input.actorUserId,
  };

  if (isResubmit) {
    updatePayload.developer_resubmission_notes = resubmissionNotes;
    updatePayload.resubmitted_at = now;
    updatePayload.resubmitted_by_user_id = input.actorUserId;
  }

  const { data, error } = await supabase
    .from("monthly_closings")
    .update(updatePayload)
    .eq("id", closing.id)
    .eq("status", fromStatus)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao enviar fechamento para revisão: ${error.message}`);
  }

  const updated = mapClosing(data as Record<string, unknown>);
  await appendEvent({
    closingId: closing.id,
    eventType: isResubmit ? "developer_resubmitted" : "submitted_for_review",
    fromStatus,
    toStatus: "in_review",
    actorUserId: input.actorUserId,
    payload: {
      itemCount: itemRows.length,
      hasResubmissionNotes: isResubmit,
    },
  });

  return updated;
}

export async function rejectMonthlyClosing(input: {
  closingId: string;
  managerRejectionNotes: string;
  actorUserId: string;
}): Promise<MonthlyClosing> {
  const notes = input.managerRejectionNotes.trim();
  if (!notes) {
    throw new Error(
      "A observação da reprovação é obrigatória (descreva a inconsistência).",
    );
  }

  const closing = await getMonthlyClosingById(input.closingId);
  if (!closing) {
    throw new Error("Fechamento não encontrado.");
  }
  if (closing.status !== "in_review") {
    throw new Error("Só é possível reprovar fechamentos em revisão.");
  }
  assertEditableClosing(closing);

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("monthly_closings")
    .update({
      status: "rejected",
      manager_rejection_notes: notes,
      manager_rejected_at: now,
      manager_rejected_by_user_id: input.actorUserId,
    })
    .eq("id", closing.id)
    .eq("status", "in_review")
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao reprovar fechamento: ${error.message}`);
  }

  const updated = mapClosing(data as Record<string, unknown>);
  await appendEvent({
    closingId: closing.id,
    eventType: "manager_rejected",
    fromStatus: "in_review",
    toStatus: "rejected",
    actorUserId: input.actorUserId,
    payload: { noteLength: notes.length },
  });

  return updated;
}

export async function listMonthlyClosingAttachments(
  closingId: string,
): Promise<MonthlyClosingAttachment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monthly_closing_attachments")
    .select("*")
    .eq("monthly_closing_id", closingId)
    .order("type", { ascending: true });
  if (error) {
    throw new Error(`Falha ao listar anexos: ${error.message}`);
  }
  return (data ?? []).map((row) => mapAttachment(row as Record<string, unknown>));
}

export async function approveMonthlyClosing(input: {
  closingId: string;
  managerInvoiceNotes: string;
  actorUserId: string;
}): Promise<MonthlyClosing> {
  const notes = input.managerInvoiceNotes.trim();
  if (!notes) {
    throw new Error(
      "Informações para emissão de nota fiscal são obrigatórias na aprovação.",
    );
  }

  const closing = await getMonthlyClosingById(input.closingId);
  if (!closing) {
    throw new Error("Fechamento não encontrado.");
  }
  if (closing.status !== "in_review") {
    throw new Error("Só é possível aprovar fechamentos em revisão.");
  }
  assertEditableClosing(closing);

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("monthly_closings")
    .update({
      status: "closed",
      manager_invoice_notes: notes,
      manager_approved_at: now,
      manager_approved_by_user_id: input.actorUserId,
      closed_at: now,
    })
    .eq("id", closing.id)
    .eq("status", "in_review")
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao aprovar fechamento: ${error.message}`);
  }

  const updated = mapClosing(data as Record<string, unknown>);
  await appendEvent({
    closingId: closing.id,
    eventType: "manager_approved",
    fromStatus: "in_review",
    toStatus: "closed",
    actorUserId: input.actorUserId,
    payload: { hasInvoiceNotes: true },
  });
  await appendEvent({
    closingId: closing.id,
    eventType: "invoice_note_updated",
    fromStatus: "closed",
    toStatus: "closed",
    actorUserId: input.actorUserId,
    payload: { noteLength: notes.length },
  });

  return updated;
}

export async function uploadMonthlyClosingAttachment(input: {
  closingId: string;
  developerId: string;
  type: MonthlyClosingAttachmentType;
  file: {
    bytes: Buffer;
    originalFilename: string;
    mimeType: string;
  };
  actorUserId: string;
}): Promise<MonthlyClosingAttachment> {
  const closing = await getMonthlyClosingById(input.closingId);
  if (!closing) {
    throw new Error("Fechamento não encontrado.");
  }
  if (closing.developer_id !== input.developerId) {
    throw new Error("Você só pode anexar arquivos no próprio fechamento.");
  }
  if (closing.status !== "closed") {
    throw new Error(
      "Anexos só podem ser enviados quando o fechamento está Fechado.",
    );
  }
  assertEditableClosing(closing);

  const mime = input.file.mimeType.trim().toLowerCase();
  if (mime !== "application/pdf") {
    throw new Error("Apenas arquivos PDF são aceitos.");
  }
  if (!input.file.originalFilename.toLowerCase().endsWith(".pdf")) {
    throw new Error("O arquivo deve ter extensão .pdf.");
  }
  if (input.file.bytes.byteLength === 0) {
    throw new Error("Arquivo vazio.");
  }
  if (input.file.bytes.byteLength > 10 * 1024 * 1024) {
    throw new Error("Arquivo excede o limite de 10 MB.");
  }

  const storageKey = `${closing.id}/${input.type}.pdf`;
  const supabase = await createClient();

  const { error: uploadError } = await supabase.storage
    .from(MONTHLY_CLOSING_STORAGE_BUCKET)
    .upload(storageKey, input.file.bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadError) {
    throw new Error(`Falha no upload do PDF: ${uploadError.message}`);
  }

  const existing = await listMonthlyClosingAttachments(closing.id);
  const current = existing.find((row) => row.type === input.type) ?? null;
  const now = new Date().toISOString();

  let saved: MonthlyClosingAttachment;
  if (current) {
    const { data, error } = await supabase
      .from("monthly_closing_attachments")
      .update({
        file_storage_key: storageKey,
        original_filename: input.file.originalFilename,
        mime_type: "application/pdf",
        uploaded_at: now,
        uploaded_by_user_id: input.actorUserId,
        is_valid: null,
        validated_at: null,
        validated_by_user_id: null,
      })
      .eq("id", current.id)
      .select("*")
      .single();
    if (error) {
      throw new Error(`Falha ao atualizar anexo: ${error.message}`);
    }
    saved = mapAttachment(data as Record<string, unknown>);
  } else {
    const { data, error } = await supabase
      .from("monthly_closing_attachments")
      .insert({
        monthly_closing_id: closing.id,
        type: input.type,
        file_storage_key: storageKey,
        original_filename: input.file.originalFilename,
        mime_type: "application/pdf",
        uploaded_at: now,
        uploaded_by_user_id: input.actorUserId,
      })
      .select("*")
      .single();
    if (error) {
      throw new Error(`Falha ao registrar anexo: ${error.message}`);
    }
    saved = mapAttachment(data as Record<string, unknown>);
  }

  await appendEvent({
    closingId: closing.id,
    eventType:
      input.type === "invoice_pdf" ? "invoice_uploaded" : "boleto_uploaded",
    fromStatus: "closed",
    toStatus: "closed",
    actorUserId: input.actorUserId,
    payload: {
      type: input.type,
      filename: input.file.originalFilename,
      bytes: input.file.bytes.byteLength,
    },
  });

  return saved;
}

export async function createMonthlyClosingAttachmentSignedUrl(
  storageKey: string,
  expiresInSeconds = 60 * 10,
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(MONTHLY_CLOSING_STORAGE_BUCKET)
    .createSignedUrl(storageKey, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(
      `Falha ao gerar link do anexo: ${error?.message ?? "URL indisponível"}`,
    );
  }
  return data.signedUrl;
}

export async function finalizeMonthlyClosing(input: {
  closingId: string;
  actorUserId: string;
}): Promise<MonthlyClosing> {
  const closing = await getMonthlyClosingById(input.closingId);
  if (!closing) {
    throw new Error("Fechamento não encontrado.");
  }
  if (closing.status !== "closed") {
    throw new Error("Só é possível finalizar fechamentos Fechados.");
  }
  assertEditableClosing(closing);

  const attachments = await listMonthlyClosingAttachments(closing.id);
  const hasInvoice = attachments.some((row) => row.type === "invoice_pdf");
  const hasBoleto = attachments.some((row) => row.type === "boleto_pdf");
  if (!hasInvoice || !hasBoleto) {
    throw new Error(
      "É necessário ter nota fiscal e boleto enviados antes de finalizar.",
    );
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  const { error: validateError } = await supabase
    .from("monthly_closing_attachments")
    .update({
      is_valid: true,
      validated_at: now,
      validated_by_user_id: input.actorUserId,
    })
    .eq("monthly_closing_id", closing.id);
  if (validateError) {
    throw new Error(
      `Falha ao validar anexos: ${validateError.message}`,
    );
  }

  const { data, error } = await supabase
    .from("monthly_closings")
    .update({
      status: "finalized",
      finalized_at: now,
      finalized_by_user_id: input.actorUserId,
    })
    .eq("id", closing.id)
    .eq("status", "closed")
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao finalizar fechamento: ${error.message}`);
  }

  const updated = mapClosing(data as Record<string, unknown>);
  await appendEvent({
    closingId: closing.id,
    eventType: "finalized",
    fromStatus: "closed",
    toStatus: "finalized",
    actorUserId: input.actorUserId,
    payload: {
      invoiceValidated: true,
      boletoValidated: true,
    },
  });

  return updated;
}

function normalizeCompareNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "";
  }
  return String(Math.round(value * 1000) / 1000);
}

/**
 * After a Jira Compilado materialization, flag finalized closings whose
 * snapshot no longer matches live cards for the same developer + period.
 * Never mutates monthly_closing_items.
 */
export async function detectJiraChangesAfterFinalized(input: {
  importId: string;
  teamId?: string | null;
  actorUserId?: string | null;
}): Promise<{ flaggedClosingIds: string[] }> {
  const supabase = await createClient();
  let query = supabase
    .from("monthly_closings")
    .select("*")
    .eq("status", "finalized");

  if (input.teamId) {
    query = query.eq("team_id", input.teamId);
  }

  const { data: closingRows, error } = await query;
  if (error) {
    throw new Error(
      `Falha ao carregar fechamentos finalizados: ${error.message}`,
    );
  }

  const closings = (closingRows ?? []).map((row) =>
    mapClosing(row as Record<string, unknown>),
  );
  if (closings.length === 0) {
    return { flaggedClosingIds: [] };
  }

  const flaggedClosingIds: string[] = [];

  for (const closing of closings) {
    if (closing.jira_changed_after_finalized) {
      continue;
    }

    const items = await listMonthlyClosingItems(closing.id);
    if (items.length === 0) {
      continue;
    }

    const keys = items.map((item) => item.jira_key);
    const { data: liveCards, error: cardsError } = await supabase
      .from("jira_cards")
      .select(
        "jira_key, summary, status, estimate_hours, time_spent_hours, delay_days, due_on, unit_test_delivery_on, is_rework, rework_weight",
      )
      .eq("import_id", input.importId)
      .eq("developer_id", closing.developer_id)
      .in("jira_key", keys);

    if (cardsError) {
      throw new Error(
        `Falha ao comparar cards do fechamento: ${cardsError.message}`,
      );
    }

    const liveByKey = new Map(
      (liveCards ?? []).map((card) => [
        String(card.jira_key).trim().toUpperCase(),
        card,
      ]),
    );

    const changedKeys: string[] = [];
    for (const item of items) {
      const live = liveByKey.get(item.jira_key.trim().toUpperCase());
      if (!live) {
        changedKeys.push(item.jira_key);
        continue;
      }
      const differs =
        (live.summary ?? null) !== (item.summary ?? null) ||
        (live.status ?? null) !== (item.status_name ?? null) ||
        normalizeCompareNumber(
          live.estimate_hours == null ? null : Number(live.estimate_hours),
        ) !== normalizeCompareNumber(item.estimate_hours) ||
        normalizeCompareNumber(
          live.time_spent_hours == null ? null : Number(live.time_spent_hours),
        ) !== normalizeCompareNumber(item.actual_hours) ||
        normalizeCompareNumber(
          live.delay_days == null ? null : Number(live.delay_days),
        ) !== normalizeCompareNumber(item.delay_days) ||
        (live.due_on ?? null) !== (item.due_on ?? null) ||
        (live.unit_test_delivery_on ?? null) !==
          (item.unit_test_delivery_on ?? null) ||
        Boolean(live.is_rework) !== item.is_rework ||
        normalizeCompareNumber(
          live.rework_weight == null ? null : Number(live.rework_weight),
        ) !== normalizeCompareNumber(item.rework_weight);

      if (differs) {
        changedKeys.push(item.jira_key);
      }
    }

    if (changedKeys.length === 0) {
      continue;
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("monthly_closings")
      .update({
        jira_changed_after_finalized: true,
        jira_changed_after_finalized_at: now,
      })
      .eq("id", closing.id)
      .eq("status", "finalized")
      .eq("jira_changed_after_finalized", false);

    if (updateError) {
      throw new Error(
        `Falha ao sinalizar drift do Jira: ${updateError.message}`,
      );
    }

    await appendEvent({
      closingId: closing.id,
      eventType: "jira_changed_after_finalized_detected",
      fromStatus: "finalized",
      toStatus: "finalized",
      actorUserId: input.actorUserId ?? null,
      payload: {
        importId: input.importId,
        changedKeys: changedKeys.slice(0, 50),
        changedCount: changedKeys.length,
      },
    });

    flaggedClosingIds.push(closing.id);
  }

  return { flaggedClosingIds };
}
