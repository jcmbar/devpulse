import { EmptyState, DataTable } from "@/components/surface";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { SectionShell } from "@/components/ui/section-shell";
import { requirePermission } from "@/lib/auth/permissions";
import {
  formatDateBrazil,
  formatTimeBrazil,
} from "@/lib/datetime/format-brazil";
import {
  getNotificationCampaign,
  triggerTypeLabel,
} from "@/services/notifications";
import { Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

type PageProps = {
  params: Promise<{ campaignId: string }>;
};

export default async function GestorNotificationCampaignPage({
  params,
}: PageProps) {
  await requirePermission("notificacoes", "access");
  const { campaignId } = await params;
  const detail = await getNotificationCampaign(campaignId);
  if (!detail) {
    notFound();
  }

  const { campaign, recipients } = detail;

  return (
    <PageShell size="full">
      <PageHeader
        eyebrow="Notificações"
        title={campaign.title}
        description={campaign.body}
        breadcrumb={
          <Link
            href="/app/gestor/notificacoes"
            className="text-sm underline-offset-4 hover:underline"
          >
            ← Voltar às notificações
          </Link>
        }
      />

      <SectionShell
        title="Resumo do disparo"
        description={`${campaign.source === "manual" ? "Manual" : "Automática"} · ${triggerTypeLabel(campaign.trigger_type)}`}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[var(--radius-sm)] border border-border/60 px-3 py-3">
            <p className="text-xs text-muted-foreground">Destinatários</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {campaign.recipient_count ?? recipients.length}
            </p>
          </div>
          <div className="rounded-[var(--radius-sm)] border border-border/60 px-3 py-3">
            <p className="text-xs text-muted-foreground">Lidas</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {campaign.read_count ?? 0}
            </p>
          </div>
          <div className="rounded-[var(--radius-sm)] border border-border/60 px-3 py-3">
            <p className="text-xs text-muted-foreground">Disparado em</p>
            <p className="mt-1 text-sm font-medium">
              {formatDateBrazil(campaign.created_at)}{" "}
              {formatTimeBrazil(campaign.created_at)}
            </p>
          </div>
        </div>
      </SectionShell>

      {recipients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Sem destinatários"
          description="Esta campanha não possui destinatários registrados."
        />
      ) : (
        <SectionShell
          title="Destinatários"
          description="Quem recebeu, quando e se já leu."
        >
          <DataTable minWidthClassName="min-w-[880px]">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>E-mail</th>
                <th>Recebido em</th>
                <th>Hora</th>
                <th>Status</th>
                <th>Lida em</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((row) => (
                <tr key={row.id}>
                  <td className="font-medium">
                    {row.recipient_name ?? "—"}
                  </td>
                  <td className="text-sm text-muted-foreground">
                    {row.recipient_email ?? "—"}
                  </td>
                  <td className="whitespace-nowrap text-sm">
                    {formatDateBrazil(row.created_at)}
                  </td>
                  <td className="whitespace-nowrap text-sm">
                    {formatTimeBrazil(row.created_at)}
                  </td>
                  <td>
                    <span
                      className={
                        row.read_at
                          ? "ui-badge"
                          : "ui-badge bg-amber-500/15 text-amber-800 dark:text-amber-200"
                      }
                    >
                      {row.read_at ? "Lida" : "Não lida"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-sm">
                    {row.read_at
                      ? `${formatDateBrazil(row.read_at)} ${formatTimeBrazil(row.read_at)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </SectionShell>
      )}
    </PageShell>
  );
}
