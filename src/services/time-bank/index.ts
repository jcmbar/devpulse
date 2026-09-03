import "server-only";

import { getAppContext } from "@/lib/auth/app-context";
import { hasPermission } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeTimeBankBalanceBeforeClosing,
  normalizeTimeBankEntryDate,
  normalizeTimeBankYearMonth,
  projectTimeBankLedger,
} from "@/lib/metrics/time-bank";
import { createClient } from "@/lib/supabase/server";
import type {
  TimeBankEntry,
  TimeBankEntrySource,
  TimeBankEntryType,
  TimeBankHistoryFilters,
  TimeBankSummary,
} from "@/types/time-bank";

type RawEntry = {
  id: string;
  developer_id: string;
  year_month: string;
  entry_date: string;
  entry_type: TimeBankEntryType | null;
  source: TimeBankEntrySource | null;
  minutes_amount: number | null;
  monthly_closing_id: string | null;
  closing_sequence: number | null;
  description: string;
  created_by: string | null;
  created_at: string;
  reversed_entry_id: string | null;
  metadata_json: Record<string, unknown> | null;
  created_profile:
    | {
        full_name?: string | null;
        email?: string | null;
      }
    | Array<{
        full_name?: string | null;
        email?: string | null;
      }>
    | null;
};

function mapRawEntry(row: Record<string, unknown>): RawEntry {
  const createdProfileRaw = row.created_profile as
    | RawEntry["created_profile"]
    | undefined;
  const createdProfile = Array.isArray(createdProfileRaw)
    ? (createdProfileRaw[0] ?? null)
    : (createdProfileRaw ?? null);

  return {
    id: String(row.id),
    developer_id: String(row.developer_id),
    year_month: String(row.year_month),
    entry_date: String(row.entry_date),
    entry_type:
      row.entry_type === "credit" || row.entry_type === "debit"
        ? row.entry_type
        : null,
    source:
      row.source === "monthly_closing" ||
      row.source === "manual_adjustment" ||
      row.source === "reversal"
        ? row.source
        : null,
    minutes_amount:
      row.minutes_amount == null ? null : Number(row.minutes_amount),
    monthly_closing_id: (row.monthly_closing_id as string | null) ?? null,
    closing_sequence:
      row.closing_sequence == null ? null : Number(row.closing_sequence),
    description: String(row.description ?? ""),
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    reversed_entry_id: (row.reversed_entry_id as string | null) ?? null,
    metadata_json:
      row.metadata_json && typeof row.metadata_json === "object"
        ? (row.metadata_json as Record<string, unknown>)
        : null,
    created_profile: createdProfile,
  };
}

function toProjectionRow(entry: RawEntry) {
  if (
    !entry.entry_type ||
    !entry.source ||
    entry.minutes_amount == null ||
    entry.minutes_amount <= 0
  ) {
    return null;
  }
  const actor =
    entry.created_profile && !Array.isArray(entry.created_profile)
      ? entry.created_profile
      : null;
  return {
    id: entry.id,
    developer_id: entry.developer_id,
    year_month: entry.year_month,
    entry_date: entry.entry_date,
    entry_type: entry.entry_type,
    source: entry.source,
    minutes_amount: entry.minutes_amount,
    monthly_closing_id: entry.monthly_closing_id,
    closing_sequence: entry.closing_sequence,
    description: entry.description,
    created_by: entry.created_by,
    created_by_name: actor?.full_name?.trim() || actor?.email?.trim() || null,
    created_at: entry.created_at,
    reversed_entry_id: entry.reversed_entry_id,
    metadata_json: entry.metadata_json,
  };
}

function summarizeLedger(entries: TimeBankEntry[]): TimeBankSummary {
  let creditMinutes = 0;
  let debitMinutes = 0;
  let currentBalance = 0;

  for (const entry of entries) {
    if (entry.entry_type === "credit") {
      creditMinutes += entry.minutes_amount;
    } else {
      debitMinutes += entry.minutes_amount;
    }
    currentBalance = entry.balance_after_minutes;
  }

  const latest = entries[entries.length - 1] ?? null;
  return {
    current_balance_minutes: currentBalance,
    credit_minutes: creditMinutes,
    debit_minutes: debitMinutes,
    latest_balance_minutes: latest?.balance_after_minutes ?? 0,
    latest_reference_period: latest?.year_month ?? null,
    total_entries: entries.length,
  };
}

async function loadRawEntries(developerId: string): Promise<RawEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("developer_time_bank_entries")
    .select(
      `
      id,
      developer_id,
      year_month,
      entry_date,
      entry_type,
      source,
      minutes_amount,
      monthly_closing_id,
      closing_sequence,
      description,
      created_by,
      created_at,
      reversed_entry_id,
      metadata_json,
      created_profile:profiles!developer_time_bank_entries_created_by_fkey (
        full_name,
        email
      )
    `,
    )
    .eq("developer_id", developerId);

  if (error) {
    console.warn("time bank entries unavailable:", error.message);
    return [];
  }

  return (data ?? []).map((row) => mapRawEntry(row as Record<string, unknown>));
}

