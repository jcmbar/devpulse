"use client";

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/app/notifications-actions";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/types/notification";
import { Bell, CheckCheck, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

type NotificationBellProps = {
  initialUnreadCount: number;
  initialItems: AppNotification[];
};

function formatRelative(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NotificationBell({
  initialUnreadCount,
  initialItems,
}: NotificationBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [markedIds, setMarkedIds] = useState<string[]>([]);
  const [markedAll, setMarkedAll] = useState(false);
  const [pending, startTransition] = useTransition();

  const items = useMemo(
    () =>
      initialItems.map((item) =>
        markedAll || markedIds.includes(item.id)
          ? { ...item, read_at: item.read_at ?? new Date().toISOString() }
          : item,
      ),
    [initialItems, markedAll, markedIds],
  );

  const unreadCount = markedAll
    ? 0
    : Math.max(
        0,
        initialUnreadCount -
          markedIds.filter((id) =>
            initialItems.some((item) => item.id === id && item.read_at == null),
          ).length,
      );

  const badgeLabel =
    unreadCount <= 0 ? null : unreadCount > 99 ? "99+" : String(unreadCount);

  function markOne(notificationId: string) {
    setMarkedIds((current) =>
      current.includes(notificationId) ? current : [...current, notificationId],
    );
    startTransition(async () => {
      await markNotificationReadAction(notificationId);
      router.refresh();
    });
  }

  function markAll() {
    setMarkedAll(true);
    startTransition(async () => {
      await markAllNotificationsReadAction();
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="ui-btn-secondary relative"
        aria-label="Central de notificações"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell className="size-3.5" strokeWidth={1.9} />
        {badgeLabel ? (
          <span className="absolute -top-1.5 -right-1.5 inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            aria-label="Fechar notificações"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-[var(--radius)] border border-border/70 bg-header/95 shadow-[var(--shadow-md)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Notificações
                </p>
                <p className="text-xs text-muted-foreground">
                  {unreadCount === 0
                    ? "Nenhuma pendente"
                    : `${unreadCount} não lida${unreadCount === 1 ? "" : "s"}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 ? (
                  <button
                    type="button"
                    className="ui-btn-secondary"
                    disabled={pending}
                    onClick={markAll}
                    title="Marcar todas como lidas"
                  >
                    <CheckCheck className="size-3.5" strokeWidth={1.9} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ui-btn-secondary"
                  onClick={() => setOpen(false)}
                  aria-label="Fechar"
                >
                  <X className="size-3.5" strokeWidth={1.9} />
                </button>
              </div>
            </div>

            <div className="max-h-[22rem] overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Nenhuma notificação por aqui ainda.
                </p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {items.map((item) => {
                    const unread = item.read_at == null;
                    return (
                      <li key={item.id}>
                        <div
                          className={cn(
                            "px-3 py-3 transition-colors",
                            unread ? "bg-brand-soft/40" : "bg-transparent",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground">
                                {item.title}
                              </p>
                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                {item.body}
                              </p>
                              <p className="mt-1.5 text-[11px] text-muted-foreground">
                                {formatRelative(item.created_at)}
                              </p>
                            </div>
                            {unread ? (
                              <button
                                type="button"
                                className="shrink-0 text-[11px] font-medium text-brand-foreground underline-offset-2 hover:underline"
                                disabled={pending}
                                onClick={() => markOne(item.id)}
                              >
                                Lida
                              </button>
                            ) : null}
                          </div>
                          {item.href ? (
                            <Link
                              href={item.href}
                              className="mt-2 inline-flex text-xs font-medium text-brand-foreground underline-offset-2 hover:underline"
                              onClick={() => {
                                if (unread) {
                                  markOne(item.id);
                                }
                                setOpen(false);
                              }}
                            >
                              Abrir
                            </Link>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-border/60 px-3 py-2.5">
              <Link
                href="/app/notificacoes"
                className="text-xs font-medium text-brand-foreground underline-offset-2 hover:underline"
                onClick={() => setOpen(false)}
              >
                Ver central completa
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
