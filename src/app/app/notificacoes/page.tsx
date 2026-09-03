import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/app/notifications-actions";
import { PushOptIn } from "@/components/notifications/push-opt-in";
import { EmptyState, DataTable } from "@/components/surface";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { SectionShell } from "@/components/ui/section-shell";
import { getAppContext } from "@/lib/auth/app-context";
import {
  formatDateBrazil,
  formatTimeBrazil,
} from "@/lib/datetime/format-brazil";
import {
  countUnreadNotifications,
  listMyNotifications,
  triggerTypeLabel,
} from "@/services/notifications";
import {
  countMyPushSubscriptions,
  getPublicVapidKey,
} from "@/services/notifications/web-push";
import { Bell } from "lucide-react";
import Link from "next/link";

export default async function MyNotificationsPage() {
  const { profile } = await getAppContext();
  const [items, unreadCount, pushCount] = await Promise.all([
    listMyNotifications({ profileId: profile.id, limit: 100 }),
    countUnreadNotifications(profile.id),
    countMyPushSubscriptions(profile.id),
  ]);
  const vapidPublicKey = getPublicVapidKey();

  return (
    <PageShell size="full">
      <PageHeader
        eyebrow="Conta"
        title="Minhas notificações"
        description="Histórico das alertas enviadas para você. Marque como lida para limpar o contador do sino."
        actions={
          unreadCount > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <button type="submit" className="ui-btn-secondary">
                Marcar todas como lidas
              </button>
            </form>
          ) : null
        }
      />

      <SectionShell
        title="Web Push"
        description="Ative alertas do sistema operacional neste dispositivo. O navegador pedirá autorização, como no celular."
      >
        <PushOptIn
          vapidPublicKey={vapidPublicKey}
          initialSubscriptionCount={pushCount}
        />
      </SectionShell>

      {items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Nenhuma notificação"
          description="Quando houver alertas automáticos ou mensagens do gestor, elas aparecerão aqui."
        />
      ) : (
        <SectionShell
          title="Histórico"
          description={`${items.length} notificaç${items.length === 1 ? "ão" : "ões"} · ${unreadCount} não lida${unreadCount === 1 ? "" : "s"}`}
        >
          <DataTable minWidthClassName="min-w-[820px]">
            <thead>
              <tr>
                <th>Status</th>
                <th>Título</th>
                <th>Tipo</th>
                <th>Data</th>
                <th>Hora</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const unread = item.read_at == null;
                return (
                  <tr key={item.id}>
                    <td>
                      <span
                        className={
                          unread
                            ? "ui-badge bg-amber-500/15 text-amber-800 dark:text-amber-200"
                            : "ui-badge"
                        }
                      >
                        {unread ? "Não lida" : "Lida"}
                      </span>
                    </td>
                    <td className="min-w-[18rem]">
                      <p className="font-medium text-foreground">{item.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.body}
                      </p>
                      {item.href ? (
                        <Link
                          href={item.href}
                          className="mt-1 inline-flex text-xs font-medium text-brand-foreground underline-offset-2 hover:underline"
                        >
                          Abrir destino
                        </Link>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap text-sm">
                      {triggerTypeLabel(item.trigger_type)}
                    </td>
                    <td className="whitespace-nowrap text-sm">
                      {formatDateBrazil(item.created_at)}
                    </td>
                    <td className="whitespace-nowrap text-sm">
                      {formatTimeBrazil(item.created_at)}
                    </td>
                    <td>
                      {unread ? (
                        <form action={markNotificationReadAction.bind(null, item.id)}>
                          <button type="submit" className="ui-btn-secondary">
                            Marcar lida
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </SectionShell>
      )}
    </PageShell>
  );
}
