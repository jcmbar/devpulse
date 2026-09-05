"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/permissions";
import { upsertInvoiceIssuer } from "@/services/invoice-issuers";
import { listApplicableHolidayDatesForDeveloperMonth } from "@/services/holidays";
import {
  batchUpsertPayrollAttendanceDays,
  assertPayrollItemEditable,
  getPayrollItem,
  listAttendanceForItem,
  restorePayrollItemCalculatedAmounts,
  setPayrollItemReviewed,
  setPayrollItemInvoiceIssuer,
  syncPayrollItemsFromCompensation,
  updatePayrollClosingStatus,
  updatePayrollItemAmounts,
  upsertPayrollAttendanceDay,
} from "@/services/payroll";
import {
  resolveBatchTargetDays,
  resolveFillMonthDefaultPatches,
  resolveWorkweekKindPatches,
  resolveZeroWeekendPatches,
  type BatchApplyMode,
} from "@/lib/metrics/payroll-attendance-batch";
import {
  PAYROLL_ATTENDANCE_KINDS,
  PAYROLL_CLOSING_STATUSES,
  type PayrollAttendanceKind,
  type PayrollAttendanceDay,
  type PayrollAutoAmountField,
  type PayrollClosingStatus,
} from "@/types/payroll-closing";

export type PayrollFormState = {
  error: string | null;
  success: string | null;
};

function parseMoney(
  raw: string,
  label: string,
  options?: { allowNegative?: boolean },
): { ok: true; value: number } | { ok: false; error: string } {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) {
    return { ok: false, error: `Informe ${label}.` };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return { ok: false, error: `${label} deve ser um número válido.` };
  }
  if (!options?.allowNegative && value < 0) {
    return { ok: false, error: `${label} deve ser um número ≥ 0.` };
  }
  return { ok: true, value };
}

function revalidateFolha() {
  revalidatePath("/app/gestor/folha");
  revalidatePath("/app/gestor/folha/empresas");
}

export async function updatePayrollItemAction(
  _prev: PayrollFormState,
  formData: FormData,
): Promise<PayrollFormState> {
  await requirePermission("gestor", "edit");

  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!itemId) {
    return { error: "Item inválido.", success: null };
  }

  const discounts = parseMoney(
    String(formData.get("discountsAmount") ?? "0"),
    "os descontos",
  );
  if (!discounts.ok) {
    return { error: discounts.error, success: null };
  }

  const differential = parseMoney(
    String(formData.get("differentialAmount") ?? "0"),
    "o diferencial",
    { allowNegative: true },
  );
  if (!differential.ok) {
    return { error: differential.error, success: null };
  }

  const travel = parseMoney(
    String(formData.get("travelAmount") ?? "0"),
    "o deslocamento",
  );
  if (!travel.ok) {
    return { error: travel.error, success: null };
  }

  const meal = parseMoney(
    String(formData.get("mealAmount") ?? "0"),
    "a refeição",
  );
  if (!meal.ok) {
    return { error: meal.error, success: null };
  }

  const issuerRaw = String(formData.get("invoiceIssuerId") ?? "").trim();
  const invoiceIssuerId = issuerRaw.length > 0 ? issuerRaw : null;

  try {
    await assertPayrollItemEditable(itemId);
    await updatePayrollItemAmounts({
      itemId,
      discountsAmount: discounts.value,
      differentialAmount: differential.value,
      travelAmount: travel.value,
      mealAmount: meal.value,
      invoiceIssuerId,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o item.",
      success: null,
    };
  }

  revalidateFolha();
  return { error: null, success: "Linha atualizada." };
}

