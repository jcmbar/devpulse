import "server-only";

import {
  getNotificationSettingsAdmin,
  notifyProfiles,
  resolveProfileIdForDeveloper,
} from "@/services/notifications";

function yearMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function notifyJustificationDecision(input: {
  developerId: string;
  jiraKey: string;
  kind: "delay" | "rework";
  decision: "accepted" | "rejected";
  actorUserId: string;
}): Promise<void> {
  try {
    const settings = await getNotificationSettingsAdmin();
    if (!settings.justification_decision_enabled) {
      return;
    }
    const profileId = await resolveProfileIdForDeveloper(input.developerId);
    if (!profileId) {
      return;
    }
    const kindLabel =
      input.kind === "delay" ? "atraso" : "retrabalho";
    const decisionLabel =
      input.decision === "accepted" ? "aceita" : "recusada";
    await notifyProfiles({
      recipientProfileIds: [profileId],
      title: `Justificativa ${decisionLabel}`,
      body: `Sua justificativa de ${kindLabel} no card ${input.jiraKey} foi ${decisionLabel}.`,
      href: "/app?tab=cards",
      triggerType: "justification_decided",
      actorUserId: input.actorUserId,
      metadata: {
        developerId: input.developerId,
        jiraKey: input.jiraKey,
        kind: input.kind,
        decision: input.decision,
      },
    });
  } catch (error) {
    console.error(
      "[notifications] justification decision notify failed:",
      error,
    );
  }
}

export async function notifyClosingStatusChange(input: {
  developerId: string;
  closingId: string;
  yearMonth: string;
  fromStatus: string;
  toStatus: string;
  actorUserId: string;
}): Promise<void> {
  try {
    const settings = await getNotificationSettingsAdmin();
    if (!settings.closing_status_enabled) {
      return;
    }
    const profileId = await resolveProfileIdForDeveloper(input.developerId);
    if (!profileId) {
      return;
    }

    const period = yearMonthLabel(input.yearMonth);
    let title = "Atualização no fechamento";
    let body = `O status do fechamento de ${period} mudou de ${input.fromStatus} para ${input.toStatus}.`;

    if (input.toStatus === "closed" && input.fromStatus === "in_review") {
      title = "Fechamento aprovado";
      body = `Seu fechamento de ${period} foi aprovado pelo gestor.`;
    } else if (input.toStatus === "rejected") {
      title = "Fechamento reprovado";
      body = `Seu fechamento de ${period} foi reprovado. Abra o detalhe para ver a observação do gestor.`;
    } else if (input.toStatus === "finalized") {
      title = "Fechamento finalizado";
      body = `Seu fechamento de ${period} foi finalizado.`;
    } else if (input.fromStatus === "finalized" && input.toStatus === "closed") {
      title = "Fechamento reaberto";
      body = `Seu fechamento de ${period} foi reaberto após a finalização.`;
    } else if (input.toStatus === "in_review" || input.toStatus === "open") {
      title = "Status do fechamento alterado";
      body = `Atenção: o fechamento de ${period} voltou para ${input.toStatus === "open" ? "aberto" : "em revisão"}.`;
    }

    await notifyProfiles({
      recipientProfileIds: [profileId],
      title,
      body,
      href: `/app?tab=fechamentos&detailMonth=${encodeURIComponent(input.yearMonth)}`,
      triggerType: "closing_status",
      actorUserId: input.actorUserId,
      metadata: {
        closingId: input.closingId,
        yearMonth: input.yearMonth,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
      },
    });
  } catch (error) {
    console.error("[notifications] closing status notify failed:", error);
  }
}
