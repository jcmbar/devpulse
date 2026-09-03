"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/permissions";
import { getAppContext } from "@/lib/auth/app-context";
import {
  createManualNotificationCampaign,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationSettings,
} from "@/services/notifications";
import {
  deletePushSubscription,
  upsertPushSubscription,
} from "@/services/notifications/web-push";
import type { NotificationAudienceType } from "@/types/notification";
import { headers } from "next/headers";

export async function markNotificationReadAction(notificationId: string) {
  const context = await getAppContext();
  await markNotificationRead({
    notificationId,
    profileId: context.profile.id,
  });
  revalidatePath("/app");
  revalidatePath("/app/notificacoes");
}

export async function markAllNotificationsReadAction() {
  const context = await getAppContext();
  await markAllNotificationsRead(context.profile.id);
  revalidatePath("/app");
  revalidatePath("/app/notificacoes");
}

export async function notifyPasswordChangedAction() {
  const context = await getAppContext();
  const { getNotificationSettingsAdmin, notifyProfiles } = await import(
    "@/services/notifications"
  );
  const settings = await getNotificationSettingsAdmin();
  if (!settings.password_changed_enabled) {
    return;
  }
  await notifyProfiles({
    recipientProfileIds: [context.profile.id],
    title: "Senha alterada",
    body: "Sua senha foi atualizada com sucesso. Se você não fez essa alteração, fale com o administrador imediatamente.",
    href: "/app/conta",
    triggerType: "password_changed",
    actorUserId: context.profile.id,
  });
  revalidatePath("/app");
  revalidatePath("/app/notificacoes");
}

export async function createManualNotificationAction(formData: FormData) {
  const context = await requirePermission("notificacoes", "edit");
  const title = String(formData.get("title") ?? "");
  const body = String(formData.get("body") ?? "");
  const href = String(formData.get("href") ?? "").trim() || null;
  const audienceType = String(
    formData.get("audienceType") ?? "users",
  ) as NotificationAudienceType;
  const teamIds = formData
    .getAll("teamIds")
    .map((value) => String(value))
    .filter(Boolean);
  const profileIds = formData
    .getAll("profileIds")
    .map((value) => String(value))
    .filter(Boolean);

  await createManualNotificationCampaign({
    title,
    body,
    href,
    audienceType,
    teamIds,
    profileIds,
    actorUserId: context.profile.id,
  });

  revalidatePath("/app/gestor/notificacoes");
  revalidatePath("/app");
  revalidatePath("/app/notificacoes");
}

export async function updateNotificationSettingsAction(formData: FormData) {
  await requirePermission("notificacoes", "edit");
  await updateNotificationSettings({
    closingPendingAfterDay: Number(formData.get("closingPendingAfterDay")),
    holidayReminderDaysBefore: Number(
      formData.get("holidayReminderDaysBefore"),
    ),
    closingPendingEnabled: formData.get("closingPendingEnabled") === "on",
    justificationDecisionEnabled:
      formData.get("justificationDecisionEnabled") === "on",
    closingStatusEnabled: formData.get("closingStatusEnabled") === "on",
    passwordChangedEnabled: formData.get("passwordChangedEnabled") === "on",
    stgStatusEnabled: formData.get("stgStatusEnabled") === "on",
    holidayUpcomingEnabled: formData.get("holidayUpcomingEnabled") === "on",
    webPushEnabled: formData.get("webPushEnabled") === "on",
  });
  revalidatePath("/app/gestor/notificacoes");
}

export async function savePushSubscriptionAction(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<{ error: string | null }> {
  try {
    const context = await getAppContext();
    const headerStore = await headers();
    await upsertPushSubscription({
      profileId: context.profile.id,
      subscription: input,
      userAgent: headerStore.get("user-agent"),
    });
    revalidatePath("/app/notificacoes");
    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a inscrição push.",
    };
  }
}

export async function removePushSubscriptionAction(
  endpoint: string,
): Promise<{ error: string | null }> {
  try {
    const context = await getAppContext();
    await deletePushSubscription({
      profileId: context.profile.id,
      endpoint,
    });
    revalidatePath("/app/notificacoes");
    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível remover a inscrição push.",
    };
  }
}
