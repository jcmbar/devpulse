import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  AppNotification,
  CreateManualNotificationInput,
  NotificationAudienceType,
  NotificationCampaign,
  NotificationSettings,
  NotificationSource,
  NotificationTriggerType,
} from "@/types/notification";

const DEFAULT_SETTINGS: NotificationSettings = {
  closing_pending_after_day: 25,
  holiday_reminder_days_before: 3,
  closing_pending_enabled: true,
  justification_decision_enabled: true,
  closing_status_enabled: true,
  password_changed_enabled: true,
  stg_status_enabled: true,
  holiday_upcoming_enabled: true,
  updated_at: new Date(0).toISOString(),
};

function isTriggerType(value: unknown): value is NotificationTriggerType {
  return (
    typeof value === "string" &&
    [
      "manual",
      "closing_pending",
      "justification_decided",
      "closing_status",
      "password_changed",
      "stg_status",
      "holiday_upcoming",
    ].includes(value)
  );
}

function isSource(value: unknown): value is NotificationSource {
  return value === "manual" || value === "automatic";
}

function isAudienceType(value: unknown): value is NotificationAudienceType {
  return value === "all" || value === "team" || value === "users";
}

function mapSettings(row: Record<string, unknown> | null): NotificationSettings {
  if (!row) {
    return DEFAULT_SETTINGS;
  }
  return {
    closing_pending_after_day: Number(row.closing_pending_after_day ?? 25),
    holiday_reminder_days_before: Number(row.holiday_reminder_days_before ?? 3),
    closing_pending_enabled: Boolean(row.closing_pending_enabled ?? true),
    justification_decision_enabled: Boolean(
      row.justification_decision_enabled ?? true,
    ),
    closing_status_enabled: Boolean(row.closing_status_enabled ?? true),
    password_changed_enabled: Boolean(row.password_changed_enabled ?? true),
    stg_status_enabled: Boolean(row.stg_status_enabled ?? true),
    holiday_upcoming_enabled: Boolean(row.holiday_upcoming_enabled ?? true),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapCampaign(row: Record<string, unknown>): NotificationCampaign {
  const author = row.created_profile;
  const authorObj = Array.isArray(author) ? author[0] : author;
  return {
    id: String(row.id),
    source: isSource(row.source) ? row.source : "automatic",
    trigger_type: isTriggerType(row.trigger_type) ? row.trigger_type : "manual",
    title: String(row.title),
    body: String(row.body),
    href: row.href ? String(row.href) : null,
    audience_type: isAudienceType(row.audience_type)
      ? row.audience_type
      : "users",
    audience_json:
      row.audience_json && typeof row.audience_json === "object"
        ? (row.audience_json as Record<string, unknown>)
        : {},
    metadata_json:
      row.metadata_json && typeof row.metadata_json === "object"
        ? (row.metadata_json as Record<string, unknown>)
        : {},
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    recipient_count:
      row.recipient_count == null ? undefined : Number(row.recipient_count),
    read_count: row.read_count == null ? undefined : Number(row.read_count),
    created_by_name:
      authorObj && typeof authorObj === "object"
        ? String(
            (authorObj as { full_name?: string | null; email?: string | null })
              .full_name ??
              (authorObj as { email?: string | null }).email ??
              "",
          ) || null
        : null,
  };
}

function mapNotification(row: Record<string, unknown>): AppNotification {
  const recipient = row.recipient_profile;
  const recipientObj = Array.isArray(recipient) ? recipient[0] : recipient;
  return {
    id: String(row.id),
    campaign_id: row.campaign_id ? String(row.campaign_id) : null,
    recipient_profile_id: String(row.recipient_profile_id),
    title: String(row.title),
    body: String(row.body),
    href: row.href ? String(row.href) : null,
    trigger_type: isTriggerType(row.trigger_type) ? row.trigger_type : "manual",
    metadata_json:
      row.metadata_json && typeof row.metadata_json === "object"
        ? (row.metadata_json as Record<string, unknown>)
        : {},
    read_at: row.read_at ? String(row.read_at) : null,
    created_at: String(row.created_at),
    recipient_name:
      recipientObj && typeof recipientObj === "object"
        ? ((recipientObj as { full_name?: string | null }).full_name ?? null)
        : null,
    recipient_email:
      recipientObj && typeof recipientObj === "object"
        ? String((recipientObj as { email?: string | null }).email ?? "") ||
          null
        : null,
  };
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao carregar configurações de notificação: ${error.message}`);
  }
  return mapSettings((data as Record<string, unknown> | null) ?? null);
}

export async function getNotificationSettingsAdmin(): Promise<NotificationSettings> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notification_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.error("[notifications] settings load failed:", error.message);
    return DEFAULT_SETTINGS;
  }
  return mapSettings((data as Record<string, unknown> | null) ?? null);
}

export async function updateNotificationSettings(input: {
  closingPendingAfterDay: number;
  holidayReminderDaysBefore: number;
  closingPendingEnabled: boolean;
  justificationDecisionEnabled: boolean;
  closingStatusEnabled: boolean;
  passwordChangedEnabled: boolean;
  stgStatusEnabled: boolean;
  holidayUpcomingEnabled: boolean;
}): Promise<NotificationSettings> {
  const day = Math.floor(input.closingPendingAfterDay);
  if (!Number.isFinite(day) || day < 1 || day > 28) {
    throw new Error("O dia do lembrete de fechamento deve ficar entre 1 e 28.");
  }
  const holidayDays = Math.floor(input.holidayReminderDaysBefore);
  if (!Number.isFinite(holidayDays) || holidayDays < 0 || holidayDays > 30) {
    throw new Error("Os dias de antecedência de feriado devem ficar entre 0 e 30.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_settings")
    .update({
      closing_pending_after_day: day,
      holiday_reminder_days_before: holidayDays,
      closing_pending_enabled: input.closingPendingEnabled,
      justification_decision_enabled: input.justificationDecisionEnabled,
      closing_status_enabled: input.closingStatusEnabled,
      password_changed_enabled: input.passwordChangedEnabled,
      stg_status_enabled: input.stgStatusEnabled,
      holiday_upcoming_enabled: input.holidayUpcomingEnabled,
    })
    .eq("id", 1)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao salvar configurações de notificação: ${error.message}`);
  }
  return mapSettings(data as Record<string, unknown>);
}

