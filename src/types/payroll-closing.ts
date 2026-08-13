import type { CompensationBaseType } from "@/types/developer-compensation";

export const PAYROLL_CLOSING_STATUSES = [
  "open",
  "in_progress",
  "closed",
] as const;

export type PayrollClosingStatus = (typeof PAYROLL_CLOSING_STATUSES)[number];

export const PAYROLL_CLOSING_STATUS_LABELS: Record<
  PayrollClosingStatus,
  string
> = {
  open: "Aberto",
  in_progress: "Em fechamento",
  closed: "Fechado",
};

export const PAYROLL_ATTENDANCE_KINDS = [
  "presencial",
  "home",
  "off",
  "holiday",
  "weekend",
] as const;

export type PayrollAttendanceKind =
  (typeof PAYROLL_ATTENDANCE_KINDS)[number];

export const PAYROLL_ATTENDANCE_KIND_LABELS: Record<
  PayrollAttendanceKind,
  string
> = {
  presencial: "Presencial",
  home: "Home office",
  off: "Falta / folga",
  holiday: "Feriado",
  weekend: "Fim de semana",
};

export const PAYROLL_WORKFLOW_STATUSES = [
  "pending",
  "sent",
  "received",
  "paid",
  "skipped",
] as const;

export type PayrollEmailStatus = "pending" | "sent" | "skipped";
export type PayrollInvoiceDocStatus = "pending" | "received" | "skipped";
export type PayrollFinanceStatus = "pending" | "paid" | "skipped";

export type PayrollMonthClosing = {
  id: string;
  year_month: string;
  status: PayrollClosingStatus;
  period_start: string;
  period_end: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PayrollClosingItem = {
  id: string;
  payroll_closing_id: string;
  developer_id: string;
  developer_name: string;
  team_id: string | null;
  base_amount: number;
  base_type: CompensationBaseType;
  hourly_rate: number | null;
  contracted_hours_per_day: number;
  contracted_hours_per_month: number;
  daily_travel_amount: number;
  daily_meal_amount: number;
  presencial_days_count: number;
  differential_amount: number;
  discounts_amount: number;
  travel_amount: number;
  meal_amount: number;
  invoice_amount: number;
  differential_manual: boolean;
  travel_manual: boolean;
  meal_manual: boolean;
  invoice_issuer_id: string | null;
  email_status: PayrollEmailStatus;
  invoice_status: PayrollInvoiceDocStatus;
  finance_status: PayrollFinanceStatus;
  notes: string | null;
  is_reviewed: boolean;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PayrollAttendanceDay = {
  id: string;
  payroll_item_id: string;
  day_on: string;
  day_kind: PayrollAttendanceKind;
  hours: number;
  /** Conta para refeição; deslocamento = day_kind presencial. */
  charges_meal: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PayrollClosingItemWithIssuer = PayrollClosingItem & {
  issuer_name: string | null;
};

/** Auto-calculated Folha fields that can be restored from cadastro + presença. */
export type PayrollAutoAmountField =
  | "differential"
  | "travel"
  | "meal"
  | "all";
