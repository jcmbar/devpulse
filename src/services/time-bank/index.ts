import "server-only";

import { createClient } from "@/lib/supabase/server";

export type TimeBankEntry = {
  id: string;
  developer_id: string;
  year_month: string;
  hours_delta: number;
  monthly_closing_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

function mapEntry(row: Record<string, unknown>): TimeBankEntry {
  return {
    id: String(row.id),
    developer_id: String(row.developer_id),
    year_month: String(row.year_month),
    hours_delta: Number(row.hours_delta ?? 0),
    monthly_closing_id: (row.monthly_closing_id as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

/**
 * Posts Δ hours for a finalized closing when time bank was enabled at submit.
 * Idempotent per closing_id. Never backfills historical closings (caller must
 * only invoke for newly finalized rows with time_bank_enabled_snapshot = true).
 */
export async function postTimeBankEntryForClosing(input: {
  developerId: string;
  yearMonth: string;
  hoursDelta: number;
  monthlyClosingId: string;
  actorUserId: string;
  note?: string | null;
}): Promise<TimeBankEntry | null> {
  if (!Number.isFinite(input.hoursDelta) || input.hoursDelta === 0) {
    return null;
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("developer_time_bank_entries")
    .select("id")
    .eq("monthly_closing_id", input.monthlyClosingId)
    .maybeSingle();

  if (existing) {
    return null;
  }

  const { data, error } = await supabase
    .from("developer_time_bank_entries")
    .insert({
      developer_id: input.developerId,
      year_month: input.yearMonth,
      hours_delta: input.hoursDelta,
      monthly_closing_id: input.monthlyClosingId,
      note: input.note ?? `Fechamento ${input.yearMonth}`,
      created_by: input.actorUserId,
    })
    .select("*")
    .single();

  if (error) {
    if (
      error.code === "23505" ||
      error.message.toLowerCase().includes("unique")
    ) {
      return null;
    }
    throw new Error(`Falha ao lançar banco de horas: ${error.message}`);
  }

  return mapEntry(data as Record<string, unknown>);
}

export async function getDeveloperTimeBankBalance(
  developerId: string,
): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("developer_time_bank_entries")
    .select("hours_delta")
    .eq("developer_id", developerId);

  if (error) {
    // Table may not exist until migration is applied.
    console.warn("time bank balance unavailable:", error.message);
    return 0;
  }

  let total = 0;
  for (const row of data ?? []) {
    total += Number((row as { hours_delta: number }).hours_delta ?? 0);
  }
  return Math.round(total * 100) / 100;
}

export async function listDeveloperTimeBankEntries(
  developerId: string,
  limit = 24,
): Promise<TimeBankEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("developer_time_bank_entries")
    .select("*")
    .eq("developer_id", developerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("time bank entries unavailable:", error.message);
    return [];
  }

  return (data ?? []).map((row) => mapEntry(row as Record<string, unknown>));
}