async function resolveRecipientProfileIds(input: {
  audienceType: NotificationAudienceType;
  teamIds?: string[];
  profileIds?: string[];
}): Promise<string[]> {
  const admin = createAdminClient();

  if (input.audienceType === "all") {
    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .order("created_at", { ascending: true });
    if (error) {
      throw new Error(`Falha ao listar destinatários: ${error.message}`);
    }
    return (data ?? []).map((row) => String(row.id));
  }

  if (input.audienceType === "team") {
    const teamIds = [...new Set((input.teamIds ?? []).filter(Boolean))];
    if (teamIds.length === 0) {
      throw new Error("Selecione ao menos um time.");
    }
    const { data, error } = await admin
      .from("developers")
      .select("profile_id")
      .in("team_id", teamIds)
      .eq("is_active", true)
      .not("profile_id", "is", null);
    if (error) {
      throw new Error(`Falha ao resolver destinatários do time: ${error.message}`);
    }
    return [
      ...new Set(
        (data ?? [])
          .map((row) => row.profile_id)
          .filter((value): value is string => typeof value === "string"),
      ),
    ];
  }

  const profileIds = [...new Set((input.profileIds ?? []).filter(Boolean))];
  if (profileIds.length === 0) {
    throw new Error("Selecione ao menos uma pessoa.");
  }
  return profileIds;
}

