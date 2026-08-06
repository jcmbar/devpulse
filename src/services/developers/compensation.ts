import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  CompensationBaseType,
  DeveloperCompensation,
  UpsertCurrentCompensationInput,
} from "@/types/developer-compensation";

function mapRow(row: Record<string, unknown>): DeveloperCompensation {
  const baseTypeRaw = String(row.base_type ?? "fixed");
  const baseType: CompensationBaseType =
    baseTypeRaw === "variable" ? "variable" : "fixed";

  return {
    id: String(row.id),
    developer_id: String(row.developer_id),
    base_amount: Number(row.base_amount ?? 0),
    base_type: baseType,
    hourly_rate:
      row.hourly_rate == null ? null : Number(row.hourly_rate),
    contracted_hours_per_day: Number(row.contracted_hours_per_day ?? 0),
    contracted_hours_per_month: Number(row.contracted_hours_per_month ?? 0),
    daily_travel_amount: Number(row.daily_travel_amount ?? 0),
    daily_meal_amount: Number(row.daily_meal_amount ?? 0),
    require_meal_pix_receipt: Boolean(row.require_meal_pix_receipt),
    currency: String(row.currency ?? "BRL"),
    effective_from: String(row.effective_from),
    effective_to: (row.effective_to as string | null) ?? null,
    is_current: Boolean(row.is_current),
    notes: (row.notes as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function getCurrentDeveloperCompensation(
  developerId: string,
): Promise<DeveloperCompensation | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("developer_compensation")
    .select("*")
    .eq("developer_id", developerId)
    .eq("is_current", true)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Falha ao carregar valores da pessoa: ${error.message}`,
    );
  }

  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function listCurrentCompensationsByDeveloperIds(
  developerIds: string[],
): Promise<Map<string, DeveloperCompensation>> {
  const map = new Map<string, DeveloperCompensation>();
  if (developerIds.length === 0) {
    return map;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("developer_compensation")
    .select("*")
    .in("developer_id", developerIds)
    .eq("is_current", true);

  if (error) {
    throw new Error(`Falha ao listar valores: ${error.message}`);
  }

  for (const row of data ?? []) {
    const mapped = mapRow(row as Record<string, unknown>);
    map.set(mapped.developer_id, mapped);
  }
  return map;
}

/**
 * Upsert the current compensation row for a person.
 * Does not close history rows yet — V1 edits the active row in place
 * (schema still supports future close+insert reajustes).
 */
export async function upsertCurrentDeveloperCompensation(
  input: UpsertCurrentCompensationInput,
): Promise<DeveloperCompensation> {
  const supabase = await createClient();
  const existing = await getCurrentDeveloperCompensation(input.developerId);

  const payload = {
    developer_id: input.developerId,
    base_amount: input.baseAmount,
    base_type: input.baseType,
    hourly_rate: input.hourlyRate,
    contracted_hours_per_day: input.contractedHoursPerDay,
    contracted_hours_per_month: input.contractedHoursPerMonth,
    daily_travel_amount: input.dailyTravelAmount,
    daily_meal_amount: input.dailyMealAmount,
    require_meal_pix_receipt: Boolean(input.requireMealPixReceipt),
    currency: input.currency ?? "BRL",
    effective_from:
      input.effectiveFrom ??
      existing?.effective_from ??
      new Date().toISOString().slice(0, 10),
    effective_to: null as string | null,
    is_current: true,
    notes: input.notes ?? null,
  };

  if (existing) {
    const { data, error } = await supabase
      .from("developer_compensation")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Falha ao atualizar valores: ${error.message}`);
    }

    return mapRow(data as Record<string, unknown>);
  }

  const { data, error } = await supabase
    .from("developer_compensation")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao salvar valores: ${error.message}`);
  }

  return mapRow(data as Record<string, unknown>);
}
