import {
  isTimeBankEntrySource,
  isTimeBankEntryType,
  type TimeBankEntry,
  type TimeBankEntrySource,
  type TimeBankEntryType,
} from "@/types/time-bank";

export function roundHoursToMinutes(hours: number): number {
  if (!Number.isFinite(hours)) {
    return 0;
  }
  return Math.round(hours * 60);
}

export function minutesToHoursDecimal(minutes: number): number {
  if (!Number.isFinite(minutes)) {
    return 0;
  }
  return Math.round((minutes / 60) * 100) / 100;
}

export function formatTimeBankMinutes(
  minutes: number | null | undefined,
  options?: { signed?: boolean },
): string {
  if (minutes == null || !Number.isFinite(minutes)) {
    return "—";
  }
  const signed = options?.signed !== false;
  const rounded = Math.round(minutes);
  const sign =
    signed && rounded !== 0 ? (rounded > 0 ? "+" : "-") : "";
  const absolute = Math.abs(rounded);
  const hours = Math.floor(absolute / 60);
  const rest = absolute % 60;
  return `${sign}${String(hours).padStart(2, "0")}h${String(rest).padStart(2, "0")}`;
}

export function formatUnsignedTimeBankMinutes(
  minutes: number | null | undefined,
): string {
  if (minutes == null || !Number.isFinite(minutes)) {
    return "—";
  }
  const absolute = Math.abs(Math.round(minutes));
  const hours = Math.floor(absolute / 60);
  const rest = absolute % 60;
  return `${String(hours).padStart(2, "0")}h${String(rest).padStart(2, "0")}`;
}

export function formatHoursAsTimeBank(
  hours: number | null | undefined,
  options?: { signed?: boolean },
): string {
  if (hours == null || !Number.isFinite(hours)) {
    return "—";
  }
  return formatTimeBankMinutes(roundHoursToMinutes(hours), options);
}

export function parseTimeBankInputToMinutes(
  raw: string,
): { ok: true; minutes: number } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Informe a quantidade de horas." };
  }

  if (/^\d+:\d{1,2}$/.test(trimmed)) {
    const [hoursRaw, minutesRaw] = trimmed.split(":");
    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes >= 60) {
      return { ok: false, error: "Use HH:mm válido, por exemplo 02:30." };
    }
    const total = hours * 60 + minutes;
    if (total <= 0) {
      return { ok: false, error: "A quantidade deve ser maior que zero." };
    }
    return { ok: true, minutes: total };
  }

  const normalized = trimmed.replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      ok: false,
      error: "Use horas decimais ou HH:mm, por exemplo 2,5 ou 02:30.",
    };
  }

  const total = roundHoursToMinutes(parsed);
  if (total <= 0) {
    return { ok: false, error: "A quantidade deve ser maior que zero." };
  }
  return { ok: true, minutes: total };
}

export function signedMinutesFromEntry(input: {
  entryType: TimeBankEntryType;
  minutesAmount: number;
}): number {
  const magnitude = Math.abs(Math.round(input.minutesAmount));
  return input.entryType === "credit" ? magnitude : -magnitude;
}

export function entryTypeFromSignedMinutes(
  minutes: number,
): { entryType: TimeBankEntryType; minutesAmount: number } | null {
  const rounded = Math.round(minutes);
  if (!rounded) {
    return null;
  }
  return {
    entryType: rounded > 0 ? "credit" : "debit",
    minutesAmount: Math.abs(rounded),
  };
}

export type TimeBankLedgerProjectionRow = {
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
};

export function projectTimeBankLedger(
  entries: TimeBankLedgerProjectionRow[],
): TimeBankEntry[] {
  const reversedIds = new Set(
    entries
      .map((entry) => entry.reversed_entry_id)
      .filter((value): value is string => Boolean(value)),
  );

  let running = 0;
  const ascending = [...entries].sort((a, b) => {
    const dateCompare = a.entry_date.localeCompare(b.entry_date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    const createdCompare = a.created_at.localeCompare(b.created_at);
    if (createdCompare !== 0) {
      return createdCompare;
    }
    return a.id.localeCompare(b.id);
  });

  return ascending.map((entry) => {
    running += signedMinutesFromEntry({
      entryType: entry.entry_type,
      minutesAmount: entry.minutes_amount,
    });

    return {
      ...entry,
      balance_after_minutes: running,
      status: reversedIds.has(entry.id) ? "reverted" : "active",
      can_reverse:
        entry.source === "manual_adjustment" && !reversedIds.has(entry.id),
    };
  });
}

export function computeTimeBankBalanceBeforeClosing(
  ascendingEntries: TimeBankEntry[],
  input: {
    yearMonth: string;
    monthlyClosingId?: string | null;
    closingSequence?: number | null;
  },
): {
  balanceBeforeClosingMinutes: number;
  recordedEntry: TimeBankEntry | null;
} {
  const recordedEntry =
    input.monthlyClosingId && input.closingSequence
      ? ascendingEntries.find(
          (entry) =>
            entry.monthly_closing_id === input.monthlyClosingId &&
            entry.source === "monthly_closing" &&
            entry.closing_sequence === input.closingSequence,
        ) ?? null
      : null;

  let balanceBeforeClosingMinutes = 0;
  for (const entry of ascendingEntries) {
    const isCurrentClosingEntry =
      input.monthlyClosingId != null &&
      entry.monthly_closing_id === input.monthlyClosingId &&
      entry.source === "monthly_closing" &&
      (input.closingSequence == null ||
        entry.closing_sequence === input.closingSequence);
    if (isCurrentClosingEntry) {
      continue;
    }
    if (
      entry.year_month < input.yearMonth ||
      (entry.year_month === input.yearMonth &&
        entry.source !== "monthly_closing")
    ) {
      balanceBeforeClosingMinutes += signedMinutesFromEntry({
        entryType: entry.entry_type,
        minutesAmount: entry.minutes_amount,
      });
    }
  }

  if (recordedEntry) {
    balanceBeforeClosingMinutes =
      recordedEntry.balance_after_minutes -
      signedMinutesFromEntry({
        entryType: recordedEntry.entry_type,
        minutesAmount: recordedEntry.minutes_amount,
      });
  }

  return { balanceBeforeClosingMinutes, recordedEntry };
}

export function normalizeTimeBankYearMonth(value: string): string | null {
  const trimmed = value.trim();
  return /^\d{4}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export function normalizeTimeBankEntryDate(value: string): string | null {
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export function normalizeTimeBankEntryType(
  value: string,
): TimeBankEntryType | null {
  const trimmed = value.trim();
  return isTimeBankEntryType(trimmed) ? trimmed : null;
}

export function normalizeTimeBankEntrySource(
  value: string,
): TimeBankEntrySource | null {
  const trimmed = value.trim();
  return isTimeBankEntrySource(trimmed) ? trimmed : null;
}
