import Link from "next/link";
import { notFound } from "next/navigation";
import { GestorClosingReviewTabs } from "@/components/monthly-closing/gestor-closing-review-tabs";
import { MonthlyClosingStatusBadge } from "@/components/monthly-closing/monthly-closing-panel";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { DataTable } from "@/components/surface";
import { SectionShell } from "@/components/ui/section-shell";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { formatYearMonthLabel } from "@/lib/metrics/date-range";
import { cn } from "@/lib/utils";
import { getDeveloperAdmin } from "@/services/developers/admin";
import { listInvoiceIssuers, getInvoiceIssuer } from "@/services/invoice-issuers";
import {
  getMonthlyClosingById,
  listMonthlyClosingAttachments,
  listMonthlyClosingEvents,
  listMonthlyClosingItems,
  listMonthlyClosingPresenceDays,
} from "@/services/monthly-closings";
import { loadClosingFolhaCompare } from "@/services/closing-folha-compare";
import { getPayrollInvoiceIssuerIdForDeveloperMonth } from "@/services/payroll";

type PageProps = {
  params: Promise<{ closingId: string }>;
};

function formatHours(value: number | null): string {
  if (value == null) {
    return "—";
  }
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

function formatDays(value: number | null): string {
  if (value == null) {
    return "—";
  }
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} d`;
}

function JustStatus({
  applicable,
  status,
  developerNote,
  managerNote,
  label,
}: {
  applicable: boolean;
  status: string | null;
  developerNote: string | null;
  managerNote: string | null;
  label: string;
}) {
  if (!applicable) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const statusLabel =
    status === "accepted"
      ? "Aceito"
      : status === "rejected"
        ? "Recusado"
        : status === "pending"
          ? "Pendente"
          : "Ausente";
  return (
    <div className="space-y-1 text-xs">
      <p className="font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <span
        className={cn(
          "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold",
          status === "accepted" &&
            "border-emerald-500/40 bg-emerald-500/15",
          status === "rejected" && "border-rose-500/40 bg-rose-500/15",
          status === "pending" && "border-amber-500/40 bg-amber-500/15",
        )}
      >
        {statusLabel}
      </span>
      {developerNote ? (
        <p className="text-muted-foreground" title={developerNote}>
          Dev: {developerNote}
        </p>
      ) : null}
      {managerNote ? (
        <p className="text-muted-foreground" title={managerNote}>
          Gestor: {managerNote}
        </p>
      ) : null}
    </div>
  );
}

export default async function GestorClosingDetailPage({ params }: PageProps) {
  await requireTeamAccess();
  const { closingId } = await params;
  const closing = await getMonthlyClosingById(closingId);
  if (!closing) {
    notFound();
  }

  const [developer, items, events, attachments, presenceDays, issuers] =
    await Promise.all([
      getDeveloperAdmin(closing.developer_id),
      listMonthlyClosingItems(closing.id),
      listMonthlyClosingEvents(closing.id),
      listMonthlyClosingAttachments(closing.id),
      listMonthlyClosingPresenceDays(closing.id),
      listInvoiceIssuers({ activeOnly: true }),
    ]);

  const [folhaIssuerId, selectedIssuer, folhaComparePayload] = await Promise.all([
    closing.status === "in_review"
      ? getPayrollInvoiceIssuerIdForDeveloperMonth({
          developerId: closing.developer_id,
          yearMonth: closing.year_month,
        })
      : Promise.resolve(null),
    closing.invoice_issuer_id
      ? getInvoiceIssuer(closing.invoice_issuer_id)
      : Promise.resolve(null),
    loadClosingFolhaCompare(closing),
  ]);

  return (
    <PageShell size="xl">
      <PageHeader
        eyebrow="Gestor · Fechamento"
        title={developer?.full_name ?? "Developer"}
        description={
          <>
            Snapshot de {formatYearMonthLabel(closing.year_month)}
            {" · "}
            <MonthlyClosingStatusBadge status={closing.status} />
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href="/app/gestor/fechamentos" className="ui-btn-secondary">
              Voltar aos fechamentos
            </Link>
            <Link href="/app/gestor" className="ui-btn-ghost">
              Dashboard
            </Link>
          </div>
        }
      />

      <GestorClosingReviewTabs
        closing={closing}
        attachments={attachments}
        presenceDays={presenceDays}
        issuers={issuers}
        defaultIssuerId={folhaIssuerId}
        selectedIssuer={selectedIssuer}
        folhaCompare={folhaComparePayload.compare}
        userSide={folhaComparePayload.userSide}
        folhaSide={folhaComparePayload.folhaSide}
      />

      <SectionShell
        title="Contexto do snapshot"
        description="Base congelada no envio do developer — não é recalculada após finalize."
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Período
            </dt>
            <dd>
              {closing.period_start} → {closing.period_end}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Enviado em
            </dt>
            <dd>
              {closing.submitted_at
                ? new Date(closing.submitted_at).toLocaleString("pt-BR")
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Snapshot
            </dt>
            <dd>
              {closing.snapshot_generated_at
                ? new Date(closing.snapshot_generated_at).toLocaleString("pt-BR")
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Cards no snapshot
            </dt>
            <dd>{items.length}</dd>
          </div>
        </dl>
      </SectionShell>

      <SectionShell title="Cards do snapshot">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum item no snapshot.
          </p>
        ) : (
          <DataTable minWidthClassName="min-w-[1000px]" stickyFirstColumn>
            <thead>
              <tr>
                <th>Chave</th>
                <th>Resumo</th>
                <th>Previsto</th>
                <th>Realizado</th>
                <th>Atraso</th>
                <th>Retrabalho</th>
                <th>Entrega TU</th>
                <th>Justificativas</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="font-mono font-medium">{item.jira_key}</td>
                  <td className="max-w-[14rem] truncate">
                    {item.summary ?? "—"}
                  </td>
                  <td>{formatHours(item.estimate_hours)}</td>
                  <td>{formatHours(item.actual_hours)}</td>
                  <td>
                    {item.is_delayed ? formatDays(item.delay_days) : "—"}
                  </td>
                  <td>
                    {item.is_rework
                      ? item.rework_weight > 1
                        ? `${item.rework_weight}x`
                        : "Sim"
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap">
                    {item.unit_test_delivery_on ?? "—"}
                  </td>
                  <td>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <JustStatus
                        label="Atraso"
                        applicable={item.is_delayed}
                        status={item.delay_justification_status}
                        developerNote={item.delay_developer_note}
                        managerNote={item.delay_manager_note}
                      />
                      <JustStatus
                        label="Retrabalho"
                        applicable={item.is_rework}
                        status={item.rework_justification_status}
                        developerNote={item.rework_developer_note}
                        managerNote={item.rework_manager_note}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </SectionShell>

      <SectionShell title="Histórico de eventos">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem eventos.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {events.map((event) => (
              <li
                key={event.id}
                className="rounded-[var(--radius-sm)] border border-border px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{event.event_type}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(event.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>
                {(event.from_status || event.to_status) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.from_status ?? "—"} → {event.to_status ?? "—"}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionShell>
    </PageShell>
  );
}