export async function upsertAttendanceDayAction(input: {
  itemId: string;
  dayOn: string;
  dayKind: string;
  /** Optional — server derives contracted hours (or 0) from day kind. */
  hours?: number;
  chargesMeal?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission("gestor", "edit");

  if (
    !(PAYROLL_ATTENDANCE_KINDS as readonly string[]).includes(input.dayKind)
  ) {
    return { ok: false, error: "Tipo de dia inválido." };
  }

  if (input.dayKind === "holiday") {
    return {
      ok: false,
      error:
        "Feriado é só referência visual. Use Presencial, Home, Falta ou Fim de semana.",
    };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dayOn)) {
    return { ok: false, error: "Data inválida." };
  }

  try {
    await assertPayrollItemEditable(input.itemId);
    const payrollItem = await getPayrollItem(input.itemId);
    if (!payrollItem) {
      return { ok: false, error: "Item da folha não encontrado." };
    }
    const dayKind = input.dayKind as PayrollAttendanceKind;
    const hours =
      input.hours != null && Number.isFinite(input.hours)
        ? Math.max(0, input.hours)
        : dayKind === "presencial" || dayKind === "home"
          ? Math.max(0, payrollItem.contracted_hours_per_day)
          : 0;
    await upsertPayrollAttendanceDay({
      itemId: input.itemId,
      dayOn: input.dayOn,
      dayKind,
      hours,
      chargesMeal: input.chargesMeal,
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a presença.",
    };
  }

  revalidateFolha();
  return { ok: true };
}

export async function commitAttendanceDraftAction(input: {
  itemId: string;
  patches: Array<{
    dayOn: string;
    dayKind: string;
    hours?: number;
    chargesMeal?: boolean;
  }>;
}): Promise<
  { ok: true; updatedCount: number } | { ok: false; error: string }
> {
  await requirePermission("gestor", "edit");

  if (!Array.isArray(input.patches) || input.patches.length === 0) {
    return { ok: true, updatedCount: 0 };
  }

  try {
    await assertPayrollItemEditable(input.itemId);
    const existing = await listAttendanceForItem(input.itemId);
    if (existing.length === 0) {
      return { ok: false, error: "Calendário de presença ainda não gerado." };
    }
    const allowedDates = new Set(existing.map((day) => day.day_on));
    const payrollItem = await getPayrollItem(input.itemId);
    if (!payrollItem) {
      return { ok: false, error: "Item da folha não encontrado." };
    }

    const patches: Array<{
      dayOn: string;
      dayKind: PayrollAttendanceKind;
      hours: number;
      chargesMeal: boolean;
    }> = [];

    for (const patch of input.patches) {
      if (!allowedDates.has(patch.dayOn)) {
        return { ok: false, error: "Data fora do calendário do mês." };
      }
      if (
        !(PAYROLL_ATTENDANCE_KINDS as readonly string[]).includes(patch.dayKind)
      ) {
        return { ok: false, error: "Tipo de dia inválido." };
      }
      if (patch.dayKind === "holiday") {
        return {
          ok: false,
          error:
            "Feriado é só referência visual. Use Presencial, Home, Falta ou Fim de semana.",
        };
      }
      const dayKind = patch.dayKind as PayrollAttendanceKind;
      const hours =
        patch.hours != null && Number.isFinite(patch.hours)
          ? Math.max(0, patch.hours)
          : dayKind === "presencial" || dayKind === "home"
            ? Math.max(0, payrollItem.contracted_hours_per_day)
            : 0;
      patches.push({
        dayOn: patch.dayOn,
        dayKind,
        hours,
        chargesMeal:
          patch.chargesMeal ?? dayKind === "presencial",
      });
    }

    const result = await batchUpsertPayrollAttendanceDays({
      itemId: input.itemId,
      patches,
    });
    revalidateFolha();
    return { ok: true, updatedCount: result.updatedCount };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a presença.",
    };
  }
}

export async function batchApplyAttendanceAction(input: {
  itemId: string;
  shortcut?:
    | "fill_month_default"
    | "workweek_home"
    | "workweek_presencial"
    | "zero_weekends"
    | null;
  dayKind?: string;
  hours?: number;
  weekdays?: number[];
  rangeStart?: string | null;
  rangeEnd?: string | null;
  mode?: BatchApplyMode;
}): Promise<
  | { ok: true; updatedCount: number }
  | { ok: false; error: string }
