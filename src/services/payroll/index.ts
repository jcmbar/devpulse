import "server-only";

import {
  computeInvoiceAmount,
  computeMealAmount,
  computePayrollDifferential,
  computeTravelAmount,
  countPresencialDays,
  defaultDayKindForDate,
  listDaysInYearMonth,
  yearMonthPeriod,
} from "@/lib/metrics/payroll-calc";
import { createClient } from "@/lib/supabase/server";
import { listCurrentCompensationsByDeveloperIds } from "@/services/developers/compensation";
import { listDevelopersAdmin } from "@/services/developers/admin";
import { listApplicableHolidayDatesForDeveloperMonth } from "@/services/holidays";
import {
  assertMonthlyClosingNotFinalizedForPayroll,
  mapFinalizedMonthlyClosingIdsByDeveloper,
} from "@/services/monthly-closings";
import type { CompensationBaseType } from "@/types/developer-compensation";
import type {
  PayrollAttendanceDay,
  PayrollAttendanceKind,
  PayrollAutoAmountField,
  PayrollClosingItem,
  PayrollClosingItemWithIssuer,
  PayrollClosingStatus,
  PayrollEmailStatus,
  PayrollFinanceStatus,
  PayrollInvoiceDocStatus,
  PayrollMonthClosing,
} from "@/types/payroll-closing";

