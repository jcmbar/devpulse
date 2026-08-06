"use server";

import { revalidatePath } from "next/cache";
import { getAppContext } from "@/lib/auth/app-context";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { getCurrentDeveloperCompensation } from "@/services/developers/compensation";
import { assertClosingValuesMatchFolha } from "@/services/closing-folha-compare";
import {
  approveMonthlyClosing,
  createMonthlyClosingAttachmentSignedUrl,
  finalizeMonthlyClosing,
  rejectMonthlyClosing,
  revertMonthlyClosingStatus,
  startMonthlyClosing,
  submitMonthlyClosingForReview,
  uploadMonthlyClosingAttachment,
} from "@/services/monthly-closings";
import type { MonthlyClosingAttachmentType } from "@/types/monthly-closing";

export type MonthlyClosingActionResult =
  | { ok: true; closingId: string }
  | { ok: false; error: string };

export async function startMonthlyClosingAction(input: {
  yearMonth: string;
  importId: string | null;
  sourceMode?: string | null;
}): Promise<MonthlyClosingActionResult> {
  try {
    const { profile, developer } = await getAppContext();
    if (!developer) {
      return { ok: false, error: "Developer não vinculado ao perfil." };
    }
    if (!input.yearMonth.trim()) {
      return {
        ok: false,
        error: "Selecione um mês/ano para iniciar o fechamento.",
      };
    }

    const closing = await startMonthlyClosing({
      developerId: developer.id,
      teamId: developer.team_id,
      yearMonth: input.yearMonth.trim(),
      importId: input.importId,
      sourceMode: input.sourceMode ?? "auto",
      actorUserId: profile.id,
    });

    revalidatePath("/app");
    revalidatePath("/app/gestor");
    return { ok: true, closingId: closing.id };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível iniciar o fechamento.",
    };
  }
}

export async function submitMonthlyClosingAction(input: {
  closingId: string;
  importId: string;
  sourceMode?: string | null;
  developerResubmissionNotes?: string | null;
  travelDays: string[];
  mealDays: string[];
  valuesNotes?: string | null;
  workedHours: number;
}): Promise<MonthlyClosingActionResult> {
  try {
    const { profile, developer } = await getAppContext();
    if (!developer) {
      return { ok: false, error: "Developer não vinculado ao perfil." };
    }
    if (!input.closingId.trim() || !input.importId.trim()) {
      return { ok: false, error: "Fechamento ou lote inválido." };
    }

    const compensation = await getCurrentDeveloperCompensation(developer.id);
    if (!compensation) {
      return {
        ok: false,
        error:
          "Cadastro de valores (compensação) não encontrado. Peça ao gestor para configurar em Developers.",
      };
    }

    const closing = await submitMonthlyClosingForReview({
      closingId: input.closingId,
      developerId: developer.id,
      importId: input.importId,
      sourceMode: input.sourceMode ?? "auto",
      actorUserId: profile.id,
      developerResubmissionNotes: input.developerResubmissionNotes,
      values: {
        travelDays: input.travelDays,
        mealDays: input.mealDays,
        valuesNotes: input.valuesNotes,
        workedHours: input.workedHours,
        compensation: {
          baseAmount: compensation.base_amount,
          baseType: compensation.base_type,
          hourlyRate: compensation.hourly_rate,
          dailyTravelAmount: compensation.daily_travel_amount,
          dailyMealAmount: compensation.daily_meal_amount,
        },
      },
    });

    revalidatePath("/app");
    revalidatePath("/app/gestor");
    revalidatePath(`/app/gestor/fechamentos/${closing.id}`);
    return { ok: true, closingId: closing.id };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível enviar o fechamento.",
    };
  }
}

