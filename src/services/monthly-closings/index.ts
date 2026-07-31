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
  MonthlyClosingCardAuditRow,
  MonthlyClosingEvent,
  MonthlyClosingEventType,
  MonthlyClosingItem,
  MonthlyClosingJustificationSnapshot,
  MonthlyClosingStatus,
} from "@/types/monthly-closing";

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
  const supabase = await createClient();
  let query = supabase
    .from("monthly_closings")
    .select("*")
    .eq("status", "in_review")
    .order("submitted_at", { ascending: false });

  if (input?.teamId) {
    query = query.eq("team_id", input.teamId);
  }
  if (input?.yearMonth) {
    query = query.eq("year_month", input.yearMonth);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao listar fechamentos em revisão: ${error.message}`);
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
}): Promise<MonthlyClosing> {
  const closing = await getMonthlyClosingById(input.closingId);
  if (!closing) {
    throw new Error("Fechamento não encontrado.");
  }
  if (closing.developer_id !== input.developerId) {
    throw new Error("Você só pode enviar o próprio fechamento.");
  }
  if (closing.status !== "open") {
    throw new Error("Só é possível enviar fechamentos com status Aberto.");
  }
  if (closing.finalized_at) {
    throw new Error("Fechamento finalizado não pode ser reenviado.");
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
    fromStatus: "open",
    toStatus: "open",
    actorUserId: input.actorUserId,
    payload: { itemCount: itemRows.length, importId: input.importId },
  });

  const { data, error } = await supabase
    .from("monthly_closings")
    .update({
      status: "in_review",
      import_id: input.importId,
      source_mode: input.sourceMode,
      snapshot_generated_at: now,
      submitted_at: now,
      submitted_by_user_id: input.actorUserId,
    })
    .eq("id", closing.id)
    .eq("status", "open")
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao enviar fechamento para revisão: ${error.message}`);
  }

  const updated = mapClosing(data as Record<string, unknown>);
  await appendEvent({
    closingId: closing.id,
    eventType: "submitted_for_review",
    fromStatus: "open",
    toStatus: "in_review",
    actorUserId: input.actorUserId,
    payload: { itemCount: itemRows.length },
  });

  return updated;
}