export async function createManualNotificationCampaign(
  input: CreateManualNotificationInput,
): Promise<NotificationCampaign> {
  const title = input.title.trim();
  const body = input.body.trim();
  const href = input.href?.trim() || null;
  if (!title) {
    throw new Error("Informe o título da notificação.");
  }
  if (!body) {
    throw new Error("Informe a mensagem da notificação.");
  }

  const recipientIds = await resolveRecipientProfileIds({
    audienceType: input.audienceType,
    teamIds: input.teamIds,
    profileIds: input.profileIds,
  });
  if (recipientIds.length === 0) {
    throw new Error("Nenhum destinatário encontrado para o público selecionado.");
  }

  const supabase = await createClient();
  const audienceJson =
    input.audienceType === "team"
      ? { teamIds: input.teamIds ?? [] }
      : input.audienceType === "users"
        ? { profileIds: recipientIds }
        : {};

  const { data: campaign, error: campaignError } = await supabase
    .from("notification_campaigns")
    .insert({
      source: "manual",
      trigger_type: "manual",
      title,
      body,
      href,
      audience_type: input.audienceType,
      audience_json: audienceJson,
      metadata_json: { recipientCount: recipientIds.length },
      created_by: input.actorUserId,
    })
    .select("*")
    .single();

  if (campaignError) {
    throw new Error(`Falha ao criar campanha: ${campaignError.message}`);
  }

  const rows = recipientIds.map((recipientProfileId) => ({
    campaign_id: campaign.id,
    recipient_profile_id: recipientProfileId,
    title,
    body,
    href,
    trigger_type: "manual",
    metadata_json: {},
  }));

  const { error: insertError } = await supabase.from("notifications").insert(rows);
  if (insertError) {
    throw new Error(`Falha ao disparar notificações: ${insertError.message}`);
  }

  return {
    ...mapCampaign(campaign as Record<string, unknown>),
    recipient_count: recipientIds.length,
    read_count: 0,
  };
}

export async function notifyProfiles(input: {
  recipientProfileIds: string[];
  title: string;
  body: string;
  href?: string | null;
  triggerType: NotificationTriggerType;
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
  audienceType?: NotificationAudienceType;
}): Promise<void> {
  const recipientIds = [
    ...new Set(input.recipientProfileIds.filter(Boolean)),
  ];
  if (recipientIds.length === 0) {
    return;
  }

  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) {
    return;
  }

  const admin = createAdminClient();
  const { data: campaign, error: campaignError } = await admin
    .from("notification_campaigns")
    .insert({
      source: "automatic",
      trigger_type: input.triggerType,
      title,
      body,
      href: input.href?.trim() || null,
      audience_type: input.audienceType ?? "users",
      audience_json: { profileIds: recipientIds },
      metadata_json: input.metadata ?? {},
      created_by: input.actorUserId ?? null,
    })
    .select("id")
    .single();

  if (campaignError) {
    console.error("[notifications] campaign insert failed:", campaignError.message);
    return;
  }

  const { error: insertError } = await admin.from("notifications").insert(
    recipientIds.map((recipientProfileId) => ({
      campaign_id: campaign.id,
      recipient_profile_id: recipientProfileId,
      title,
      body,
      href: input.href?.trim() || null,
      trigger_type: input.triggerType,
      metadata_json: input.metadata ?? {},
    })),
  );

  if (insertError) {
    console.error("[notifications] inbox insert failed:", insertError.message);
  }
}

export async function resolveProfileIdForDeveloper(
  developerId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("developers")
    .select("profile_id")
    .eq("id", developerId)
    .maybeSingle();
  if (error) {
    console.error("[notifications] resolve developer profile failed:", error.message);
    return null;
  }
  return typeof data?.profile_id === "string" ? data.profile_id : null;
}

