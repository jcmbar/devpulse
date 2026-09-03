export const NOTIFICATION_TRIGGER_TYPES = [
  "manual",
  "closing_pending",
  "justification_decided",
  "closing_status",
  "password_changed",
  "stg_status",
  "holiday_upcoming",
] as const;

export type NotificationTriggerType =
  (typeof NOTIFICATION_TRIGGER_TYPES)[number];

export const NOTIFICATION_SOURCES = ["manual", "automatic"] as const;
export type NotificationSource = (typeof NOTIFICATION_SOURCES)[number];

export const NOTIFICATION_AUDIENCE_TYPES = ["all", "team", "users"] as const;
export type NotificationAudienceType =
  (typeof NOTIFICATION_AUDIENCE_TYPES)[number];

export type NotificationSettings = {
  closing_pending_after_day: number;
  holiday_reminder_days_before: number;
  closing_pending_enabled: boolean;
  justification_decision_enabled: boolean;
  closing_status_enabled: boolean;
  password_changed_enabled: boolean;
  stg_status_enabled: boolean;
  holiday_upcoming_enabled: boolean;
  web_push_enabled: boolean;
  updated_at: string;
};

export type NotificationCampaign = {
  id: string;
  source: NotificationSource;
  trigger_type: NotificationTriggerType;
  title: string;
  body: string;
  href: string | null;
  audience_type: NotificationAudienceType;
  audience_json: Record<string, unknown>;
  metadata_json: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  recipient_count?: number;
  read_count?: number;
  created_by_name?: string | null;
};

export type AppNotification = {
  id: string;
  campaign_id: string | null;
  recipient_profile_id: string;
  title: string;
  body: string;
  href: string | null;
  trigger_type: NotificationTriggerType;
  metadata_json: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  recipient_name?: string | null;
  recipient_email?: string | null;
};

export type CreateManualNotificationInput = {
  title: string;
  body: string;
  href?: string | null;
  audienceType: NotificationAudienceType;
  teamIds?: string[];
  profileIds?: string[];
  actorUserId: string;
};
