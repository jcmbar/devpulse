"use client";

import {
  loadClosingOpsDetailAction,
  sendFinanceiroClosingEmailAction,
  sendOperationalEmailByTypeAction,
} from "@/app/app/gestor/email-actions";
import {
  docStateLabel,
  emailDispatchToDocState,
  mealPixToDocState,
  type FechamentoOpsStatus,
  FECHAMENTO_OPS_STATUS_LABELS,
  opsStatusToneClass,
} from "@/lib/fechamentos/ops-status";
import { formatYearMonthLabel } from "@/lib/metrics/date-range";
import { formatDateTimeBrazil } from "@/lib/datetime/format-brazil";
import { cn } from "@/lib/utils";
import type {
  MonthlyClosing,
  MonthlyClosingAttachment,
  MonthlyClosingEvent,
} from "@/types/monthly-closing";
import { monthlyClosingAttachmentTypeLabel } from "@/types/monthly-closing";
import type { EmailDispatch, EmailDispatchStatus } from "@/types/operational-email";
import { EMAIL_DISPATCH_STATUS_LABELS } from "@/types/operational-email";
import { Loader2, Mail, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

export type ClosingOpsDrawerTarget = {
  developerId: string;
  developerName: string;
  yearMonth: string;
  closingId: string | null;
  opsStatus: FechamentoOpsStatus;
  requireMealPix: boolean;
  financeiro: EmailDispatchStatus | null;
  rh: EmailDispatchStatus | null;
  colaborador: EmailDispatchStatus | null;
};

function eventLabel(eventType: string): string {
  const map: Record<string, string> = {
    closing_started: "Fechamento iniciado",
    submitted_for_review: "Enviado para análise",
    manager_approved: "Aprovado pelo gestor",
    manager_rejected: "Devolvido para ajuste",
    developer_resubmitted: "Reenviado pelo developer",
    invoice_uploaded: "NF enviada",
    boleto_uploaded: "Boleto enviado",
    meal_pix_uploaded: "Comprovante PIX enviado",
    meal_pix_accepted: "Comprovante PIX aceito",
    meal_pix_rejected: "Comprovante PIX recusado",
    finalized: "Finalizado",
    invoice_note_updated: "Observação NF atualizada",
    status_reverted: "Status revertido",
  };
  return map[eventType] ?? eventType;
}

function DocPill({
  label,
  state,
}: {
  label: string;
  state: ReturnType<typeof mealPixToDocState>;
}) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-border px-3 py-2">
      <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{docStateLabel(state)}</p>
    </div>
  );
}

