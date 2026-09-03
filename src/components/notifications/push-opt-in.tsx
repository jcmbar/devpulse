"use client";

import {
  removePushSubscriptionAction,
  savePushSubscriptionAction,
} from "@/app/app/notifications-actions";
import { useState, useTransition } from "react";

type PushOptInProps = {
  vapidPublicKey: string | null;
  initialSubscriptionCount: number;
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function detectPushSupport(): {
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

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Este navegador não suporta service workers.");
  }
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) {
    return existing;
  }
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export function PushOptIn({
  vapidPublicKey,
  initialSubscriptionCount,
}: PushOptInProps) {
  const initial = detectPushSupport();
  const [supported] = useState(initial.supported);
  const [permission, setPermission] = useState<NotificationPermission>(
    initial.permission,
  );
  const [subscribed, setSubscribed] = useState(initialSubscriptionCount > 0);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!vapidPublicKey) {
    return (
      <div className="rounded-[var(--radius-sm)] border border-border/60 px-4 py-3 text-sm text-muted-foreground">
        Web Push ainda não está configurado neste ambiente (chaves VAPID
        ausentes). As notificações in-app continuam funcionando normalmente.
      </div>
    );
  }

  if (!supported) {
    return (
      <div className="rounded-[var(--radius-sm)] border border-border/60 px-4 py-3 text-sm text-muted-foreground">
        Seu navegador não suporta notificações push. Use Chrome, Edge, Firefox
        ou Safari recente.
      </div>
    );
  }

  function enable() {
    const publicKey = vapidPublicKey;
    if (!publicKey) {
      return;
    }
    setMessage(null);
    startTransition(async () => {
      try {
        const permissionResult = await Notification.requestPermission();
        setPermission(permissionResult);
        if (permissionResult !== "granted") {
          setMessage(
            "Permissão negada. Você pode reativar nas configurações do navegador para este site.",
          );
          return;
        }

        const registration = await ensureServiceWorker();
        await navigator.serviceWorker.ready;

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(
              publicKey,
            ) as BufferSource,
          });
        }

        const json = subscription.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
          throw new Error("Subscription incompleta retornada pelo navegador.");
        }

        const result = await savePushSubscriptionAction({
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          },
        });
        if (result.error) {
          setMessage(result.error);
          return;
        }
        setSubscribed(true);
        setMessage("Notificações do navegador ativadas neste dispositivo.");
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível ativar as notificações push.",
        );
      }
    });
  }

  function disable() {
    setMessage(null);
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        const endpoint = subscription?.endpoint;
        if (subscription) {
          await subscription.unsubscribe();
        }
        if (endpoint) {
          const result = await removePushSubscriptionAction(endpoint);
          if (result.error) {
            setMessage(result.error);
            return;
          }
        }
        setSubscribed(false);
        setMessage("Notificações push desativadas neste dispositivo.");
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível desativar as notificações push.",
        );
      }
    });
  }

  return (
    <div className="space-y-3 rounded-[var(--radius-sm)] border border-border/60 px-4 py-4">
      <div>
        <p className="font-medium text-foreground">Alertas do navegador</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Receba um aviso mesmo com a aba fechada (quando o navegador permitir).
          É o mesmo tipo de autorização usada no celular.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {subscribed && permission === "granted" ? (
          <button
            type="button"
            className="ui-btn-secondary"
            disabled={pending}
            onClick={disable}
          >
            {pending ? "Atualizando…" : "Desativar neste dispositivo"}
          </button>
        ) : (
          <button
            type="button"
            className="ui-btn-primary"
            disabled={pending}
            onClick={enable}
          >
            {pending ? "Ativando…" : "Ativar notificações do navegador"}
          </button>
        )}
        <span className="text-xs text-muted-foreground">
          Permissão: {permission}
          {subscribed ? " · inscrito" : ""}
        </span>
      </div>
      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}
    </div>
  );
}
