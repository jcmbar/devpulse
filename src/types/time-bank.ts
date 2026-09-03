export const TIME_BANK_ENTRY_TYPES = ["credit", "debit"] as const;

export type TimeBankEntryType = (typeof TIME_BANK_ENTRY_TYPES)[number];

export const TIME_BANK_ENTRY_TYPE_LABELS: Record<TimeBankEntryType, string> = {
  credit: "Crédito",
  debit: "Débito",
};

export function isTimeBankEntryType(
  value: string,
): value is TimeBankEntryType {
  return (TIME_BANK_ENTRY_TYPES as readonly string[]).includes(value);
}

export const TIME_BANK_ENTRY_SOURCES = [
  "monthly_closing",
  "manual_adjustment",
  "reversal",
] as const;

export type TimeBankEntrySource = (typeof TIME_BANK_ENTRY_SOURCES)[number];

export const TIME_BANK_ENTRY_SOURCE_LABELS: Record<
  TimeBankEntrySource,
  string
> = {
  monthly_closing: "Fechamento mensal",
  manual_adjustment: "Ajuste manual",
  reversal: "Reversão",
};

export function isTimeBankEntrySource(
  value: string,
): value is TimeBankEntrySource {
  return (TIME_BANK_ENTRY_SOURCES as readonly string[]).includes(value);
}

export type TimeBankEntryStatus = "active" | "reverted";

export const TIME_BANK_ENTRY_STATUS_LABELS: Record<
  TimeBankEntryStatus,
  string
> = {
  active: "Ativo",
  reverted: "Revertido",
};

export type TimeBankEntry = {
  id: string;
  developer_id: string;
  year_month: string;
  entry_date: string;
  entry_type: TimeBankEntryType;
  source: TimeBankEntrySource;
  minutes_amount: number;
  monthly_closing_id: string | null;
  closing_sequence: number | null;
  description: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  reversed_entry_id: string | null;
  metadata_json: Record<string, unknown> | null;
  balance_after_minutes: number;
  status: TimeBankEntryStatus;
  can_reverse: boolean;
};

export type TimeBankSummary = {
  current_balance_minutes: number;
  credit_minutes: number;
  debit_minutes: number;
  latest_balance_minutes: number;
  latest_reference_period: string | null;
  total_entries: number;
};

export type TimeBankHistoryFilters = {
  yearMonth?: string | null;
  entryType?: TimeBankEntryType | "all" | null;
  source?: TimeBankEntrySource | "all" | null;
};