export function GestorClosingOpsDrawer({
  open,
  target,
  onClose,
  sendTypeIds,
}: {
  open: boolean;
  target: ClosingOpsDrawerTarget | null;
  onClose: () => void;
  sendTypeIds: {
    financeiroId: string | null;
    rhId: string | null;
    colaboradorId: string | null;
  };
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [actionPending, startAction] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [closing, setClosing] = useState<MonthlyClosing | null>(null);
  const [attachments, setAttachments] = useState<MonthlyClosingAttachment[]>(
    [],
  );
  const [events, setEvents] = useState<MonthlyClosingEvent[]>([]);
  const [dispatches, setDispatches] = useState<EmailDispatch[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }
    closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !target?.closingId) {
      setClosing(null);
      setAttachments([]);
      setEvents([]);
      setDispatches([]);
      setError(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await loadClosingOpsDetailAction({
        closingId: target.closingId!,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setClosing(result.closing);
      setAttachments(result.attachments);
      setEvents(result.events);
      setDispatches(result.dispatches);
    });
  }, [open, target?.closingId]);

  if (!open || !target) {
    return null;
  }

  const mealPix = attachments.find((row) => row.type === "meal_pix_receipt");
  const invoice = attachments.find((row) => row.type === "invoice_pdf");
  const boleto = attachments.find((row) => row.type === "boleto_pdf");

  const financeiroDispatch =
    dispatches.find((row) => row.send_type_id === sendTypeIds.financeiroId) ??
    null;
  const rhDispatch =
    dispatches.find((row) => row.send_type_id === sendTypeIds.rhId) ?? null;
  const colaboradorDispatch =
    dispatches.find(
      (row) => row.send_type_id === sendTypeIds.colaboradorId,
    ) ?? null;

  const financeiroStatus =
    financeiroDispatch?.status ?? target.financeiro;
  const rhStatus = rhDispatch?.status ?? target.rh;
  const colaboradorStatus =
    colaboradorDispatch?.status ?? target.colaborador;

  const canResendFinanceiro =
    target.closingId != null &&
    closing?.status === "finalized" &&
    Boolean(invoice) &&
    Boolean(boleto);

  const canResendRh =
    target.closingId != null &&
    target.requireMealPix &&
    Boolean(mealPix);

  const canResendColaborador =
    target.closingId != null && closing?.status === "finalized";

  const reciboAnexaDocs = Boolean(invoice) && Boolean(boleto);

  function resend(typeCode: "financeiro" | "rh" | "colaborador") {
    if (!target?.closingId) {
      return;
    }
    setActionError(null);
    startAction(async () => {
      const result =
        typeCode === "financeiro"
          ? await sendFinanceiroClosingEmailAction({
              closingId: target.closingId!,
            })
          : await sendOperationalEmailByTypeAction({
              closingId: target.closingId!,
              typeCode,
            });
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      router.refresh();
      const refreshed = await loadClosingOpsDetailAction({
        closingId: target.closingId!,
      });
      if (refreshed.ok) {
        setDispatches(refreshed.dispatches);
        setEvents(refreshed.events);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button
        type="button"
        aria-label="Fechar detalhes"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-lg flex-col border-l border-border bg-[var(--surface-elevated)] shadow-[var(--shadow-md)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {formatYearMonthLabel(target.yearMonth)}
            </p>
            <h2
              id={titleId}
              className="truncate text-lg font-semibold tracking-tight"
            >
              {target.developerName}
            </h2>
            <span
              className={cn(
                "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                opsStatusToneClass(target.opsStatus),
              )}
            >
              {FECHAMENTO_OPS_STATUS_LABELS[target.opsStatus]}
            </span>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="size-4" strokeWidth={1.9} />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
          {!target.closingId ? (
            <p className="text-sm text-muted-foreground">
              Nenhum fechamento iniciado neste mês.
            </p>
          ) : pending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando detalhes…
            </div>
          ) : error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : (
            <>
              <section className="grid gap-2 sm:grid-cols-2">
                <DocPill
                  label="Comprovante PIX"
                  state={mealPixToDocState(
                    {
                      hasInvoicePdf: Boolean(invoice),
                      hasBoletoPdf: Boolean(boleto),
                      hasMealPixReceipt: Boolean(mealPix),
                      mealPixValid: mealPix?.is_valid ?? null,
                    },
                    target.requireMealPix,
                  )}
                />
                <DocPill
                  label="Recibo colaborador"
                  state={emailDispatchToDocState(colaboradorStatus)}
                />
                <DocPill
                  label="E-mail Financeiro"
                  state={emailDispatchToDocState(
                    financeiroStatus,
                    canResendFinanceiro,
                  )}
                />
                <DocPill
                  label="E-mail RH"
                  state={emailDispatchToDocState(rhStatus)}
                />
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Documentos</h3>
                <ul className="space-y-1.5 text-sm">
                  {([invoice, boleto, mealPix] as const).map((row, index) => {
                    const type =
                      index === 0
                        ? "invoice_pdf"
                        : index === 1
                          ? "boleto_pdf"
                          : "meal_pix_receipt";
                    return (
                      <li
                        key={type}
                        className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border px-3 py-2"
                      >
                        <span className="text-muted-foreground">
                          {monthlyClosingAttachmentTypeLabel(type)}
                        </span>
                        <span className="font-medium">
                          {row ? "Enviado" : "Ausente"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Ações</h3>
                {actionError ? (
                  <p className="text-xs text-danger">{actionError}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!canResendFinanceiro || actionPending}
                    onClick={() => resend("financeiro")}
                    className="ui-btn-primary text-xs"
                  >
                    {actionPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Mail className="size-3.5" />
                    )}
                    {financeiroStatus === "sent"
                      ? "Reenviar Financeiro"
                      : "Enviar Financeiro"}
                  </button>
                  {target.requireMealPix && target.closingId ? (
                    <button
                      type="button"
                      disabled={!canResendRh || actionPending}
                      onClick={() => resend("rh")}
                      className="ui-btn-secondary text-xs"
                    >
                      {rhStatus === "sent" ? "Reenviar RH" : "Enviar RH"}
                    </button>
                  ) : null}
                  {target.closingId ? (
                    <button
                      type="button"
                      disabled={!canResendColaborador || actionPending}
                      onClick={() => resend("colaborador")}
                      className="ui-btn-secondary text-xs"
                      title={
                        canResendColaborador
                          ? reciboAnexaDocs
                            ? "Recibo com NF e boleto anexados"
                            : "Recibo sem NF/boleto (ainda não enviados no fechamento)"
                          : "Disponível após finalize"
                      }
                    >
                      {colaboradorStatus === "sent"
                        ? "Reenviar recibo"
                        : "Enviar recibo"}
                    </button>
                  ) : null}
                  {target.closingId ? (
                    <Link
                      href={`/app/gestor/fechamentos/${target.closingId}`}
                      className="ui-btn-secondary text-xs"
                    >
                      Abrir ficha completa
                    </Link>
                  ) : null}
                </div>
                {financeiroStatus ? (
                  <p className="text-xs text-muted-foreground">
                    Financeiro: {EMAIL_DISPATCH_STATUS_LABELS[financeiroStatus]}
                    {financeiroDispatch?.error_message
                      ? ` · ${financeiroDispatch.error_message}`
                      : ""}
                  </p>
                ) : null}
                {target.requireMealPix && rhStatus ? (
                  <p className="text-xs text-muted-foreground">
                    RH: {EMAIL_DISPATCH_STATUS_LABELS[rhStatus]}
                    {rhDispatch?.error_message
                      ? ` · ${rhDispatch.error_message}`
                      : ""}
                  </p>
                ) : null}
                {colaboradorStatus ? (
                  <p className="text-xs text-muted-foreground">
                    Recibo colaborador:{" "}
                    {EMAIL_DISPATCH_STATUS_LABELS[colaboradorStatus]}
                    {colaboradorDispatch?.error_message
                      ? ` · ${colaboradorDispatch.error_message}`
                      : ""}
                    {canResendColaborador
                      ? reciboAnexaDocs
                        ? " · anexa NF + boleto"
                        : " · sem NF/boleto"
                      : ""}
                  </p>
                ) : null}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Timeline</h3>
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem eventos.</p>
                ) : (
                  <ol className="space-y-2">
                    {events.map((event) => (
                      <li
                        key={event.id}
                        className="rounded-[var(--radius-sm)] border border-border px-3 py-2"
                      >
                        <p className="text-sm font-medium">
                          {eventLabel(event.event_type)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTimeBrazil(event.created_at)}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
