/** Browser-side Web Push helpers (safe to import from client components). */

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function detectPushSupport(): {
  supported: boolean;
  permission: NotificationPermission;
} {
  if (typeof window === "undefined") {
    return { supported: false, permission: "default" };
  }
  const supported =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  return {
    supported,
    permission: supported ? Notification.permission : "default",
  };
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Este navegador não suporta service workers.");
  }
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) {
    return existing;
  }
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) {
    return null;
  }
  return registration.pushManager.getSubscription();
}

export type PushSubscriptionPayload = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export async function createPushSubscription(
  vapidPublicKey: string,
): Promise<PushSubscriptionPayload> {
  const permissionResult = await Notification.requestPermission();
  if (permissionResult !== "granted") {
    throw new Error(
      "Permissão negada. Você pode reativar nas configurações do navegador para este site.",
    );
  }

  const registration = await ensureServiceWorker();
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        vapidPublicKey,
      ) as BufferSource,
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Subscription incompleta retornada pelo navegador.");
  }

  return {
    endpoint: json.endpoint,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
  };
}

export async function clearLocalPushSubscription(): Promise<string | null> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  const endpoint = subscription?.endpoint ?? null;
  if (subscription) {
    await subscription.unsubscribe();
  }
  return endpoint;
}
