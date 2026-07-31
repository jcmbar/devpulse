"use client";

import {
  approveMonthlyClosingAction,
  finalizeMonthlyClosingAction,
  getMonthlyClosingAttachmentUrlAction,
} from "@/app/app/monthly-closing-actions";
import { cn } from "@/lib/utils";
import type {
  MonthlyClosing,
  MonthlyClosingAttachment,
} from "@/types/monthly-closing";
import { monthlyClosingAttachmentTypeLabel } from "@/types/monthly-closing";
import { AlertTriangle, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

export function GestorClosingDecisionPanel({
  closing,
  attachments,
}: {
  closing: MonthlyClosing;
  attachments: MonthlyClosingAttachment[];
}) {
  const router = useRouter();
  const notesId = useId();
  const [notes, setNotes] = useState(closing.manager_invoice_notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const invoice =
    attachments.find((row) => row.type === "invoice_pdf") ?? null;
  const boleto = attachments.find((row) => row.type === "boleto_pdf") ?? null;
  const canFinalize = Boolean(invoice && boleto);

  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await approveMonthlyClosingAction({
        closingId: closing.id,
        managerInvoiceNotes: notes,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function finalize() {
    setError(null);
    startTransition(async () => {
      const result = await finalizeMonthlyClosingAction({
        closingId: closing.id,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function openAttachment(storageKey: string) {
    startTransition(async () => {
      const result = await getMonthlyClosingAttachmentUrlAction({ storageKey });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="space-y-4">
      {closing.jira_changed_after_finalized ? (
        <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          <p className="text-pretty">
            Houve alteração no Jira após a finalização deste fechamento. Apenas
            para ciência.
            {closing.jira_changed_after_finalized_at ? (
              <span className="mt-1 block text-xs opacity-80">
                Detectado em{" "}
                {new Date(
                  closing.jira_changed_after_finalized_at,
                ).toLocaleString("pt-BR")}
              </span>
            ) : null}
          </p>
        </div>
      ) : null}

      {closing.status === "in_review" ? (
        <section className="space-y-3 rounded-[var(--radius)] border border-brand/25 bg-brand-soft/40 p-4 dark:bg-brand/10">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Aprovar fechamento
            </h3>
            <p className="text-xs text-muted-foreground">
              Revise o snapshot e informe os dados para emissão da nota fiscal.
            </p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={notesId} className="text-sm font-medium">
              Informações para emissão de NF
            </label>
            <textarea
              id={notesId}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              placeholder="Dados para emissão da nota (razão social, CNPJ, descrição, valores, etc.)"
              className="ui-textarea min-h-[7rem]"
            />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <button
            type="button"
            onClick={approve}
            disabled={pending || !notes.trim()}
            className="ui-btn-primary"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Aprovar e fechar
          </button>
        </section>
      ) : null}

      {(closing.status === "closed" || closing.status === "finalized") &&
      closing.manager_invoice_notes ? (
        <section className="space-y-1.5 rounded-[var(--radius-sm)] border border-border px-3 py-3">
          <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Notas para emissão de NF
          </h3>
          <p className="text-sm text-pretty whitespace-pre-wrap">
            {closing.manager_invoice_notes}
          </p>
        </section>
      ) : null}

      {closing.status === "closed" || closing.status === "finalized" ? (
        <section className="space-y-3 rounded-[var(--radius)] border border-border p-4">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Anexos</h3>
            <p className="text-xs text-muted-foreground">
              {closing.status === "closed"
                ? "Valide NF e boleto antes de finalizar."
                : "Documentos do fechamento finalizado."}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["invoice_pdf", invoice],
                ["boleto_pdf", boleto],
              ] as const
            ).map(([type, attachment]) => (
              <div
                key={type}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border px-3 py-2.5 text-sm",
                  attachment
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-border bg-muted/20",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {attachment ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium">
                      {monthlyClosingAttachmentTypeLabel(type)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {attachment?.original_filename ?? "Pendente"}
                    </p>
                  </div>
                </div>
                {attachment ? (
                  <button
                    type="button"
                    onClick={() => openAttachment(attachment.file_storage_key)}
                    disabled={pending}
                    className="shrink-0 text-xs font-medium text-brand underline-offset-4 hover:underline"
                  >
                    Abrir
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {closing.status === "closed" ? (
            <div className="space-y-2 border-t border-border pt-3">
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <button
                type="button"
                onClick={finalize}
                disabled={pending || !canFinalize}
                className="ui-btn-primary"
                title={
                  !canFinalize
                    ? "Aguarde NF e boleto enviados pelo developer"
                    : undefined
                }
              >
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Finalizar
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
