"use server";

import { revalidatePath } from "next/cache";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { upsertInvoiceIssuer } from "@/services/invoice-issuers";
import {
  listAttendanceForItem,
  updatePayrollClosingStatus,
  updatePayrollItemAmounts,
  upsertPayrollAttendanceDay,
} from "@/services/payroll";
import {
  PAYROLL_ATTENDANCE_KINDS,
  PAYROLL_CLOSING_STATUSES,
  type PayrollAttendanceKind,
  type PayrollAttendanceDay,
  type PayrollClosingStatus,
} from "@/types/payroll-closing";

export type PayrollFormState = {
  error: string | null;
  success: string | null;
};

function parseMoney(
  raw: string,
  label: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) {
    return { ok: false, error: `Informe ${label}.` };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) {
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
  await requireTeamAccess();

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
    await updatePayrollItemAmounts({
      itemId,
      discountsAmount: discounts.value,
      differentialAmount: differential.value,
      travelAmount: travel.value,
      mealAmount: meal.value,
      invoiceIssuerId,
      markDifferentialManual: true,
      markTravelManual: true,
      markMealManual: true,
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
  hours: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireTeamAccess();

  if (
    !(PAYROLL_ATTENDANCE_KINDS as readonly string[]).includes(input.dayKind)
  ) {
    return { ok: false, error: "Tipo de dia inválido." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dayOn)) {
    return { ok: false, error: "Data inválida." };
  }

  try {
    await upsertPayrollAttendanceDay({
      itemId: input.itemId,
      dayOn: input.dayOn,
      dayKind: input.dayKind as PayrollAttendanceKind,
      hours: input.hours,
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

export async function listAttendanceAction(
  itemId: string,
): Promise<
  | { ok: true; days: PayrollAttendanceDay[] }
  | { ok: false; error: string }
> {
  await requireTeamAccess();
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

export async function updatePayrollMonthStatusAction(input: {
  closingId: string;
  status: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireTeamAccess();

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
  await requireTeamAccess();

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