export async function listNotificationCampaigns(limit = 50): Promise<
  NotificationCampaign[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_campaigns")
    .select(
      `
      *,
      created_profile:profiles!notification_campaigns_created_by_fkey (
        full_name,
        email
      )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Falha ao listar campanhas: ${error.message}`);
  }

  const campaigns = (data ?? []).map((row) =>
    mapCampaign(row as Record<string, unknown>),
  );
  if (campaigns.length === 0) {
    return campaigns;
  }

  const campaignIds = campaigns.map((row) => row.id);
  const { data: counts, error: countError } = await supabase
    .from("notifications")
    .select("campaign_id, read_at")
    .in("campaign_id", campaignIds);

  if (countError) {
    throw new Error(`Falha ao agregar destinatários: ${countError.message}`);
  }

  const byCampaign = new Map<string, { total: number; read: number }>();
  for (const row of counts ?? []) {
    const campaignId = String(row.campaign_id);
    const current = byCampaign.get(campaignId) ?? { total: 0, read: 0 };
    current.total += 1;
    if (row.read_at) {
      current.read += 1;
    }
    byCampaign.set(campaignId, current);
  }

  return campaigns.map((campaign) => {
    const stats = byCampaign.get(campaign.id) ?? { total: 0, read: 0 };
    return {
      ...campaign,
      recipient_count: stats.total,
      read_count: stats.read,
    };
  });
}

export async function getNotificationCampaign(campaignId: string): Promise<{
  campaign: NotificationCampaign;
  recipients: AppNotification[];
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_campaigns")
    .select(
      `
      *,
      created_profile:profiles!notification_campaigns_created_by_fkey (
        full_name,
        email
      )
    `,
    )
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao carregar campanha: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  const { data: recipients, error: recipientsError } = await supabase
    .from("notifications")
    .select(
      `
      *,
      recipient_profile:profiles!notifications_recipient_profile_id_fkey (
        full_name,
        email
      )
    `,
    )
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });

  if (recipientsError) {
    throw new Error(`Falha ao listar destinatários: ${recipientsError.message}`);
  }

  const mappedRecipients = (recipients ?? []).map((row) =>
    mapNotification(row as Record<string, unknown>),
  );

  return {
    campaign: {
      ...mapCampaign(data as Record<string, unknown>),
      recipient_count: mappedRecipients.length,
      read_count: mappedRecipients.filter((row) => row.read_at).length,
    },
    recipients: mappedRecipients,
  };
}

export async function listMyNotifications(input: {
  profileId: string;
  unreadOnly?: boolean;
  limit?: number;
}): Promise<AppNotification[]> {
  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select("*")
    .eq("recipient_profile_id", input.profileId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 50);

  if (input.unreadOnly) {
    query = query.is("read_at", null);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao listar notificações: ${error.message}`);
  }
  return (data ?? []).map((row) => mapNotification(row as Record<string, unknown>));
}

export async function countUnreadNotifications(
  profileId: string,
): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_profile_id", profileId)
    .is("read_at", null);

  if (error) {
    throw new Error(`Falha ao contar notificações não lidas: ${error.message}`);
  }
  return count ?? 0;
}

export async function markNotificationRead(input: {
  notificationId: string;
  profileId: string;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", input.notificationId)
    .eq("recipient_profile_id", input.profileId)
    .is("read_at", null);

  if (error) {
    throw new Error(`Falha ao marcar notificação como lida: ${error.message}`);
  }
}

export async function markAllNotificationsRead(
  profileId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_profile_id", profileId)
    .is("read_at", null);

  if (error) {
    throw new Error(`Falha ao marcar todas como lidas: ${error.message}`);
  }
}

export function triggerTypeLabel(type: NotificationTriggerType): string {
  switch (type) {
    case "manual":
      return "Manual";
    case "closing_pending":
      return "Fechamento pendente";
    case "justification_decided":
      return "Justificativa";
    case "closing_status":
      return "Status de fechamento";
    case "password_changed":
      return "Senha";
    case "stg_status":
      return "STG";
    case "holiday_upcoming":
      return "Feriado";
    default:
      return type;
  }
}
