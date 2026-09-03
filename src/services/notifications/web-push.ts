import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import webpush from "web-push";

export type PushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

type StoredSubscription = {
  id: string;
  profile_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function getVapidConfig(): {
  publicKey: string;
  privateKey: string;
  subject: string;
} | null {
  const publicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ||
    process.env.VAPID_PUBLIC_KEY?.trim() ||
    "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || "";
  const subject =
    process.env.VAPID_SUBJECT?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "mailto:admin@localhost";

  if (!publicKey || !privateKey) {
    return null;
  }

  return { publicKey, privateKey, subject };
}

export function isWebPushConfigured(): boolean {
  return getVapidConfig() != null;
}

export function getPublicVapidKey(): string | null {
  return getVapidConfig()?.publicKey ?? null;
}

function configureWebPush(): boolean {
  const config = getVapidConfig();
  if (!config) {
    return false;
  }
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return true;
}

export async function upsertPushSubscription(input: {
  profileId: string;
  subscription: PushSubscriptionInput;
  userAgent?: string | null;
}): Promise<void> {
  const endpoint = input.subscription.endpoint.trim();
  const p256dh = input.subscription.keys.p256dh.trim();
  const auth = input.subscription.keys.auth.trim();
  if (!endpoint || !p256dh || !auth) {
    throw new Error("Subscription de push inválida.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("notification_push_subscriptions").upsert(
    {
      profile_id: input.profileId,
      endpoint,
      p256dh,
      auth,
      user_agent: input.userAgent?.slice(0, 500) || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    throw new Error(`Falha ao salvar subscription: ${error.message}`);
  }
}

export async function deletePushSubscription(input: {
  profileId: string;
  endpoint: string;
}): Promise<void> {
  const endpoint = input.endpoint.trim();
  if (!endpoint) {
    return;
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_push_subscriptions")
    .delete()
    .eq("profile_id", input.profileId)
    .eq("endpoint", endpoint);

  if (error) {
    throw new Error(`Falha ao remover subscription: ${error.message}`);
  }
}

export async function countMyPushSubscriptions(
  profileId: string,
): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notification_push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId);

  if (error) {
    console.error("[web-push] count failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

async function listSubscriptionsForProfiles(
  profileIds: string[],
): Promise<StoredSubscription[]> {
  if (profileIds.length === 0) {
    return [];
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notification_push_subscriptions")
    .select("id, profile_id, endpoint, p256dh, auth")
    .in("profile_id", profileIds);

  if (error) {
    console.error("[web-push] list subscriptions failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    profile_id: String(row.profile_id),
    endpoint: String(row.endpoint),
    p256dh: String(row.p256dh),
    auth: String(row.auth),
  }));
}

async function deleteSubscriptionById(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("notification_push_subscriptions")
    .delete()
    .eq("id", id);
  if (error) {
    console.error("[web-push] stale delete failed:", error.message);
  }
}

export async function sendWebPushToProfiles(input: {
  recipientProfileIds: string[];
  title: string;
  body: string;
  href?: string | null;
  tag?: string | null;
}): Promise<{ sent: number; failed: number; skipped: boolean }> {
  if (!configureWebPush()) {
    return { sent: 0, failed: 0, skipped: true };
  }

  const recipientIds = [...new Set(input.recipientProfileIds.filter(Boolean))];
  if (recipientIds.length === 0) {
    return { sent: 0, failed: 0, skipped: false };
  }

  const subscriptions = await listSubscriptionsForProfiles(recipientIds);
  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, skipped: false };
  }

  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    href: input.href ?? "/app/notificacoes",
    tag: input.tag ?? "devpulse-notification",
  });

  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload,
          {
            TTL: 60 * 60 * 12,
            urgency: "normal",
          },
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode =
          error &&
          typeof error === "object" &&
          "statusCode" in error &&
          typeof (error as { statusCode?: unknown }).statusCode === "number"
            ? (error as { statusCode: number }).statusCode
            : null;
        if (statusCode === 404 || statusCode === 410) {
          await deleteSubscriptionById(subscription.id);
        } else {
          console.error(
            "[web-push] send failed:",
            statusCode ?? (error instanceof Error ? error.message : error),
          );
        }
      }
    }),
  );

  return { sent, failed, skipped: false };
}