function mapClosing(row: Record<string, unknown>): PayrollMonthClosing {
  const statusRaw = String(row.status ?? "open");
  const status: PayrollClosingStatus =
    statusRaw === "in_progress" || statusRaw === "closed"
      ? statusRaw
      : "open";

  return {
    id: String(row.id),
    year_month: String(row.year_month),
    status,
    period_start: String(row.period_start),
    period_end: String(row.period_end),
    notes: (row.notes as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapItem(row: Record<string, unknown>): PayrollClosingItem {
  const baseTypeRaw = String(row.base_type ?? "fixed");
  const baseType: CompensationBaseType =
    baseTypeRaw === "variable" ? "variable" : "fixed";

  return {
    id: String(row.id),
    payroll_closing_id: String(row.payroll_closing_id),
    developer_id: String(row.developer_id),
    developer_name: String(row.developer_name),
    team_id: (row.team_id as string | null) ?? null,
    base_amount: Number(row.base_amount ?? 0),
    base_type: baseType,
    hourly_rate:
      row.hourly_rate == null ? null : Number(row.hourly_rate),
    contracted_hours_per_day: Number(row.contracted_hours_per_day ?? 8),
    contracted_hours_per_month: Number(row.contracted_hours_per_month ?? 168),
    daily_travel_amount: Number(row.daily_travel_amount ?? 0),
    daily_meal_amount: Number(row.daily_meal_amount ?? 0),
    presencial_days_count: Number(row.presencial_days_count ?? 0),
    differential_amount: Number(row.differential_amount ?? 0),
    discounts_amount: Number(row.discounts_amount ?? 0),
    travel_amount: Number(row.travel_amount ?? 0),
    meal_amount: Number(row.meal_amount ?? 0),
    invoice_amount: Number(row.invoice_amount ?? 0),
    differential_manual: Boolean(row.differential_manual),
    travel_manual: Boolean(row.travel_manual),
    meal_manual: Boolean(row.meal_manual),
    invoice_issuer_id: (row.invoice_issuer_id as string | null) ?? null,
    email_status: (row.email_status as PayrollEmailStatus) ?? "pending",
    invoice_status: (row.invoice_status as PayrollInvoiceDocStatus) ?? "pending",
    finance_status: (row.finance_status as PayrollFinanceStatus) ?? "pending",
    notes: (row.notes as string | null) ?? null,
    is_reviewed: Boolean(row.is_reviewed),
    reviewed_at: (row.reviewed_at as string | null) ?? null,
    reviewed_by: (row.reviewed_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapAttendance(row: Record<string, unknown>): PayrollAttendanceDay {
  const kindRaw = String(row.day_kind ?? "home");
  const dayKind: PayrollAttendanceKind =
    kindRaw === "presencial" ||
    kindRaw === "off" ||
    kindRaw === "holiday" ||
    kindRaw === "weekend"
      ? kindRaw
      : "home";

  return {
    id: String(row.id),
    payroll_item_id: String(row.payroll_item_id),
    day_on: String(row.day_on),
    day_kind: dayKind,
    hours: Number(row.hours ?? 0),
    notes: (row.notes as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function ensurePayrollMonthClosing(input: {
  yearMonth: string;
  createdBy: string | null;
}): Promise<PayrollMonthClosing> {
  const period = yearMonthPeriod(input.yearMonth);
  if (!period) {
    throw new Error("Mês inválido. Use o formato AAAA-MM.");
  }

  const supabase = await createClient();
  const { data: existing, error: loadError } = await supabase
    .from("payroll_month_closings")
    .select("*")
    .eq("year_month", input.yearMonth)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Falha ao carregar folha: ${loadError.message}`);
  }

  if (existing) {
    return mapClosing(existing as Record<string, unknown>);
  }

  const { data, error } = await supabase
    .from("payroll_month_closings")
    .insert({
      year_month: input.yearMonth,
      status: "open",
      period_start: period.start,
      period_end: period.end,
      created_by: input.createdBy,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao criar folha do mês: ${error.message}`);
  }

  return mapClosing(data as Record<string, unknown>);
}

async function listItemsForClosing(
  closingId: string,
): Promise<PayrollClosingItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_closing_items")
    .select("*")
    .eq("payroll_closing_id", closingId)
    .order("developer_name", { ascending: true });

  if (error) {
    throw new Error(`Falha ao listar itens da folha: ${error.message}`);
  }

  return (data ?? []).map((row) => mapItem(row as Record<string, unknown>));
}

export async function listAttendanceForItem(
  itemId: string,
): Promise<PayrollAttendanceDay[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_attendance_days")
    .select("*")
    .eq("payroll_item_id", itemId)
    .order("day_on", { ascending: true });

  if (error) {
    throw new Error(`Falha ao listar presença: ${error.message}`);
  }

  return (data ?? []).map((row) =>
    mapAttendance(row as Record<string, unknown>),
  );
}

async function ensureAttendanceDefaults(input: {
  itemId: string;
  developerId: string;
  yearMonth: string;
  contractedHoursPerDay: number;
}): Promise<void> {
  const { dates: holidayDates } =
    await listApplicableHolidayDatesForDeveloperMonth({
      developerId: input.developerId,
      yearMonth: input.yearMonth,
    });

  const existing = await listAttendanceForItem(input.itemId);
  if (existing.length > 0) {
    // Soft sync: only upgrade default "home" weekdays that are now holidays.
    const softPatches = existing.filter(
      (day) =>
        day.day_kind === "home" &&
        holidayDates.has(day.day_on) &&
        defaultDayKindForDate(day.day_on, holidayDates) === "holiday",
    );
    if (softPatches.length === 0) {
      return;
    }

    const supabase = await createClient();
    for (const day of softPatches) {
      const { error } = await supabase
        .from("payroll_attendance_days")
        .update({ day_kind: "holiday", hours: 0 })
        .eq("id", day.id)
        .eq("day_kind", "home");
      if (error) {
        throw new Error(
          `Falha ao aplicar feriado em ${day.day_on}: ${error.message}`,
        );
      }
    }
    await recalculatePayrollItem(input.itemId);
    return;
  }

  const days = listDaysInYearMonth(input.yearMonth);
  if (days.length === 0) {
    return;
  }

  const rows = days.map((dayOn) => {
    const kind = defaultDayKindForDate(dayOn, holidayDates);
    const isWorkday = kind === "home" || kind === "presencial";
    return {
      payroll_item_id: input.itemId,
      day_on: dayOn,
      day_kind: kind,
      hours: isWorkday ? input.contractedHoursPerDay : 0,
    };
  });

  const supabase = await createClient();
  const { error } = await supabase.from("payroll_attendance_days").insert(rows);
  if (error) {
    throw new Error(`Falha ao gerar calendário de presença: ${error.message}`);
  }
}

function sameMoney(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

export async function setPayrollItemReviewed(input: {
  itemId: string;
  reviewed: boolean;
  reviewedBy: string | null;
}): Promise<PayrollClosingItem> {
  const supabase = await createClient();
  const patch = input.reviewed
    ? {
        is_reviewed: true,
        reviewed_at: new Date().toISOString(),
        reviewed_by: input.reviewedBy,
      }
    : {
        is_reviewed: false,
        reviewed_at: null,
        reviewed_by: null,
      };

  const { data, error } = await supabase
    .from("payroll_closing_items")
    .update(patch)
    .eq("id", input.itemId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar conferência: ${error.message}`);
  }

  return mapItem(data as Record<string, unknown>);
}

/** Auto-calculated amounts for an item, before manual overrides. */
async function suggestPayrollItemAmounts(item: PayrollClosingItem): Promise<{
  presencialDays: number;
  differential: number;
  travel: number;
  meal: number;
}> {
  const attendance = await listAttendanceForItem(item.id);
  const attendanceInput = attendance.map((day) => ({
    dayKind: day.day_kind,
    hours: day.hours,
  }));
  const presencialDays = countPresencialDays(attendanceInput);

  return {
    presencialDays,
    differential: computePayrollDifferential({
      baseType: item.base_type,
      baseAmount: item.base_amount,
      hourlyRate: item.hourly_rate,
      attendance: attendanceInput,
    }),
    travel: computeTravelAmount({
      presencialDays,
      dailyTravelAmount: item.daily_travel_amount,
    }),
    meal: computeMealAmount({
      presencialDays,
      dailyMealAmount: item.daily_meal_amount,
    }),
  };
}

export async function recalculatePayrollItem(
  itemId: string,
): Promise<PayrollClosingItem> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("payroll_closing_items")
    .select("*")
    .eq("id", itemId)
    .single();

  if (error || !row) {
    throw new Error(
      `Item da folha não encontrado: ${error?.message ?? "missing"}`,
    );
  }

  const item = mapItem(row as Record<string, unknown>);
  const suggested = await suggestPayrollItemAmounts(item);
  const presencialDays = suggested.presencialDays;

  const differential = item.differential_manual
    ? item.differential_amount
    : suggested.differential;
  const travel = item.travel_manual ? item.travel_amount : suggested.travel;
  const meal = item.meal_manual ? item.meal_amount : suggested.meal;
  const invoice = computeInvoiceAmount({
    baseAmount: item.base_amount,
    differentialAmount: differential,
    discountsAmount: item.discounts_amount,
    travelAmount: travel,
    mealAmount: meal,
  });

  const amountsChanged =
    item.presencial_days_count !== presencialDays ||
    !sameMoney(item.differential_amount, differential) ||
    !sameMoney(item.travel_amount, travel) ||
    !sameMoney(item.meal_amount, meal) ||
    !sameMoney(item.invoice_amount, invoice);

  const patch: Record<string, unknown> = {
    presencial_days_count: presencialDays,
    differential_amount: differential,
    travel_amount: travel,
    meal_amount: meal,
    invoice_amount: invoice,
  };

  if (amountsChanged && item.is_reviewed) {
    patch.is_reviewed = false;
    patch.reviewed_at = null;
    patch.reviewed_by = null;
  }

  const { data: updated, error: updateError } = await supabase
    .from("payroll_closing_items")
    .update(patch)
    .eq("id", itemId)
    .select("*")
    .single();

  if (updateError) {
    throw new Error(`Falha ao recalcular item: ${updateError.message}`);
  }

  return mapItem(updated as Record<string, unknown>);
}

/**
 * Ensure month header + one item per active person, with default attendance.
 * Snapshots compensation only when creating a new item (not every refresh).
 */
export async function ensurePayrollMonthWithItems(input: {
  yearMonth: string;
  createdBy: string | null;
  teamId?: string | null;
}): Promise<{
  closing: PayrollMonthClosing;
  items: PayrollClosingItemWithIssuer[];
}> {
  const closing = await ensurePayrollMonthClosing({
    yearMonth: input.yearMonth,
    createdBy: input.createdBy,
  });

  const developers = await listDevelopersAdmin({
    teamId: input.teamId ?? undefined,
    isActive: true,
  });

  const existing = await listItemsForClosing(closing.id);
  const existingByDev = new Map(
    existing.map((item) => [item.developer_id, item]),
  );

  const missing = developers.filter((dev) => !existingByDev.has(dev.id));
  const comps = await listCurrentCompensationsByDeveloperIds(
    missing.map((dev) => dev.id),
  );

  const supabase = await createClient();

  for (const developer of missing) {
    const comp = comps.get(developer.id);
    const hoursDay = comp?.contracted_hours_per_day ?? 8;
    const insertPayload = {
      payroll_closing_id: closing.id,
      developer_id: developer.id,
      developer_name: developer.full_name,
      team_id: developer.team_id,
      base_amount: comp?.base_amount ?? 0,
      base_type: comp?.base_type ?? "fixed",
      hourly_rate: comp?.hourly_rate ?? null,
      contracted_hours_per_day: hoursDay,
      contracted_hours_per_month: comp?.contracted_hours_per_month ?? 168,
      daily_travel_amount: comp?.daily_travel_amount ?? 0,
      daily_meal_amount: comp?.daily_meal_amount ?? 0,
      presencial_days_count: 0,
      differential_amount: 0,
      discounts_amount: 0,
      travel_amount: 0,
      meal_amount: 0,
      invoice_amount: comp?.base_amount ?? 0,
    };

    const { data: created, error } = await supabase
      .from("payroll_closing_items")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      throw new Error(
        `Falha ao incluir ${developer.full_name} na folha: ${error.message}`,
      );
    }

    const item = mapItem(created as Record<string, unknown>);
    await ensureAttendanceDefaults({
      itemId: item.id,
      developerId: item.developer_id,
      yearMonth: closing.year_month,
      contractedHoursPerDay: hoursDay,
    });
    await recalculatePayrollItem(item.id);
  }

  // Ensure attendance exists for previously created items too.
  const allItems = await listItemsForClosing(closing.id);
  const scoped = input.teamId
    ? allItems.filter((item) => item.team_id === input.teamId)
    : allItems;

  for (const item of scoped) {
    await ensureAttendanceDefaults({
      itemId: item.id,
      developerId: item.developer_id,
      yearMonth: closing.year_month,
      contractedHoursPerDay: item.contracted_hours_per_day,
    });
  }

  const refreshed = await listItemsForClosing(closing.id);
  const filtered = input.teamId
    ? refreshed.filter((item) => item.team_id === input.teamId)
    : refreshed;

  const issuerIds = [
    ...new Set(
      filtered
        .map((item) => item.invoice_issuer_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const issuerNames = new Map<string, string>();
  if (issuerIds.length > 0) {
    const { data: issuers } = await supabase
      .from("invoice_issuers")
      .select("id, legal_name")
      .in("id", issuerIds);
    for (const issuer of issuers ?? []) {
      issuerNames.set(String(issuer.id), String(issuer.legal_name));
    }
  }

  return {
    closing,
    items: filtered.map((item) => ({
      ...item,
      issuer_name: item.invoice_issuer_id
        ? (issuerNames.get(item.invoice_issuer_id) ?? null)
        : null,
    })),
  };
}

/** Issuer chosen on Folha for this person/month — used as default on closing approve. */
export async function getPayrollInvoiceIssuerIdForDeveloperMonth(input: {
  developerId: string;
  yearMonth: string;
}): Promise<string | null> {
  const item = await getPayrollItemForDeveloperMonth(input);
  return item?.invoice_issuer_id ?? null;
}

/**
 * Folha lines marked "conferido" in a calendar year.
 * Used to filter the gestor Fechamentos matrix / queue.
 */
export async function listPayrollReviewedDeveloperMonthsForYear(input: {
  year: number;
  teamId?: string | null;
}): Promise<{
  developerIds: Set<string>;
  keys: Set<string>;
}> {
  const yearPrefix = `${input.year}-`;
  const supabase = await createClient();

  const { data: closings, error: closingsError } = await supabase
    .from("payroll_month_closings")
    .select("id, year_month")
    .like("year_month", `${yearPrefix}%`);

  if (closingsError) {
    throw new Error(
      `Falha ao listar meses da Folha: ${closingsError.message}`,
    );
  }

  const developerIds = new Set<string>();
  const keys = new Set<string>();
  if (!closings || closings.length === 0) {
    return { developerIds, keys };
  }

  const closingIdToMonth = new Map(
    closings.map((row) => [String(row.id), String(row.year_month)]),
  );
  const closingIds = [...closingIdToMonth.keys()];

  let query = supabase
    .from("payroll_closing_items")
    .select("developer_id, payroll_closing_id")
    .eq("is_reviewed", true)
    .in("payroll_closing_id", closingIds);

  if (input.teamId) {
    query = query.eq("team_id", input.teamId);
  }

  const { data: items, error: itemsError } = await query;
  if (itemsError) {
    throw new Error(
      `Falha ao listar conferidos da Folha: ${itemsError.message}`,
    );
  }

  for (const item of items ?? []) {
    const developerId = String(item.developer_id);
    const yearMonth = closingIdToMonth.get(String(item.payroll_closing_id));
    if (!yearMonth) {
      continue;
    }
    developerIds.add(developerId);
    keys.add(`${developerId}:${yearMonth}`);
  }

  return { developerIds, keys };
}

/** Folha line + presencial days for Gestor×Usuário conferência on closing review. */
export async function getPayrollItemForDeveloperMonth(input: {
  developerId: string;
  yearMonth: string;
}): Promise<PayrollClosingItem | null> {
  const supabase = await createClient();
  const { data: closing, error: closingError } = await supabase
    .from("payroll_month_closings")
    .select("id")
    .eq("year_month", input.yearMonth)
    .maybeSingle();
  if (closingError) {
    throw new Error(`Falha ao carregar folha: ${closingError.message}`);
  }
  if (!closing) {
    return null;
  }

  const { data: item, error: itemError } = await supabase
    .from("payroll_closing_items")
    .select("*")
    .eq("payroll_closing_id", closing.id)
    .eq("developer_id", input.developerId)
    .maybeSingle();
  if (itemError) {
    throw new Error(`Falha ao carregar item da folha: ${itemError.message}`);
  }
  if (!item) {
    return null;
  }

  return mapItem(item as Record<string, unknown>);
}

export async function listPayrollPresencialDaysForItem(
  itemId: string,
): Promise<string[]> {
  const days = await listAttendanceForItem(itemId);
  return days
    .filter((day) => day.day_kind === "presencial")
    .map((day) => day.day_on)
    .sort();
}

/**
 * Re-snapshot compensation (base, hourly rate, travel/meal) onto existing
 * items and recalculate. Used when cadastro changes after the month opened.
 */
export async function syncPayrollItemsFromCompensation(input: {
  yearMonth: string;
  teamId?: string | null;
  /** Drop manual overrides so every amount returns to the calculated value. */
  resetManualOverrides?: boolean;
}): Promise<{ syncedCount: number }> {
  const supabase = await createClient();
  const { data: closingRow, error: closingError } = await supabase
    .from("payroll_month_closings")
    .select("*")
    .eq("year_month", input.yearMonth)
    .maybeSingle();

  if (closingError) {
    throw new Error(`Falha ao carregar folha: ${closingError.message}`);
  }
  if (!closingRow) {
    return { syncedCount: 0 };
  }

  const closing = mapClosing(closingRow as Record<string, unknown>);
  const items = await listItemsForClosing(closing.id);
  const finalizedByDeveloper = await mapFinalizedMonthlyClosingIdsByDeveloper(
    closing.year_month,
  );
  const scoped = (
    input.teamId
      ? items.filter((item) => item.team_id === input.teamId)
      : items
  ).filter((item) => !finalizedByDeveloper.has(item.developer_id));

  if (scoped.length === 0) {
    return { syncedCount: 0 };
  }

  const comps = await listCurrentCompensationsByDeveloperIds(
    scoped.map((item) => item.developer_id),
  );

  let syncedCount = 0;
  for (const item of scoped) {
    const comp = comps.get(item.developer_id);
    if (!comp) {
      continue;
    }

    const patch: Record<string, unknown> = {
      base_amount: comp.base_amount,
      base_type: comp.base_type,
      hourly_rate: comp.hourly_rate,
      contracted_hours_per_day: comp.contracted_hours_per_day,
      contracted_hours_per_month: comp.contracted_hours_per_month,
      daily_travel_amount: comp.daily_travel_amount,
      daily_meal_amount: comp.daily_meal_amount,
    };

    if (input.resetManualOverrides) {
      patch.differential_manual = false;
      patch.travel_manual = false;
      patch.meal_manual = false;
    }

    const { error } = await supabase
      .from("payroll_closing_items")
      .update(patch)
      .eq("id", item.id);

    if (error) {
      throw new Error(
        `Falha ao sincronizar ${item.developer_name}: ${error.message}`,
      );
    }

    await recalculatePayrollItem(item.id);
    syncedCount += 1;
  }

  return { syncedCount };
}

/**
 * Restore auto-calculated amounts for one person: refresh compensation
 * snapshot from cadastro, clear manual flags, then recalculate.
 */
export async function restorePayrollItemCalculatedAmounts(input: {
  itemId: string;
  fields?: PayrollAutoAmountField;
}): Promise<PayrollClosingItem> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("payroll_closing_items")
    .select("*")
    .eq("id", input.itemId)
    .single();

  if (error || !row) {
    throw new Error(`Item não encontrado: ${error?.message ?? ""}`);
  }

  const item = mapItem(row as Record<string, unknown>);
  const fields = input.fields ?? "all";
  const comps = await listCurrentCompensationsByDeveloperIds([
    item.developer_id,
  ]);
  const comp = comps.get(item.developer_id);

  const patch: Record<string, unknown> = {};

  if (comp) {
    patch.base_amount = comp.base_amount;
    patch.base_type = comp.base_type;
    patch.hourly_rate = comp.hourly_rate;
    patch.contracted_hours_per_day = comp.contracted_hours_per_day;
    patch.contracted_hours_per_month = comp.contracted_hours_per_month;
    patch.daily_travel_amount = comp.daily_travel_amount;
    patch.daily_meal_amount = comp.daily_meal_amount;
  }

  if (fields === "all" || fields === "differential") {
    patch.differential_manual = false;
  }
  if (fields === "all" || fields === "travel") {
    patch.travel_manual = false;
  }
  if (fields === "all" || fields === "meal") {
    patch.meal_manual = false;
  }

  if (Object.keys(patch).length > 0) {
    const { error: updateError } = await supabase
      .from("payroll_closing_items")
      .update(patch)
      .eq("id", item.id);

    if (updateError) {
      throw new Error(
        `Falha ao restaurar valores calculados: ${updateError.message}`,
      );
    }
  }

  return recalculatePayrollItem(item.id);
}

export async function updatePayrollItemAmounts(input: {
  itemId: string;
  discountsAmount?: number;
  differentialAmount?: number;
  travelAmount?: number;
  mealAmount?: number;
  invoiceIssuerId?: string | null;
  markDifferentialManual?: boolean;
  markTravelManual?: boolean;
  markMealManual?: boolean;
}): Promise<PayrollClosingItem> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("payroll_closing_items")
    .select("*")
    .eq("id", input.itemId)
    .single();

  if (error || !row) {
    throw new Error(`Item não encontrado: ${error?.message ?? ""}`);
  }

  const item = mapItem(row as Record<string, unknown>);
  const suggested = await suggestPayrollItemAmounts(item);
  const patch: Record<string, unknown> = {};

  if (input.discountsAmount != null) {
    patch.discounts_amount = input.discountsAmount;
  }
  if (input.differentialAmount != null) {
    patch.differential_amount = input.differentialAmount;
    patch.differential_manual =
      input.markDifferentialManual ??
      !sameMoney(input.differentialAmount, suggested.differential);
  }
  if (input.travelAmount != null) {
    patch.travel_amount = input.travelAmount;
    patch.travel_manual =
      input.markTravelManual ??
      !sameMoney(input.travelAmount, suggested.travel);
  }
  if (input.mealAmount != null) {
    patch.meal_amount = input.mealAmount;
    patch.meal_manual =
      input.markMealManual ?? !sameMoney(input.mealAmount, suggested.meal);
  }
  if (input.invoiceIssuerId !== undefined) {
    patch.invoice_issuer_id = input.invoiceIssuerId;
  }

  const discounts =
    input.discountsAmount ?? item.discounts_amount;
  const differential =
    input.differentialAmount ?? item.differential_amount;
  const travel = input.travelAmount ?? item.travel_amount;
  const meal = input.mealAmount ?? item.meal_amount;

  patch.invoice_amount = computeInvoiceAmount({
    baseAmount: item.base_amount,
    differentialAmount: differential,
    discountsAmount: discounts,
    travelAmount: travel,
    mealAmount: meal,
  });

  // Only invalidate "conferido" when money fields actually change.
  // Saving only Empresa NF (or re-saving the same amounts) keeps the review.
  const amountsChanged =
    !sameMoney(discounts, item.discounts_amount) ||
    !sameMoney(differential, item.differential_amount) ||
    !sameMoney(travel, item.travel_amount) ||
    !sameMoney(meal, item.meal_amount);

  if (amountsChanged && item.is_reviewed) {
    patch.is_reviewed = false;
    patch.reviewed_at = null;
    patch.reviewed_by = null;
  }

  if (Object.keys(patch).length === 0) {
    return item;
  }

  // Mark month as in progress when editing.
  await supabase
    .from("payroll_month_closings")
    .update({ status: "in_progress" })
    .eq("id", item.payroll_closing_id)
    .eq("status", "open");

  const { data: updated, error: updateError } = await supabase
    .from("payroll_closing_items")
    .update(patch)
    .eq("id", input.itemId)
    .select("*")
    .single();

  if (updateError) {
    throw new Error(`Falha ao atualizar item: ${updateError.message}`);
  }

  return mapItem(updated as Record<string, unknown>);
}

export async function upsertPayrollAttendanceDay(input: {
  itemId: string;
  dayOn: string;
  dayKind: PayrollAttendanceKind;
  hours: number;
}): Promise<PayrollAttendanceDay> {
  const supabase = await createClient();
  const hours =
    input.dayKind === "presencial" || input.dayKind === "home"
      ? Math.max(0, input.hours)
      : 0;

  const { data, error } = await supabase
    .from("payroll_attendance_days")
    .upsert(
      {
        payroll_item_id: input.itemId,
        day_on: input.dayOn,
        day_kind: input.dayKind,
        hours,
      },
      { onConflict: "payroll_item_id,day_on" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao salvar presença: ${error.message}`);
  }

  await recalculatePayrollItem(input.itemId);
  return mapAttendance(data as Record<string, unknown>);
}

/** Bulk upsert attendance days, then recalculate the payroll item once. */
export async function batchUpsertPayrollAttendanceDays(input: {
  itemId: string;
  patches: Array<{
    dayOn: string;
    dayKind: PayrollAttendanceKind;
    hours: number;
  }>;
}): Promise<{ updatedCount: number }> {
  if (input.patches.length === 0) {
    return { updatedCount: 0 };
  }

  const supabase = await createClient();
  const rows = input.patches.map((patch) => ({
    payroll_item_id: input.itemId,
    day_on: patch.dayOn,
    day_kind: patch.dayKind,
    hours:
      patch.dayKind === "presencial" || patch.dayKind === "home"
        ? Math.max(0, patch.hours)
        : 0,
  }));

  const { error } = await supabase
    .from("payroll_attendance_days")
    .upsert(rows, { onConflict: "payroll_item_id,day_on" });

  if (error) {
    throw new Error(`Falha ao aplicar presença em lote: ${error.message}`);
  }

  await recalculatePayrollItem(input.itemId);
  return { updatedCount: rows.length };
}

export async function getPayrollItem(
  itemId: string,
): Promise<PayrollClosingItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_closing_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao carregar item: ${error.message}`);
  }
  return data ? mapItem(data as Record<string, unknown>) : null;
}

/** Blocks Folha mutations when payroll month is closed or monthly closing is finalized. */
export async function assertPayrollItemEditable(
  itemId: string,
): Promise<PayrollClosingItem> {
  const item = await getPayrollItem(itemId);
  if (!item) {
    throw new Error("Item da folha não encontrado.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_month_closings")
    .select("year_month, status")
    .eq("id", item.payroll_closing_id)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      `Falha ao validar mês da folha: ${error?.message ?? "não encontrado"}`,
    );
  }

  if (String(data.status) === "closed") {
    throw new Error(
      "A folha deste mês está fechada e não pode ser editada.",
    );
  }

  await assertMonthlyClosingNotFinalizedForPayroll({
    developerId: item.developer_id,
    yearMonth: String(data.year_month),
  });

  return item;
}

export async function updatePayrollClosingStatus(input: {
  closingId: string;
  status: PayrollClosingStatus;
}): Promise<PayrollMonthClosing> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_month_closings")
    .update({ status: input.status })
    .eq("id", input.closingId)
    .select("*")
    .single();
  if (error) {
    throw new Error(`Falha ao atualizar status da folha: ${error.message}`);
  }
  return mapClosing(data as Record<string, unknown>);
}
