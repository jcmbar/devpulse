"use client";

import { BellRing } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

const SESSION_KEY = "devpulse.notifications.login-modal.dismissed";

type UnreadNotificationsModalProps = {
  unreadCount: number;
};

function subscribe() {
  return () => {};
}

function getDismissedSnapshot() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function getServerSnapshot() {
  return true;
}

export function UnreadNotificationsModal({
  unreadCount,
}: UnreadNotificationsModalProps) {
  const storedDismissed = useSyncExternalStore(
    subscribe,
    getDismissedSnapshot,
    getServerSnapshot,
  );
  const [localDismissed, setLocalDismissed] = useState(false);
  const dismissed = storedDismissed || localDismissed;

  if (unreadCount <= 0 || dismissed) {
    return null;
  }

  function dismiss() {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // ignore
    }
    setLocalDismissed(true);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unread-notifications-title"
        className="w-full max-w-md overflow-hidden rounded-[var(--radius)] border border-border/70 bg-card shadow-[var(--shadow-md)]"
      >
        <div className="bg-gradient-to-br from-sky-500/20 via-transparent to-violet-500/20 px-5 pt-5 pb-4">
          <div className="mb-3 inline-flex size-11 items-center justify-center rounded-2xl border border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300">
            <BellRing className="size-5" strokeWidth={1.9} />
          </div>
          <h2
            id="unread-notifications-title"
            className="text-xl font-semibold tracking-tight text-foreground"
          >
            Você tem notificações pendentes
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Há{" "}
            <span className="font-semibold text-foreground">{unreadCount}</span>{" "}
            notificaç{unreadCount === 1 ? "ão" : "ões"} não lida
            {unreadCount === 1 ? "" : "s"} na sua central. Confira agora para não
            perder atualizações importantes.
          </p>
        </div>
        <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" className="ui-btn-secondary" onClick={dismiss}>
            Agora não
          </button>
          <Link
            href="/app/notificacoes"
            className="ui-btn-primary text-center"
            onClick={dismiss}
          >
            Ir para a central
          </Link>
        </div>
      </div>
    </div>
  );
}
