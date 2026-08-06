export type MonthlyClosingStatus =
  | "open"
  | "in_review"
  | "rejected"
  | "closed"
  | "finalized";

export type MonthlyClosingEventType =
  | "closing_started"
  | "snapshot_generated"
  | "submitted_for_review"
  | "manager_approved"
  | "manager_rejected"
  | "developer_resubmitted"
  | "invoice_note_updated"
  | "invoice_uploaded"
  | "boleto_uploaded"
  | "finalized"
  | "status_reverted"
  | "jira_changed_after_finalized_detected";

export type MonthlyClosing = {
  id: string;
  developer_id: string;
  team_id: string | null;
  year_month: string;
  status: MonthlyClosingStatus;
  period_start: string;
  period_end: string;
  source_mode: string | null;
  import_id: string | null;
  snapshot_generated_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  manager_approved_at: string | null;
  closed_at: string | null;
  finalized_at: string | null;
  started_by_user_id: string | null;
  submitted_by_user_id: string | null;
  manager_approved_by_user_id: string | null;
  finalized_by_user_id: string | null;
  /** Empresa para emissão da NF (cadastro invoice_issuers). */
  invoice_issuer_id: string | null;
  /** Observação opcional do gestor sobre a NF. */
  manager_invoice_notes: string | null;
  manager_rejection_notes: string | null;
  manager_rejected_at: string | null;
  manager_rejected_by_user_id: string | null;
  developer_resubmission_notes: string | null;
  resubmitted_at: string | null;
  resubmitted_by_user_id: string | null;
  /** Presence / NF values declared by developer at submit. */
  travel_presencial_days: number | null;
  meal_presencial_days: number | null;
  travel_amount: number | null;
  meal_amount: number | null;
  differential_amount: number | null;
  invoice_amount: number | null;
  compensation_base_amount: number | null;
  compensation_base_type: "fixed" | "variable" | null;
  compensation_hourly_rate: number | null;
  compensation_daily_travel_amount: number | null;
  compensation_daily_meal_amount: number | null;
  worked_hours_snapshot: number | null;
  developer_values_notes: string | null;
  values_submitted_at: string | null;
  jira_changed_after_finalized: boolean;
  jira_changed_after_finalized_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MonthlyClosingPresenceKind = "travel" | "meal";

export type MonthlyClosingPresenceDay = {
  id: string;
  monthly_closing_id: string;
  kind: MonthlyClosingPresenceKind;
  day_on: string;
  created_at: string;
};

export type MonthlyClosingItem = {
  id: string;
  monthly_closing_id: string;
  jira_card_id: string | null;
  jira_key: string;
  summary: string | null;
  status_name: string | null;
  estimate_hours: number | null;
  actual_hours: number | null;
  delay_days: number | null;
  is_delayed: boolean;
  is_rework: boolean;
  rework_weight: number;
  due_on: string | null;
  unit_test_delivery_on: string | null;
  delay_justification_status: "pending" | "accepted" | "rejected" | null;
  delay_developer_note: string | null;
  delay_manager_note: string | null;
  rework_justification_status: "pending" | "accepted" | "rejected" | null;
  rework_developer_note: string | null;
  rework_manager_note: string | null;
  included_in_closing: boolean;
  snapshot_payload_json: Record<string, unknown> | null;
  created_at: string;
};

export type MonthlyClosingEvent = {
  id: string;
  monthly_closing_id: string;
  event_type: string;
  from_status: MonthlyClosingStatus | null;
  to_status: MonthlyClosingStatus | null;
  actor_user_id: string | null;
  payload_json: Record<string, unknown> | null;
  created_at: string;
};

export type MonthlyClosingJustificationSnapshot = {
  status: "pending" | "accepted" | "rejected" | null;
  developerNote: string | null;
  managerNote: string | null;
};

export type MonthlyClosingCardAuditRow = {
  cardId: string;
  jiraKey: string;
  summary: string | null;
  status: string | null;
  estimateHours: number | null;
  actualHours: number | null;
  delayDays: number | null;
  isDelayed: boolean;
  isRework: boolean;
  reworkWeight: number;
  dueOn: string | null;
  unitTestDeliveryOn: string | null;
  delayJustification: MonthlyClosingJustificationSnapshot;
  reworkJustification: MonthlyClosingJustificationSnapshot;
  /** True when this card blocks submit (needs decided justification). */
  blocksSubmit: boolean;
  blockReasons: string[];
};

export type MonthlyClosingAttachmentType = "invoice_pdf" | "boleto_pdf";

export type MonthlyClosingAttachment = {
  id: string;
  monthly_closing_id: string;
  type: MonthlyClosingAttachmentType;
  file_storage_key: string;
  original_filename: string;
  mime_type: string;
  uploaded_at: string;
  uploaded_by_user_id: string | null;
  is_valid: boolean | null;
  validated_at: string | null;
  validated_by_user_id: string | null;
  created_at: string;
};

/** Lightweight flags for the gestor year matrix (NF / boleto sent). */
export type MonthlyClosingAttachmentPresence = {
  hasInvoicePdf: boolean;
  hasBoletoPdf: boolean;
};

export function monthlyClosingAttachmentTypeLabel(
  type: MonthlyClosingAttachmentType,
): string {
  return type === "invoice_pdf" ? "Nota fiscal" : "Boleto";
}

export function monthlyClosingStatusLabel(
  status: MonthlyClosingStatus,
): string {
  switch (status) {
    case "open":
      return "Aberto";
    case "in_review":
      return "Em fechamento";
    case "rejected":
      return "Ajuste necessário";
    case "closed":
      return "Fechado";
    case "finalized":
      return "Finalizado";
  }
}

/**
 * One-step status rollback for admin/gestor.
 * `null` means no further rollback is available.
 */
export function monthlyClosingRevertTarget(
  status: MonthlyClosingStatus,
): MonthlyClosingStatus | null {
  switch (status) {
    case "finalized":
      return "closed";
    case "closed":
      return "in_review";
    case "in_review":
      return "open";
    case "rejected":
      return "open";
    case "open":
      return null;
  }
}

export function monthlyClosingRevertActionLabel(
  from: MonthlyClosingStatus,
): string | null {
  const target = monthlyClosingRevertTarget(from);
  if (!target) {
    return null;
  }
  if (from === "finalized") {
    return "Reabrir fechamento";
  }
  return `Voltar para ${monthlyClosingStatusLabel(target).toLowerCase()}`;
}

export function monthlyClosingRevertDescription(
  from: MonthlyClosingStatus,
): string | null {
  switch (from) {
    case "finalized":
      return "O fechamento volta para Fechado. O developer poderá reenviar NF/boleto e o gestor poderá finalizar de novo.";
    case "closed":
      return "Remove a aprovação. O fechamento volta para Em fechamento e o gestor poderá aprovar ou devolver novamente.";
    case "in_review":
      return "Cancela o envio. O fechamento volta para Aberto e o developer poderá regenerar o snapshot.";
    case "rejected":
      return "Cancela a devolução. O fechamento volta para Aberto.";
    default:
      return null;
  }
}
