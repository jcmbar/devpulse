import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
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

const STG_STATUS_LABELS: Record<string, string> = {
  draft: "rascunho",
  planned: "planejada",
  in_progress: "em andamento",
  reviewing: "em revisão",
  closed: "encerrada",
};

async function resolveStgParticipantProfileIds(
  sessionId: string,
): Promise<string[]> {
  const admin = createAdminClient();
  const { data: participants, error } = await admin
    .from("stg_session_participants")
    .select("developer_id, participation")
    .eq("session_id", sessionId)
    .neq("participation", "excluded");

  if (error) {
    throw new Error(`Falha ao listar participantes STG: ${error.message}`);
  }

  const developerIds = [
    ...new Set(
      (participants ?? [])
        .map((row) => String(row.developer_id ?? ""))
        .filter(Boolean),
    ),
  ];
  if (developerIds.length === 0) {
    return [];
  }

  const { data: developers, error: developersError } = await admin
    .from("developers")
    .select("id, profile_id")
    .in("id", developerIds)
    .not("profile_id", "is", null);

  if (developersError) {
    throw new Error(
      `Falha ao resolver perfis STG: ${developersError.message}`,
    );
  }

  return [
    ...new Set(
      (developers ?? [])
        .map((row) =>
          typeof row.profile_id === "string" ? row.profile_id : null,
        )
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

export async function notifyStgSessionOpened(input: {
  sessionId: string;
  versionLabel: string;
  scheduledOn: string;
  actorUserId?: string | null;
}): Promise<void> {
  try {
    const settings = await getNotificationSettingsAdmin();
    if (!settings.stg_status_enabled) {
      return;
    }
    const recipientProfileIds = await resolveStgParticipantProfileIds(
      input.sessionId,
    );
    if (recipientProfileIds.length === 0) {
      return;
    }
    const dateLabel = new Date(
      `${input.scheduledOn}T12:00:00.000Z`,
    ).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      timeZone: "UTC",
    });
    await notifyProfiles({
      recipientProfileIds,
      title: "Sessão STG aberta",
      body: `A sessão ${input.versionLabel} foi aberta para ${dateLabel}. Confira cenários e sua participação.`,
      href: `/app/stg/${input.sessionId}`,
      triggerType: "stg_status",
      actorUserId: input.actorUserId ?? null,
      metadata: {
        sessionId: input.sessionId,
        event: "opened",
        versionLabel: input.versionLabel,
        scheduledOn: input.scheduledOn,
      },
    });
  } catch (error) {
    console.error("[notifications] STG opened notify failed:", error);
  }
}

export async function notifyStgSessionStatusChange(input: {
  sessionId: string;
  versionLabel: string;
  fromStatus: string;
  toStatus: string;
  actorUserId?: string | null;
}): Promise<void> {
  try {
    const settings = await getNotificationSettingsAdmin();
    if (!settings.stg_status_enabled) {
      return;
    }
    if (input.fromStatus === input.toStatus) {
      return;
    }
    const recipientProfileIds = await resolveStgParticipantProfileIds(
      input.sessionId,
    );
    if (recipientProfileIds.length === 0) {
      return;
    }

    const toLabel = STG_STATUS_LABELS[input.toStatus] ?? input.toStatus;
    let title = "Status da sessão STG";
    let body = `A sessão ${input.versionLabel} agora está ${toLabel}.`;
    if (input.toStatus === "in_progress") {
      title = "Staging Day em andamento";
      body = `A sessão ${input.versionLabel} começou. Acesse para registrar suas execuções.`;
    } else if (input.toStatus === "closed") {
      title = "Sessão STG encerrada";
      body = `A sessão ${input.versionLabel} foi encerrada.`;
    } else if (input.toStatus === "reviewing") {
      title = "Sessão STG em revisão";
      body = `A sessão ${input.versionLabel} entrou em revisão.`;
    }

    await notifyProfiles({
      recipientProfileIds,
      title,
      body,
      href: `/app/stg/${input.sessionId}`,
      triggerType: "stg_status",
      actorUserId: input.actorUserId ?? null,
      metadata: {
        sessionId: input.sessionId,
        event: "status_change",
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        versionLabel: input.versionLabel,
      },
    });
  } catch (error) {
    console.error("[notifications] STG status notify failed:", error);
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
