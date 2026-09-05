"use client";

import {
  removePushSubscriptionAction,
  savePushSubscriptionAction,
} from "@/app/app/notifications-actions";
import {
  clearLocalPushSubscription,
  createPushSubscription,
  detectPushSupport,
} from "@/lib/notifications/push-client";
import { useState, useTransition } from "react";

type PushOptInProps = {
  vapidPublicKey: string | null;
  initialSubscriptionCount: number;
};

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
        const payload = await createPushSubscription(publicKey);
        setPermission(Notification.permission);
        const result = await savePushSubscriptionAction(payload);
        if (result.error) {
          setMessage(result.error);
          return;
        }
        setSubscribed(true);
        setMessage("Notificações do navegador ativadas neste dispositivo.");
      } catch (error) {
        setPermission(
          typeof Notification !== "undefined"
            ? Notification.permission
            : "default",
        );
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
        const endpoint = await clearLocalPushSubscription();
        if (endpoint) {
          const result = await removePushSubscriptionAction(endpoint);
          if (result.error) {
            setMessage(result.error);
            return;
          }
        }
        setSubscribed(false);
        setPermission(
          typeof Notification !== "undefined"
            ? Notification.permission
            : "default",
        );
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
