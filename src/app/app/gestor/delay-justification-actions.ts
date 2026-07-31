"use server";

import { revalidatePath } from "next/cache";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { decideDelayJustification } from "@/services/delay-justifications";

export type DecideDelayJustificationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function decideDelayJustificationAction(input: {
  requestId: string;
  decision: "accepted" | "rejected";
  reviewerNote: string;
}): Promise<DecideDelayJustificationResult> {
  try {
    const { profile } = await requireTeamAccess();

    const note = input.reviewerNote.trim();
    if (!note) {
      return { ok: false, error: "A nota do gestor é obrigatória." };
    }
    if (!input.requestId.trim()) {
      return { ok: false, error: "Pedido inválido." };
    }
    if (input.decision !== "accepted" && input.decision !== "rejected") {
      return { ok: false, error: "Decisão inválida." };
    }

    await decideDelayJustification({
      requestId: input.requestId,
      decision: input.decision,
      reviewerNote: note,
      reviewerProfileId: profile.id,
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
          : "Não foi possível registrar a decisão.",
    };
  }
}
