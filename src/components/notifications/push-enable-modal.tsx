"use client";

import { savePushSubscriptionAction } from "@/app/app/notifications-actions";
import {
  UNREAD_NOTIFICATIONS_MODAL_DISMISSED_EVENT,
  UNREAD_NOTIFICATIONS_MODAL_SESSION_KEY,
} from "@/components/notifications/unread-notifications-modal";
import {
  createPushSubscription,
  detectPushSupport,
  getCurrentPushSubscription,
} from "@/lib/notifications/push-client";
import { Bell } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";

const PUSH_MODAL_SESSION_KEY = "devpulse.push.login-modal.dismissed";

type PushEnableModalProps = {
  vapidPublicKey: string | null;
  unreadCount: number;
};

function subscribe() {
  return () => {};
}

function getPushDismissedSnapshot() {
  try {
    return sessionStorage.getItem(PUSH_MODAL_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function getServerSnapshot() {
  return true;
}

function isUnreadModalDismissed(): boolean {
  try {
    return (
      sessionStorage.getItem(UNREAD_NOTIFICATIONS_MODAL_SESSION_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function PushEnableModal({
  vapidPublicKey,
  unreadCount,
}: PushEnableModalProps) {
  const pathname = usePathname();
  const pushDismissed = useSyncExternalStore(
    subscribe,
    getPushDismissedSnapshot,
    getServerSnapshot,
  );
  const [localDismissed, setLocalDismissed] = useState(false);
  const [unreadCleared, setUnreadCleared] = useState(
    () => unreadCount <= 0 || isUnreadModalDismissed(),
  );
  const [ready, setReady] = useState(false);
  const [needsOptIn, setNeedsOptIn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (unreadCount <= 0 || isUnreadModalDismissed()) {
      setUnreadCleared(true);
    }
    function onUnreadDismissed() {
      setUnreadCleared(true);
    }
    window.addEventListener(
      UNREAD_NOTIFICATIONS_MODAL_DISMISSED_EVENT,
      onUnreadDismissed,
    );
    return () => {
      window.removeEventListener(
        UNREAD_NOTIFICATIONS_MODAL_DISMISSED_EVENT,
        onUnreadDismissed,
      );
    };
  }, [unreadCount]);

  useEffect(() => {
    let cancelled = false;

    async function checkDevice() {
      if (!vapidPublicKey) {
        if (!cancelled) {
          setNeedsOptIn(false);
          setReady(true);
        }
        return;
      }

      const { supported, permission } = detectPushSupport();
      if (!supported) {
        if (!cancelled) {
          setNeedsOptIn(false);
          setReady(true);
        }
        return;
      }

      try {
        const subscription = await getCurrentPushSubscription();
        const active = permission === "granted" && subscription != null;
        if (!cancelled) {
          setNeedsOptIn(!active);
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setNeedsOptIn(true);
          setReady(true);
        }
      }
    }

    void checkDevice();
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  const dismissed = pushDismissed || localDismissed;
  const onNotificationsPage = pathname.startsWith("/app/notificacoes");

  if (
    !ready ||
    !vapidPublicKey ||
    !needsOptIn ||
    dismissed ||
    !unreadCleared ||
    onNotificationsPage
  ) {
    return null;
  }

  function dismiss() {
    try {
      sessionStorage.setItem(PUSH_MODAL_SESSION_KEY, "1");
    } catch {
      // ignore
    }
    setLocalDismissed(true);
  }

  function enable() {
    if (!vapidPublicKey) {
      return;
    }
    setMessage(null);
    startTransition(async () => {
      try {
        const payload = await createPushSubscription(vapidPublicKey);
        const result = await savePushSubscriptionAction(payload);
        if (result.error) {
          setMessage(result.error);
          return;
        }
        setNeedsOptIn(false);
        dismiss();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível ativar as notificações push.",
        );
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/45 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-enable-title"
        className="w-full max-w-md overflow-hidden rounded-[var(--radius)] border border-border/70 bg-card shadow-[var(--shadow-md)]"
      >
        <div className="bg-gradient-to-br from-amber-500/15 via-transparent to-sky-500/20 px-5 pt-5 pb-4">
          <div className="mb-3 inline-flex size-11 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-200">
            <Bell className="size-5" strokeWidth={1.9} />
          </div>
          <h2
            id="push-enable-title"
            className="text-xl font-semibold tracking-tight text-foreground"
          >
            Ative agora as notificações do navegador
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Autorize este dispositivo para receber alertas do DevPulse mesmo com
            a aba fechada — o navegador pedirá permissão, como no celular.
          </p>
        </div>
        <div className="space-y-3 px-5 py-4">
          {message ? (
            <p className="text-sm text-destructive" role="alert">
              {message}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="ui-btn-secondary"
              disabled={pending}
              onClick={dismiss}
            >
              Agora não
            </button>
            <button
              type="button"
              className="ui-btn-primary"
              disabled={pending}
              onClick={enable}
            >
              {pending ? "Ativando…" : "Ativar neste dispositivo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
