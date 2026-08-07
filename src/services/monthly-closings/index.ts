import "server-only";

import {
  endOfMonth,
  formatYearMonthLabel,
  startOfMonth,
} from "@/lib/metrics/date-range";
import { computeClosingSubmitValues } from "@/lib/metrics/closing-submit-values";
import { getCardDeliveryFlags } from "@/lib/metrics/developer-period";
import { createClient } from "@/lib/supabase/server";
import { getCurrentDeveloperCompensation } from "@/services/developers/compensation";
import { listDelayJustificationsForDeveloperImport } from "@/services/delay-justifications";
import { listJiraCardsByDeveloperAndImport } from "@/services/jira-cards";
import type { DelayJustificationRequest } from "@/types/delay-justification";
import type { JiraCard } from "@/types/jira-card";
import type {
  MonthlyClosing,
  MonthlyClosingAttachment,
  MonthlyClosingAttachmentPresence,
  MonthlyClosingAttachmentType,
  MonthlyClosingCardAuditRow,
  MonthlyClosingEvent,
  MonthlyClosingEventType,
  MonthlyClosingItem,
  MonthlyClosingJustificationSnapshot,
  MonthlyClosingPresenceDay,
  MonthlyClosingPresenceKind,
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
    review_notes: (row.review_notes as string | null) ?? null,
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

const MEAL_PIX_BLOCK_MESSAGE =
  "Há comprovante PIX de refeição pendente de envio ou aceite do gestor. Envie o comprovante e aguarde a aceitação antes de efetuar um novo fechamento.";

/**
 * When compensation requires meal PIX receipts, every finalized closing with
 * meal days must have an accepted meal_pix_receipt before new closings.
 */
export async function getMealPixClosingBlockReason(
  developerId: string,
): Promise<string | null> {
  const compensation = await getCurrentDeveloperCompensation(developerId);
  if (!compensation?.require_meal_pix_receipt) {
    return null;
  }

  const supabase = await createClient();
  const { data: closings, error } = await supabase
    .from("monthly_closings")
    .select("id, year_month, meal_presencial_days")
    .eq("developer_id", developerId)
    .eq("status", "finalized")
    .gt("meal_presencial_days", 0);

  if (error) {
    throw new Error(
      `Falha ao verificar comprovantes PIX: ${error.message}`,
    );
  }
  if (!closings?.length) {
    return null;
  }

  const closingIds = closings.map((row) => String(row.id));
  const { data: pixRows, error: pixError } = await supabase
    .from("monthly_closing_attachments")
    .select("monthly_closing_id, is_valid")
    .in("monthly_closing_id", closingIds)
    .eq("type", "meal_pix_receipt");

  if (pixError) {
    throw new Error(
      `Falha ao verificar comprovantes PIX: ${pixError.message}`,
    );
  }

  const acceptedByClosing = new Map<string, boolean>();
  for (const row of pixRows ?? []) {
    acceptedByClosing.set(
      String(row.monthly_closing_id),
      row.is_valid === true,
    );
  }

  const pending = closings.filter(
    (row) => acceptedByClosing.get(String(row.id)) !== true,
  );
  if (pending.length === 0) {
    return null;
  }

  const months = pending
    .map((row) => formatYearMonthLabel(String(row.year_month)))
    .join(", ");
  return `${MEAL_PIX_BLOCK_MESSAGE} Pendente: ${months}.`;
}

export async function assertNoPendingMealPixBlockingNewClosing(
  developerId: string,
): Promise<void> {
  const reason = await getMealPixClosingBlockReason(developerId);
  if (reason) {
    throw new Error(reason);
  }
}

function attachmentUploadEventType(
  type: MonthlyClosingAttachmentType,
): MonthlyClosingEventType {
  switch (type) {
    case "invoice_pdf":
      return "invoice_uploaded";
    case "boleto_pdf":
      return "boleto_uploaded";
    case "meal_pix_receipt":
      return "meal_pix_uploaded";
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
    invoice_issuer_id: (row.invoice_issuer_id as string | null) ?? null,
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
    travel_presencial_days:
      row.travel_presencial_days == null
        ? null
        : Number(row.travel_presencial_days),
    meal_presencial_days:
      row.meal_presencial_days == null
        ? null
        : Number(row.meal_presencial_days),
    travel_amount:
      row.travel_amount == null ? null : Number(row.travel_amount),
    meal_amount: row.meal_amount == null ? null : Number(row.meal_amount),
    differential_amount:
      row.differential_amount == null
        ? null
        : Number(row.differential_amount),
    invoice_amount:
      row.invoice_amount == null ? null : Number(row.invoice_amount),
    compensation_base_amount:
      row.compensation_base_amount == null
        ? null
        : Number(row.compensation_base_amount),
    compensation_base_type:
      row.compensation_base_type === "variable" ||
      row.compensation_base_type === "fixed"
        ? row.compensation_base_type
        : null,
    compensation_hourly_rate:
      row.compensation_hourly_rate == null
        ? null
        : Number(row.compensation_hourly_rate),
    compensation_daily_travel_amount:
      row.compensation_daily_travel_amount == null
        ? null
        : Number(row.compensation_daily_travel_amount),
    compensation_daily_meal_amount:
      row.compensation_daily_meal_amount == null
        ? null
        : Number(row.compensation_daily_meal_amount),
    worked_hours_snapshot:
      row.worked_hours_snapshot == null
        ? null
        : Number(row.worked_hours_snapshot),
    developer_values_notes:
      (row.developer_values_notes as string | null) ?? null,
    values_submitted_at: (row.values_submitted_at as string | null) ?? null,
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
    /** Empty month (0 cards) is allowed — only pending justifications block. */
    canSubmit: blockingCount === 0,
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

  await assertNoPendingMealPixBlockingNewClosing(input.developerId);

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
  values: {
    travelDays: string[];
    mealDays: string[];
    valuesNotes?: string | null;
    workedHours: number;
    compensation: {
      baseAmount: number;
      baseType: "fixed" | "variable";
      hourlyRate: number | null;
      dailyTravelAmount: number;
      dailyMealAmount: number;
    };
  };
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
  await assertNoPendingMealPixBlockingNewClosing(input.developerId);

  const isResubmit = closing.status === "rejected";
  const resubmissionNotes = (input.developerResubmissionNotes ?? "").trim();
  if (isResubmit && !resubmissionNotes) {
    throw new Error(
      "Informe a resposta/justificativa ao reenviar o fechamento.",
    );
  }

  const computed = computeClosingSubmitValues({
    baseType: input.values.compensation.baseType,
    baseAmount: input.values.compensation.baseAmount,
    hourlyRate: input.values.compensation.hourlyRate,
    dailyTravelAmount: input.values.compensation.dailyTravelAmount,
    dailyMealAmount: input.values.compensation.dailyMealAmount,
    workedHours: input.values.workedHours,
    travelDays: input.values.travelDays,
    mealDays: input.values.mealDays,
  });

  const audit = await loadMonthlyClosingAuditForDeveloper({
    developerId: input.developerId,
    importId: input.importId,
    yearMonth: closing.year_month,
  });

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

  const { error: deletePresenceError } = await supabase
    .from("monthly_closing_presence_days")
    .delete()
    .eq("monthly_closing_id", closing.id);
  if (deletePresenceError) {
    throw new Error(
      `Falha ao limpar dias de presença anteriores: ${deletePresenceError.message}`,
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

  if (itemRows.length > 0) {
    const { error: insertItemsError } = await supabase
      .from("monthly_closing_items")
      .insert(itemRows);
    if (insertItemsError) {
      throw new Error(
        `Falha ao gerar snapshot do fechamento: ${insertItemsError.message}`,
      );
    }
  }

  const presenceRows: Array<{
    monthly_closing_id: string;
    kind: MonthlyClosingPresenceKind;
    day_on: string;
  }> = [
    ...uniqueSortedDates(input.values.travelDays).map((day_on) => ({
      monthly_closing_id: closing.id,
      kind: "travel" as const,
      day_on,
    })),
    ...uniqueSortedDates(input.values.mealDays).map((day_on) => ({
      monthly_closing_id: closing.id,
      kind: "meal" as const,
      day_on,
    })),
  ];

  if (presenceRows.length > 0) {
    const { error: insertPresenceError } = await supabase
      .from("monthly_closing_presence_days")
      .insert(presenceRows);
    if (insertPresenceError) {
      throw new Error(
        `Falha ao gravar dias de presença: ${insertPresenceError.message}`,
      );
    }
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

  const valuesNotes =
    computed.compensationBaseType === "variable"
      ? (input.values.valuesNotes ?? "").trim() || null
      : null;

  const updatePayload: Record<string, unknown> = {
    status: "in_review",
    import_id: input.importId,
    source_mode: input.sourceMode,
    snapshot_generated_at: now,
    submitted_at: now,
    submitted_by_user_id: input.actorUserId,
    travel_presencial_days: computed.travelPresencialDays,
    meal_presencial_days: computed.mealPresencialDays,
    travel_amount: computed.travelAmount,
    meal_amount: computed.mealAmount,
    differential_amount: computed.differentialAmount,
    invoice_amount: computed.invoiceAmount,
    compensation_base_amount: computed.compensationBaseAmount,
    compensation_base_type: computed.compensationBaseType,
    compensation_hourly_rate: computed.compensationHourlyRate,
    compensation_daily_travel_amount: computed.compensationDailyTravelAmount,
    compensation_daily_meal_amount: computed.compensationDailyMealAmount,
    worked_hours_snapshot: computed.workedHoursSnapshot,
    developer_values_notes: valuesNotes,
    values_submitted_at: now,
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
      travelDays: computed.travelPresencialDays,
      mealDays: computed.mealPresencialDays,
      invoiceAmount: computed.invoiceAmount,
      differentialAmount: computed.differentialAmount,
    },
  });

  return updated;
}

function uniqueSortedDates(values: string[]): string[] {
  const set = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      set.add(trimmed);
    }
  }
  return [...set].sort();
}

export async function listMonthlyClosingPresenceDays(
  closingId: string,
): Promise<MonthlyClosingPresenceDay[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monthly_closing_presence_days")
    .select("*")
    .eq("monthly_closing_id", closingId)
    .order("kind", { ascending: true })
    .order("day_on", { ascending: true });
  if (error) {
    throw new Error(`Falha ao listar dias de presença: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: String(row.id),
    monthly_closing_id: String(row.monthly_closing_id),
    kind: row.kind as MonthlyClosingPresenceKind,
    day_on: String(row.day_on),
    created_at: String(row.created_at),
  }));
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

export type { MonthlyClosingAttachmentPresence };

/** Batch presence of NF/boleto PDFs for the gestor year matrix. */
export async function listMonthlyClosingAttachmentPresence(
  closingIds: string[],
): Promise<Map<string, MonthlyClosingAttachmentPresence>> {
  const result = new Map<string, MonthlyClosingAttachmentPresence>();
  for (const id of closingIds) {
    result.set(id, {
      hasInvoicePdf: false,
      hasBoletoPdf: false,
      hasMealPixReceipt: false,
      mealPixValid: null,
    });
  }
  if (closingIds.length === 0) {
    return result;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monthly_closing_attachments")
    .select("monthly_closing_id, type, is_valid")
    .in("monthly_closing_id", closingIds);

  if (error) {
    throw new Error(`Falha ao listar presença de anexos: ${error.message}`);
  }

  for (const row of data ?? []) {
    const closingId = String(row.monthly_closing_id);
    const entry = result.get(closingId) ?? {
      hasInvoicePdf: false,
      hasBoletoPdf: false,
      hasMealPixReceipt: false,
      mealPixValid: null,
    };
    if (row.type === "invoice_pdf") {
      entry.hasInvoicePdf = true;
    } else if (row.type === "boleto_pdf") {
      entry.hasBoletoPdf = true;
    } else if (row.type === "meal_pix_receipt") {
      entry.hasMealPixReceipt = true;
      entry.mealPixValid =
        row.is_valid == null ? null : Boolean(row.is_valid);
    }
    result.set(closingId, entry);
  }

  return result;
}

/** developerId → closingId for finalized monthly closings in a Folha month. */
export async function mapFinalizedMonthlyClosingIdsByDeveloper(
  yearMonth: string,
): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monthly_closings")
    .select("id, developer_id")
    .eq("year_month", yearMonth)
    .eq("status", "finalized");

  if (error) {
    throw new Error(
      `Falha ao listar fechamentos finalizados: ${error.message}`,
    );
  }

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(String(row.developer_id), String(row.id));
  }
  return map;
}

export async function assertMonthlyClosingNotFinalizedForPayroll(input: {
  developerId: string;
  yearMonth: string;
}): Promise<void> {
  const closing = await getMonthlyClosingForDeveloperMonth(input);
  if (closing?.status === "finalized") {
    throw new Error(
      "Este fechamento mensal já foi finalizado. Reabra o fechamento (volte o status) para editar a Folha.",
    );
  }
}

export async function approveMonthlyClosing(input: {
  closingId: string;
  invoiceIssuerId: string;
  managerInvoiceNotes?: string | null;
  actorUserId: string;
}): Promise<MonthlyClosing> {
  const issuerId = input.invoiceIssuerId.trim();
  if (!issuerId) {
    throw new Error("Selecione a empresa para emissão da nota fiscal.");
  }

  const notes = (input.managerInvoiceNotes ?? "").trim() || null;

  const closing = await getMonthlyClosingById(input.closingId);
  if (!closing) {
    throw new Error("Fechamento não encontrado.");
  }
  if (closing.status !== "in_review") {
    throw new Error("Só é possível aprovar fechamentos em revisão.");
  }
  assertEditableClosing(closing);

  const supabase = await createClient();
  const { data: issuerRow, error: issuerError } = await supabase
    .from("invoice_issuers")
    .select("id")
    .eq("id", issuerId)
    .eq("is_active", true)
    .maybeSingle();
  if (issuerError) {
    throw new Error(`Falha ao validar empresa: ${issuerError.message}`);
  }
  if (!issuerRow) {
    throw new Error("Empresa emissora inválida ou inativa.");
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("monthly_closings")
    .update({
      status: "closed",
      invoice_issuer_id: issuerId,
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
    payload: {
      invoiceIssuerId: issuerId,
      hasInvoiceNotes: Boolean(notes),
    },
  });
  if (notes) {
    await appendEvent({
      closingId: closing.id,
      eventType: "invoice_note_updated",
      fromStatus: "closed",
      toStatus: "closed",
      actorUserId: input.actorUserId,
      payload: { noteLength: notes.length },
    });
  }

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

  const isMealPix = input.type === "meal_pix_receipt";
  if (isMealPix) {
    if (closing.status !== "finalized") {
      throw new Error(
        "Comprovante PIX só pode ser enviado após a finalização do fechamento.",
      );
    }
    if ((closing.meal_presencial_days ?? 0) <= 0) {
      throw new Error(
        "Este fechamento não tem dias de refeição presencial para reembolso.",
      );
    }
    const compensation = await getCurrentDeveloperCompensation(
      input.developerId,
    );
    if (!compensation?.require_meal_pix_receipt) {
      throw new Error(
        "Comprovante PIX de refeição não é exigido para este cadastro.",
      );
    }
    const existingDocs = await listMonthlyClosingAttachments(closing.id);
    const hasInvoice = existingDocs.some((row) => row.type === "invoice_pdf");
    const hasBoleto = existingDocs.some((row) => row.type === "boleto_pdf");
    if (!hasInvoice || !hasBoleto) {
      throw new Error(
        "É necessário ter nota fiscal e boleto anexados antes do comprovante PIX.",
      );
    }
    const currentPix = existingDocs.find(
      (row) => row.type === "meal_pix_receipt",
    );
    if (currentPix?.is_valid === true) {
      throw new Error(
        "Comprovante PIX já foi aceito pelo gestor e não pode ser substituído.",
      );
    }
  } else {
    if (closing.status !== "closed") {
      throw new Error(
        "Anexos só podem ser enviados quando o fechamento está Fechado.",
      );
    }
    assertEditableClosing(closing);
  }

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
        review_notes: null,
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
        is_valid: null,
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
    eventType: attachmentUploadEventType(input.type),
    fromStatus: closing.status,
    toStatus: closing.status,
    actorUserId: input.actorUserId,
    payload: {
      type: input.type,
      filename: input.file.originalFilename,
      bytes: input.file.bytes.byteLength,
    },
  });

  if (isMealPix) {
    const { trySendRhEmailOnMealPixUpload } = await import(
      "@/services/operational-emails"
    );
    await trySendRhEmailOnMealPixUpload({
      closingId: closing.id,
      actorUserId: input.actorUserId,
    });
  }

  return saved;
}

export async function reviewMealPixReceipt(input: {
  closingId: string;
  accepted: boolean;
  reviewNotes?: string | null;
  actorUserId: string;
}): Promise<MonthlyClosingAttachment> {
  const closing = await getMonthlyClosingById(input.closingId);
  if (!closing) {
    throw new Error("Fechamento não encontrado.");
  }
  if (closing.status !== "finalized") {
    throw new Error(
      "Só é possível revisar o comprovante PIX em fechamentos finalizados.",
    );
  }

  const attachments = await listMonthlyClosingAttachments(closing.id);
  const mealPix =
    attachments.find((row) => row.type === "meal_pix_receipt") ?? null;
  if (!mealPix) {
    throw new Error("Comprovante PIX ainda não foi enviado.");
  }

  const notes = (input.reviewNotes ?? "").trim();
  if (!input.accepted && !notes) {
    throw new Error("Informe o motivo da recusa do comprovante PIX.");
  }

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("monthly_closing_attachments")
    .update({
      is_valid: input.accepted,
      validated_at: now,
      validated_by_user_id: input.actorUserId,
      review_notes: notes || null,
    })
    .eq("id", mealPix.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Falha ao revisar comprovante PIX: ${error.message}`,
    );
  }

  const saved = mapAttachment(data as Record<string, unknown>);
  await appendEvent({
    closingId: closing.id,
    eventType: input.accepted ? "meal_pix_accepted" : "meal_pix_rejected",
    fromStatus: "finalized",
    toStatus: "finalized",
    actorUserId: input.actorUserId,
    payload: {
      accepted: input.accepted,
      reviewNotes: notes || null,
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
    .eq("monthly_closing_id", closing.id)
    .in("type", ["invoice_pdf", "boleto_pdf"]);
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

  const { trySendColaboradorEmailOnFinalize } = await import(
    "@/services/operational-emails"
  );
  await trySendColaboradorEmailOnFinalize({
    closingId: closing.id,
    actorUserId: input.actorUserId,
  });

  return updated;
}

/**
 * Admin/gestor one-step status rollback:
 * finalized → closed → in_review → open
 * rejected → open
 */
export async function revertMonthlyClosingStatus(input: {
  closingId: string;
  actorUserId: string;
}): Promise<MonthlyClosing> {
  const closing = await getMonthlyClosingById(input.closingId);
  if (!closing) {
    throw new Error("Fechamento não encontrado.");
  }

  const fromStatus = closing.status;
  const toStatus = (() => {
    switch (fromStatus) {
      case "finalized":
        return "closed" as const;
      case "closed":
        return "in_review" as const;
      case "in_review":
        return "open" as const;
      case "rejected":
        return "open" as const;
      case "open":
        return null;
    }
  })();

  if (!toStatus) {
    throw new Error("Este fechamento já está Aberto — não há status anterior.");
  }

  const supabase = await createClient();
  const updatePayload: Record<string, unknown> = {
    status: toStatus,
  };

  if (fromStatus === "finalized") {
    updatePayload.finalized_at = null;
    updatePayload.finalized_by_user_id = null;
  }

  if (fromStatus === "closed") {
    updatePayload.closed_at = null;
    updatePayload.manager_approved_at = null;
    updatePayload.manager_approved_by_user_id = null;
  }

  if (toStatus === "open") {
    updatePayload.submitted_at = null;
    updatePayload.submitted_by_user_id = null;
    updatePayload.resubmitted_at = null;
    updatePayload.resubmitted_by_user_id = null;
    updatePayload.developer_resubmission_notes = null;
  }

  if (fromStatus === "rejected") {
    updatePayload.manager_rejected_at = null;
    updatePayload.manager_rejected_by_user_id = null;
  }

  const { data, error } = await supabase
    .from("monthly_closings")
    .update(updatePayload)
    .eq("id", closing.id)
    .eq("status", fromStatus)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao reabrir/voltar status: ${error.message}`);
  }

  const updated = mapClosing(data as Record<string, unknown>);

  if (fromStatus === "finalized" && toStatus === "closed") {
    const { error: attachmentError } = await supabase
      .from("monthly_closing_attachments")
      .update({
        is_valid: null,
        validated_at: null,
        validated_by_user_id: null,
      })
      .eq("monthly_closing_id", closing.id);
    if (attachmentError) {
      throw new Error(
        `Fechamento reaberto, mas falhou ao limpar validação dos anexos: ${attachmentError.message}`,
      );
    }
  }

  await appendEvent({
    closingId: closing.id,
    eventType: "status_reverted",
    fromStatus,
    toStatus,
    actorUserId: input.actorUserId,
    payload: {
      action:
        fromStatus === "finalized" ? "reopen_finalized" : "step_back_status",
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
