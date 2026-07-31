"use server";

import { revalidatePath } from "next/cache";
import { getAppContext } from "@/lib/auth/app-context";
import { getCardDeliveryFlags } from "@/lib/metrics/developer-period";
import { submitDelayJustification } from "@/services/delay-justifications";
import { getJiraCardById } from "@/services/jira-cards";

export type SubmitDelayJustificationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function submitDelayJustificationAction(input: {
  importId: string;
  jiraCardId: string;
  developerNote: string;
}): Promise<SubmitDelayJustificationResult> {
  try {
    const { profile, developer } = await getAppContext();
    if (!developer) {
      return { ok: false, error: "Developer não vinculado ao perfil." };
    }

    const note = input.developerNote.trim();
    if (!note) {
      return { ok: false, error: "A justificativa é obrigatória." };
    }
    if (!input.importId.trim() || !input.jiraCardId.trim()) {
      return { ok: false, error: "Card ou lote inválido." };
    }

    const card = await getJiraCardById(input.jiraCardId);
    if (!card) {
      return { ok: false, error: "Card não encontrado." };
    }
    if (card.developer_id !== developer.id) {
      return { ok: false, error: "Você só pode justificar seus próprios cards." };
    }
    if (card.import_id !== input.importId) {
      return { ok: false, error: "O card não pertence ao lote selecionado." };
    }

    const flags = getCardDeliveryFlags(card);
    if (flags.isDelayed !== true) {
      return {
        ok: false,
        error: "Só é possível justificar cards com atraso bruto neste lote.",
      };
    }

    await submitDelayJustification({
      importId: input.importId,
      jiraCardId: card.id,
      jiraKey: card.jira_key,
      developerId: developer.id,
      dueOn: card.due_on,
      unitTestDeliveryOn: card.unit_test_delivery_on,
      delayDays: card.delay_days,
      developerNote: note,
      requesterProfileId: profile.id,
    });

    revalidatePath("/app");
    revalidatePath("/app/gestor");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível enviar a justificativa.",
    };
  }
}
