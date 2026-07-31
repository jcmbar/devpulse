"use server";

import { revalidatePath } from "next/cache";
import { getAppContext } from "@/lib/auth/app-context";
import {
  startMonthlyClosing,
  submitMonthlyClosingForReview,
} from "@/services/monthly-closings";

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
      return { ok: false, error: "Selecione um mês/ano para iniciar o fechamento." };
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
}): Promise<MonthlyClosingActionResult> {
  try {
    const { profile, developer } = await getAppContext();
    if (!developer) {
      return { ok: false, error: "Developer não vinculado ao perfil." };
    }
    if (!input.closingId.trim() || !input.importId.trim()) {
      return { ok: false, error: "Fechamento ou lote inválido." };
    }

    const closing = await submitMonthlyClosingForReview({
      closingId: input.closingId,
      developerId: developer.id,
      importId: input.importId,
      sourceMode: input.sourceMode ?? "auto",
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
          : "Não foi possível enviar o fechamento.",
    };
  }
}