export async function approveMonthlyClosingAction(input: {
  closingId: string;
  invoiceIssuerId: string;
  managerInvoiceNotes?: string | null;
}): Promise<MonthlyClosingActionResult> {
  try {
    const { profile } = await requireTeamAccess();
    await assertClosingValuesMatchFolha(input.closingId);
    const closing = await approveMonthlyClosing({
      closingId: input.closingId,
      invoiceIssuerId: input.invoiceIssuerId,
      managerInvoiceNotes: input.managerInvoiceNotes,
      actorUserId: profile.id,
    });
    revalidatePath("/app");
    revalidatePath("/app/gestor");
    revalidatePath(`/app/gestor/fechamentos/${closing.id}`);
    return { ok: true, closingId: closing.id };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível aprovar o fechamento.",
    };
  }
}

export async function rejectMonthlyClosingAction(input: {
  closingId: string;
  managerRejectionNotes: string;
}): Promise<MonthlyClosingActionResult> {
  try {
    const { profile } = await requireTeamAccess();
    const closing = await rejectMonthlyClosing({
      closingId: input.closingId,
      managerRejectionNotes: input.managerRejectionNotes,
      actorUserId: profile.id,
    });
    revalidatePath("/app");
    revalidatePath("/app/gestor");
    revalidatePath(`/app/gestor/fechamentos/${closing.id}`);
    return { ok: true, closingId: closing.id };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível reprovar o fechamento.",
    };
  }
}

export async function finalizeMonthlyClosingAction(input: {
  closingId: string;
}): Promise<MonthlyClosingActionResult> {
  try {
    const { profile } = await requireTeamAccess();
    await assertClosingValuesMatchFolha(input.closingId);
    const closing = await finalizeMonthlyClosing({
      closingId: input.closingId,
      actorUserId: profile.id,
    });
    revalidatePath("/app");
    revalidatePath("/app/gestor");
    revalidatePath(`/app/gestor/fechamentos/${closing.id}`);
    return { ok: true, closingId: closing.id };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível finalizar o fechamento.",
    };
  }
}

export async function revertMonthlyClosingStatusAction(input: {
  closingId: string;
}): Promise<MonthlyClosingActionResult> {
  try {
    const { profile } = await requireTeamAccess();
    if (!input.closingId.trim()) {
      return { ok: false, error: "Fechamento inválido." };
    }
    const closing = await revertMonthlyClosingStatus({
      closingId: input.closingId,
      actorUserId: profile.id,
    });
    revalidatePath("/app");
    revalidatePath("/app/gestor");
    revalidatePath("/app/gestor/fechamentos");
    revalidatePath(`/app/gestor/fechamentos/${closing.id}`);
    return { ok: true, closingId: closing.id };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível reabrir/voltar o status do fechamento.",
    };
  }
}

export async function uploadMonthlyClosingAttachmentAction(
  formData: FormData,
): Promise<MonthlyClosingActionResult> {
  try {
    const { profile, developer } = await getAppContext();
    if (!developer) {
      return { ok: false, error: "Developer não vinculado ao perfil." };
    }

    const closingId = String(formData.get("closingId") ?? "").trim();
    const typeRaw = String(formData.get("type") ?? "").trim();
    const type: MonthlyClosingAttachmentType | null =
      typeRaw === "invoice_pdf" || typeRaw === "boleto_pdf" ? typeRaw : null;
    const file = formData.get("file");

    if (!closingId || !type) {
      return { ok: false, error: "Anexo inválido." };
    }
    if (!(file instanceof File)) {
      return { ok: false, error: "Selecione um arquivo PDF." };
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    await uploadMonthlyClosingAttachment({
      closingId,
      developerId: developer.id,
      type,
      file: {
        bytes,
        originalFilename: file.name || `${type}.pdf`,
        mimeType: file.type || "application/pdf",
      },
      actorUserId: profile.id,
    });

    revalidatePath("/app");
    revalidatePath("/app/gestor");
    revalidatePath(`/app/gestor/fechamentos/${closingId}`);
    return { ok: true, closingId };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível enviar o anexo.",
    };
  }
}

export async function getMonthlyClosingAttachmentUrlAction(input: {
  storageKey: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    await getAppContext();
    const url = await createMonthlyClosingAttachmentSignedUrl(input.storageKey);
    return { ok: true, url };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível abrir o anexo.",
    };
  }
}