> {
  await requirePermission("gestor", "edit");

  try {
    await assertPayrollItemEditable(input.itemId);
    const existing = await listAttendanceForItem(input.itemId);
    if (existing.length === 0) {
      return { ok: false, error: "Calendário de presença ainda não gerado." };
    }

    const payrollItem = await getPayrollItem(input.itemId);
    if (!payrollItem) {
      return { ok: false, error: "Item da folha não encontrado." };
    }

    const contracted = payrollItem.contracted_hours_per_day;
    const snapshots = existing.map((day) => ({
      day_on: day.day_on,
      day_kind: day.day_kind,
      hours: day.hours,
    }));

    let patches;
    switch (input.shortcut) {
      case "fill_month_default": {
        patches = resolveFillMonthDefaultPatches({
          days: snapshots,
          contractedHoursPerDay: contracted,
        });
        break;
      }
      case "workweek_home":
        patches = resolveWorkweekKindPatches({
          days: snapshots,
          dayKind: "home",
          contractedHoursPerDay: contracted,
          rangeStart: input.rangeStart,
          rangeEnd: input.rangeEnd,
        });
        break;
      case "workweek_presencial":
        patches = resolveWorkweekKindPatches({
          days: snapshots,
          dayKind: "presencial",
          contractedHoursPerDay: contracted,
          rangeStart: input.rangeStart,
          rangeEnd: input.rangeEnd,
        });
        break;
      case "zero_weekends":
        patches = resolveZeroWeekendPatches({
          days: snapshots,
          rangeStart: input.rangeStart,
          rangeEnd: input.rangeEnd,
        });
        break;
      default: {
        const dayKind = String(input.dayKind ?? "");
        if (
          !(PAYROLL_ATTENDANCE_KINDS as readonly string[]).includes(dayKind)
        ) {
          return { ok: false, error: "Tipo de dia inválido." };
        }
        if (dayKind === "holiday") {
          return {
            ok: false,
            error:
              "Feriado é só referência visual. Use Presencial, Home, Falta ou Fim de semana.",
          };
        }
        const hours =
          input.hours == null || !Number.isFinite(input.hours)
            ? dayKind === "presencial" || dayKind === "home"
              ? contracted
              : 0
            : input.hours;
        if (hours < 0) {
          return { ok: false, error: "Horas inválidas." };
        }
        const mode: BatchApplyMode =
          input.mode === "fill_unfilled" ? "fill_unfilled" : "overwrite";
        patches = resolveBatchTargetDays({
          days: snapshots,
          dayKind: dayKind as PayrollAttendanceKind,
          hours,
          weekdays: input.weekdays ?? [],
          rangeStart: input.rangeStart ?? null,
          rangeEnd: input.rangeEnd ?? null,
          mode,
          contractedHoursPerDay: contracted,
        });
        break;
      }
    }

    const result = await batchUpsertPayrollAttendanceDays({
      itemId: input.itemId,
      patches,
    });

    revalidateFolha();
    return { ok: true, updatedCount: result.updatedCount };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível aplicar a presença em lote.",
    };
  }
}

export async function listAttendanceAction(
  itemId: string,
): Promise<
  | { ok: true; days: PayrollAttendanceDay[] }
  | { ok: false; error: string }
> {
  await requirePermission("gestor", "edit");
  try {
    const days = await listAttendanceForItem(itemId);
    return { ok: true, days };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Falha ao carregar presença.",
    };
  }
}

export async function loadPayrollAttendanceCalendarAction(input: {
  itemId: string;
  developerId: string;
  yearMonth: string;
}): Promise<
  | {
      ok: true;
      days: PayrollAttendanceDay[];
      holidays: Array<{ date: string; name: string }>;
    }
  | { ok: false; error: string }
> {
  await requirePermission("gestor", "edit");
  try {
    const [days, holidayResult] = await Promise.all([
      listAttendanceForItem(input.itemId),
      listApplicableHolidayDatesForDeveloperMonth({
        developerId: input.developerId,
        yearMonth: input.yearMonth,
      }),
    ]);
    return {
      ok: true,
      days,
      holidays: [...holidayResult.byDate.entries()].map(([date, name]) => ({
        date,
        name,
      })),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Falha ao carregar presença.",
    };
  }
}

