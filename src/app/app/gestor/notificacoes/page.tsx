import { updateNotificationSettingsAction } from "@/app/app/notifications-actions";
import { EmptyState, DataTable, Surface } from "@/components/surface";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { FormField } from "@/components/ui/form";
import { SectionShell } from "@/components/ui/section-shell";
import { requirePermission } from "@/lib/auth/permissions";
import {
  formatDateBrazil,
  formatTimeBrazil,
} from "@/lib/datetime/format-brazil";
import { listDevelopersAdmin } from "@/services/developers";
import {
  getNotificationSettings,
  listNotificationCampaigns,
  triggerTypeLabel,
} from "@/services/notifications";
import { listTeamsAdmin } from "@/services/teams";
import { Bell } from "lucide-react";
import Link from "next/link";
import { CreateNotificationModal } from "./create-notification-modal";

export default async function GestorNotificationsPage() {
  const context = await requirePermission("notificacoes", "access");
  const canEdit = context.grants.notificacoes.can_edit;

  const [campaigns, settings, teams, developers] = await Promise.all([
    listNotificationCampaigns(100),
    getNotificationSettings(),
    listTeamsAdmin(),
    listDevelopersAdmin({ isActive: true }),
  ]);

  const people = developers
    .filter((row) => row.profile_id)
    .map((row) => ({
      id: row.profile_id as string,
      name: row.full_name,
    }));

  return (
    <PageShell size="full">
      <PageHeader
        eyebrow="Governança"
        title="Notificações"
        description="Disparos manuais e automáticos, com auditoria de leitura por destinatário. Configure também o dia do lembrete de fechamento pendente."
        actions={
          canEdit ? (
            <CreateNotificationModal teams={teams} people={people} />
          ) : null
        }
      />

      <SectionShell
        title="Configurações"
        description="Regras usadas pelos disparos automáticos. O lembrete de fechamento pendente usa o dia configurado abaixo."
      >
        <Surface>
          <form action={updateNotificationSettingsAction} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="Dia do mês para lembrete de fechamento pendente"
                htmlFor="closingPendingAfterDay"
              >
                <input
                  id="closingPendingAfterDay"
                  name="closingPendingAfterDay"
                  type="number"
                  min={1}
                  max={28}
                  defaultValue={settings.closing_pending_after_day}
                  className="ui-input"
                  disabled={!canEdit}
                  required
                />
              </FormField>
              <FormField
                label="Dias de antecedência para feriado"
                htmlFor="holidayReminderDaysBefore"
              >
                <input
                  id="holidayReminderDaysBefore"
                  name="holidayReminderDaysBefore"
                  type="number"
                  min={0}
                  max={30}
                  defaultValue={settings.holiday_reminder_days_before}
                  className="ui-input"
                  disabled={!canEdit}
                  required
                />
              </FormField>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ["closingPendingEnabled", "Fechamento pendente", settings.closing_pending_enabled],
                  ["justificationDecisionEnabled", "Decisão de justificativa", settings.justification_decision_enabled],
                  ["closingStatusEnabled", "Status de fechamento", settings.closing_status_enabled],
                  ["passwordChangedEnabled", "Alteração de senha", settings.password_changed_enabled],
                  ["stgStatusEnabled", "STG Day / status", settings.stg_status_enabled],
                  ["holidayUpcomingEnabled", "Feriados próximos", settings.holiday_upcoming_enabled],
                ] as const
              ).map(([name, label, checked]) => (
                <label
                  key={name}
                  className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-border/60 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name={name}
                    defaultChecked={checked}
                    disabled={!canEdit}
                  />
                  {label}
                </label>
              ))}
            </div>

            {canEdit ? (
              <button type="submit" className="ui-btn-primary">
                Salvar configurações
              </button>
            ) : null}
          </form>
        </Surface>
      </SectionShell>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Nenhum disparo registrado"
          description="Crie uma notificação manual ou aguarde os primeiros eventos automáticos."
          action={
            canEdit ? (
              <CreateNotificationModal teams={teams} people={people} />
            ) : null
          }
        />
      ) : (
        <SectionShell
          title="Disparos"
          description={`${campaigns.length} campanha${campaigns.length === 1 ? "" : "s"} · clique para ver destinatários e leituras`}
        >
          <DataTable minWidthClassName="min-w-[980px]">
            <thead>
              <tr>
                <th>Título</th>
                <th>Origem</th>
                <th>Tipo</th>
                <th>Destinatários</th>
                <th>Lidas</th>
                <th>Data</th>
                <th>Hora</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td className="min-w-[16rem]">
                    <Link
                      href={`/app/gestor/notificacoes/${campaign.id}`}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {campaign.title}
                    </Link>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {campaign.body}
                    </p>
                  </td>
                  <td className="whitespace-nowrap text-sm capitalize">
                    {campaign.source === "manual" ? "Manual" : "Automática"}
                  </td>
                  <td className="whitespace-nowrap text-sm">
                    {triggerTypeLabel(campaign.trigger_type)}
                  </td>
                  <td className="whitespace-nowrap text-sm tabular-nums">
                    {campaign.recipient_count ?? 0}
                  </td>
                  <td className="whitespace-nowrap text-sm tabular-nums">
                    {campaign.read_count ?? 0}
                  </td>
                  <td className="whitespace-nowrap text-sm">
                    {formatDateBrazil(campaign.created_at)}
                  </td>
                  <td className="whitespace-nowrap text-sm">
                    {formatTimeBrazil(campaign.created_at)}
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