/**
 * Transactional finalize RPC with row lock on monthly_closings.
 */
export async function finalizeMonthlyClosingWithTimeBankRpc(
  closingId: string,
): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "finalize_monthly_closing_with_time_bank",
    {
      p_closing_id: closingId,
    },
  );
  if (error) {
    throw new Error(`Falha ao finalizar fechamento com banco de horas: ${error.message}`);
  }
  return data as Record<string, unknown>;
}

export async function createManualTimeBankAdjustment(input: {
  developerId: string,
  yearMonth: string;
  entryDate: string;
  entryType: TimeBankEntryType;
  minutesAmount: number;
  description: string;
  actorUserId: string;
  metadata?: Record<string, unknown> | null;
}): Promise<TimeBankEntry> {
  const yearMonth = normalizeTimeBankYearMonth(input.yearMonth);
  const entryDate = normalizeTimeBankEntryDate(input.entryDate);
  const description = input.description.trim();
  const minutesAmount = Math.abs(Math.round(input.minutesAmount));

  if (!yearMonth) {
    throw new Error("Competência inválida.");
  }
  if (!entryDate) {
    throw new Error("Data do lançamento inválida.");
  }
  if (!description) {
    throw new Error("Informe o motivo do ajuste.");
  }
  if (!minutesAmount) {
    throw new Error("A quantidade de horas deve ser maior que zero.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("developer_time_bank_entries")
    .insert({
      developer_id: input.developerId,
      year_month: yearMonth,
      entry_date: entryDate,
      entry_type: input.entryType,
      source: "manual_adjustment",
      minutes_amount: minutesAmount,
      description,
      created_by: input.actorUserId,
      metadata_json: input.metadata ?? {},
    })
    .select(
      `
      id,
      developer_id,
      year_month,
      entry_date,
      entry_type,
      source,
      minutes_amount,
      monthly_closing_id,
      closing_sequence,
      description,
      created_by,
      created_at,
      reversed_entry_id,
      metadata_json,
      created_profile:profiles!developer_time_bank_entries_created_by_fkey (
        full_name,
        email
      )
    `,
    )
    .single();

  if (error) {
    throw new Error(`Falha ao criar ajuste no banco de horas: ${error.message}`);
  }

  const ledger = await getDeveloperTimeBankLedger(input.developerId);
  const created = ledger.entries.find((entry) => entry.id === String(data.id));
  if (!created) {
    throw new Error("Ajuste criado, mas não encontrado no histórico.");
  }
  return created;
}

export async function reverseTimeBankEntry(input: {
  entryId: string;
  actorUserId: string;
  description: string;
  entryDate?: string;
}): Promise<TimeBankEntry | null> {
  const context = await getAppContext();
  if (!hasPermission(context.grants, "pessoas", "edit")) {
    throw new Error("Você não tem permissão para reverter ajustes do banco de horas.");
  }
  if (context.profile.id !== input.actorUserId) {
    throw new Error("Usuário do lançamento inválido para esta operação.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("developer_time_bank_entries")
    .select(
      `
      id,
      developer_id,
      year_month,
      entry_date,
      entry_type,
      source,
      minutes_amount,
      monthly_closing_id,
      closing_sequence,
      description,
      created_by,
      created_at,
      reversed_entry_id,
      metadata_json
    `,
    )
    .eq("id", input.entryId)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao carregar lançamento: ${error.message}`);
  }
  if (!data) {
    throw new Error("Lançamento não encontrado.");
  }

  const original = mapRawEntry(data as Record<string, unknown>);
  if (original.source !== "manual_adjustment") {
    throw new Error("Apenas ajustes manuais podem ser revertidos por esta operação.");
  }
  if (!original.entry_type || original.minutes_amount == null || original.minutes_amount <= 0) {
    throw new Error("O lançamento original não possui dados canônicos suficientes para reversão.");
  }

  const { data: scopedDeveloper, error: scopedDeveloperError } = await supabase
    .from("developers")
    .select("id")
    .eq("id", original.developer_id)
    .maybeSingle();
  if (scopedDeveloperError) {
    throw new Error(
      `Falha ao validar escopo do colaborador para reversão: ${scopedDeveloperError.message}`,
    );
  }
  if (!scopedDeveloper) {
    throw new Error("O colaborador do lançamento não está disponível no escopo atual.");
  }

  const { data: existingReversal, error: reversalError } = await supabase
    .from("developer_time_bank_entries")
    .select("id")
    .eq("reversed_entry_id", original.id)
    .maybeSingle();
  if (reversalError) {
    throw new Error(
      `Falha ao verificar reversão existente: ${reversalError.message}`,
    );
  }
  if (existingReversal) {
    return null;
  }

  const reversalType: TimeBankEntryType =
    original.entry_type === "credit" ? "debit" : "credit";
  const entryDate =
    normalizeTimeBankEntryDate(input.entryDate ?? new Date().toISOString().slice(0, 10)) ??
    new Date().toISOString().slice(0, 10);
  const description = input.description.trim();
  if (!description) {
    throw new Error("Informe o motivo da reversão.");
  }

  const admin = createAdminClient();
  const { data: created, error: insertError } = await admin
    .from("developer_time_bank_entries")
    .insert({
      developer_id: original.developer_id,
      year_month: original.year_month,
      entry_date: entryDate,
      entry_type: reversalType,
      source: "reversal",
      minutes_amount: original.minutes_amount,
      monthly_closing_id: original.monthly_closing_id,
      closing_sequence: original.closing_sequence,
      description,
      created_by: input.actorUserId,
      reversed_entry_id: original.id,
      metadata_json: {
        reversed_source: original.source,
        reversed_entry_type: original.entry_type,
        reversed_description: original.description,
      },
    })
    .select(
      `
      id,
      developer_id,
      year_month,
      entry_date,
      entry_type,
      source,
      minutes_amount,
      monthly_closing_id,
      closing_sequence,
      description,
      created_by,
      created_at,
      reversed_entry_id,
      metadata_json,
      created_profile:profiles!developer_time_bank_entries_created_by_fkey (
        full_name,
        email
      )
    `,
    )
    .single();

  if (insertError) {
    if (
      insertError.code === "23505" ||
      insertError.message.toLowerCase().includes("unique")
    ) {
      return null;
    }
    throw new Error(`Falha ao lançar reversão: ${insertError.message}`);
  }

  const ledger = await getDeveloperTimeBankLedger(original.developer_id);
  return (
    ledger.entries.find((entry) => entry.id === String(created.id)) ?? null
  );
}

export async function reopenMonthlyClosingWithTimeBankRpc(
  closingId: string,
): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "reopen_monthly_closing_with_time_bank",
    {
      p_closing_id: closingId,
    },
  );
  if (error) {
    throw new Error(`Falha ao reabrir fechamento com banco de horas: ${error.message}`);
  }
  return data as Record<string, unknown>;
}

export async function getDeveloperTimeBankLedger(
  developerId: string,
): Promise<{ summary: TimeBankSummary; entries: TimeBankEntry[] }> {
  const raw = await loadRawEntries(developerId);
  const ascending = projectTimeBankLedger(
    raw
      .map((entry) => toProjectionRow(entry))
      .filter((entry): entry is NonNullable<ReturnType<typeof toProjectionRow>> => entry != null),
  );
  return {
    summary: summarizeLedger(ascending),
    entries: [...ascending].reverse(),
  };
}

export async function getTimeBankEntryForClosing(input: {
  developerId: string;
  monthlyClosingId: string;
  closingSequence: number;
}): Promise<TimeBankEntry | null> {
  const ledger = await getDeveloperTimeBankLedger(input.developerId);
  return (
    ledger.entries.find(
      (entry) =>
        entry.monthly_closing_id === input.monthlyClosingId &&
        entry.source === "monthly_closing" &&
        entry.closing_sequence === input.closingSequence,
    ) ?? null
  );
}

export async function getDeveloperTimeBankClosingContext(input: {
  developerId: string;
  yearMonth: string;
  monthlyClosingId?: string | null;
  closingSequence?: number | null;
}): Promise<{
  balanceBeforeClosingMinutes: number;
  recordedEntry: TimeBankEntry | null;
}> {
  const ledger = await getDeveloperTimeBankLedger(input.developerId);
  return computeTimeBankBalanceBeforeClosing([...ledger.entries].reverse(), input);
}

export async function getDeveloperTimeBankSummary(
  developerId: string,
): Promise<TimeBankSummary> {
  const ledger = await getDeveloperTimeBankLedger(developerId);
  return ledger.summary;
}

export async function listDeveloperTimeBankEntries(
  developerId: string,
  filters?: TimeBankHistoryFilters,
): Promise<TimeBankEntry[]> {
  const ledger = await getDeveloperTimeBankLedger(developerId);
  return ledger.entries.filter((entry) => {
    if (filters?.yearMonth && filters.yearMonth !== entry.year_month) {
      return false;
    }
    if (
      filters?.entryType &&
      filters.entryType !== "all" &&
      filters.entryType !== entry.entry_type
    ) {
      return false;
    }
    if (
      filters?.source &&
      filters.source !== "all" &&
      filters.source !== entry.source
    ) {
      return false;
    }
    return true;
  });
}

export async function getDeveloperTimeBankBalance(
  developerId: string,
): Promise<number> {
  const summary = await getDeveloperTimeBankSummary(developerId);
  return summary.current_balance_minutes / 60;
}