export async function setPayrollItemReviewedAction(input: {
  itemId: string;
  reviewed: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile } = await requirePermission("gestor", "edit");

  const itemId = input.itemId.trim();
  if (!itemId) {
    return { ok: false, error: "Item inválido." };
  }

  try {
    await assertPayrollItemEditable(itemId);
    await setPayrollItemReviewed({
      itemId,
      reviewed: input.reviewed,
      reviewedBy: profile.id,
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar a conferência.",
    };
  }

  revalidateFolha();
  return { ok: true };
}

export async function setPayrollItemInvoiceIssuerAction(input: {
  itemId: string;
  invoiceIssuerId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission("gestor", "edit");

  const itemId = input.itemId.trim();
  if (!itemId) {
    return { ok: false, error: "Item inválido." };
  }

  try {
    await assertPayrollItemEditable(itemId);
    await setPayrollItemInvoiceIssuer({
      itemId,
      invoiceIssuerId: input.invoiceIssuerId,
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a empresa da NF.",
    };
  }

  revalidateFolha();
  return { ok: true };
}

export async function restorePayrollItemCalculatedAction(input: {
  itemId: string;
  fields?: PayrollAutoAmountField;
  /** Hours already shown on the Folha row — skips Compilado re-resolve. */
  jiraHours?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission("gestor", "edit");

  const itemId = input.itemId.trim();
  if (!itemId) {
    return { ok: false, error: "Item inválido." };
  }

  const fields = input.fields ?? "all";
  if (
    fields !== "all" &&
    fields !== "differential" &&
    fields !== "travel" &&
    fields !== "meal"
  ) {
    return { ok: false, error: "Campo inválido." };
  }

  try {
    await assertPayrollItemEditable(itemId);
    await restorePayrollItemCalculatedAmounts({
      itemId,
      fields,
      jiraHours:
        input.jiraHours != null && Number.isFinite(input.jiraHours)
          ? input.jiraHours
          : undefined,
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível restaurar os valores calculados.",
    };
  }

  revalidateFolha();
  return { ok: true };
}

export async function syncPayrollFromCompensationAction(input: {
  yearMonth: string;
  teamId?: string | null;
}): Promise<
  { ok: true; syncedCount: number } | { ok: false; error: string }
> {
  await requirePermission("gestor", "edit");

  if (!/^\d{4}-\d{2}$/.test(input.yearMonth)) {
    return { ok: false, error: "Mês inválido." };
  }

  try {
    const result = await syncPayrollItemsFromCompensation({
      yearMonth: input.yearMonth,
      teamId: input.teamId ?? null,
      // Preserve manual overrides; only "Restaurar" clears them.
      resetManualOverrides: false,
    });
    revalidateFolha();
    return { ok: true, syncedCount: result.syncedCount };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível sincronizar com o cadastro.",
    };
  }
}

export async function updatePayrollMonthStatusAction(input: {
  closingId: string;
  status: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermission("gestor", "edit");

  if (
    !(PAYROLL_CLOSING_STATUSES as readonly string[]).includes(input.status)
  ) {
    return { ok: false, error: "Status inválido." };
  }

  try {
    await updatePayrollClosingStatus({
      closingId: input.closingId,
      status: input.status as PayrollClosingStatus,
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o status.",
    };
  }

  revalidateFolha();
  return { ok: true };
}

export async function upsertInvoiceIssuerAction(
  _prev: PayrollFormState,
  formData: FormData,
): Promise<PayrollFormState> {
  await requirePermission("gestor", "edit");

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const legalName = String(formData.get("legalName") ?? "").trim();
  const cnpj = String(formData.get("cnpj") ?? "").trim();
  const isActive = String(formData.get("isActive") ?? "true") === "true";

  try {
    await upsertInvoiceIssuer({
      id,
      legalName,
      cnpj,
      stateRegistration: String(formData.get("stateRegistration") ?? "").trim() || null,
      municipalRegistration:
        String(formData.get("municipalRegistration") ?? "").trim() || null,
      addressStreet: String(formData.get("addressStreet") ?? "").trim() || null,
      addressNeighborhood:
        String(formData.get("addressNeighborhood") ?? "").trim() || null,
      addressCep: String(formData.get("addressCep") ?? "").trim() || null,
      addressCity: String(formData.get("addressCity") ?? "").trim() || null,
      addressUf: String(formData.get("addressUf") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      isActive,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a empresa.",
      success: null,
    };
  }

  revalidateFolha();
  return { error: null, success: "Empresa salva." };
}
