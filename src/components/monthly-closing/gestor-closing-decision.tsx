"use client";

import {
  approveMonthlyClosingAction,
  finalizeMonthlyClosingAction,
  getMonthlyClosingAttachmentUrlAction,
  rejectMonthlyClosingAction,
  revertMonthlyClosingStatusAction,
} from "@/app/app/monthly-closing-actions";
import { cn } from "@/lib/utils";
import type {
  MonthlyClosing,
  MonthlyClosingAttachment,
} from "@/types/monthly-closing";
import {
  monthlyClosingAttachmentTypeLabel,
  monthlyClosingRevertActionLabel,
  monthlyClosingRevertDescription,
  monthlyClosingRevertTarget,
  monthlyClosingStatusLabel,
} from "@/types/monthly-closing";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
  Undo2,
} from "lucide-react";
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
  const rejectId = useId();
  const [notes, setNotes] = useState(closing.manager_invoice_notes ?? "");
  const [rejectionNotes, setRejectionNotes] = useState("");
  const [mode, setMode] = useState<"approve" | "reject">("approve");
  const [error, setError] = useState<string | null>(null);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [pending, startTransition] = useTransition();

  const invoice =
    attachments.find((row) => row.type === "invoice_pdf") ?? null;
  const boleto = attachments.find((row) => row.type === "boleto_pdf") ?? null;
  const canFinalize = Boolean(invoice && boleto);
  const revertTarget = monthlyClosingRevertTarget(closing.status);
  const revertLabel = monthlyClosingRevertActionLabel(closing.status);
  const revertDescription = monthlyClosingRevertDescription(closing.status);

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

  function reject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectMonthlyClosingAction({
        closingId: closing.id,
        managerRejectionNotes: rejectionNotes,
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

  function revertStatus() {
    setError(null);
    startTransition(async () => {
      const result = await revertMonthlyClosingStatusAction({
        closingId: closing.id,
      });
      if (!result.ok) {
        setError(result.error);
        setConfirmRevert(false);
        return;
      }
      setConfirmRevert(false);
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

      {revertTarget && revertLabel && revertDescription ? (
        <section className="space-y-3 rounded-[var(--radius)] border border-border p-4">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Controle do gestor
            </h3>
            <p className="text-xs text-muted-foreground">
              Disponível para admin e gestor. Volta um status por vez.
            </p>
          </div>

          {confirmRevert ? (
            <div className="space-y-3 rounded-[var(--radius-sm)] border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-sm text-pretty">
                <span className="font-medium">{revertLabel}</span>
                {" — "}
                {monthlyClosingStatusLabel(closing.status)} →{" "}
                {monthlyClosingStatusLabel(revertTarget)}.
              </p>
              <p className="text-xs text-muted-foreground text-pretty">
                {revertDescription}
              </p>
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={revertStatus}
                  disabled={pending}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-amber-500/50 bg-amber-500/20 px-3.5 text-sm font-semibold text-amber-950 disabled:opacity-50 dark:text-amber-100"
                >
                  {pending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Undo2 className="size-3.5" strokeWidth={2} />
                  )}
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmRevert(false);
                    setError(null);
                  }}
                  disabled={pending}
                  className="ui-btn-secondary"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmRevert(true);
                  setError(null);
                }}
                disabled={pending}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-border bg-muted/30 px-3.5 text-sm font-semibold hover:bg-muted disabled:opacity-50"
              >
                <Undo2 className="size-3.5" strokeWidth={2} />
                {revertLabel}
              </button>
            </div>
          )}
        </section>
      ) : null}

      {closing.status === "rejected" ? (
        <section className="space-y-2 rounded-[var(--radius)] border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm">
          <h3 className="font-semibold tracking-tight">
            Devolvido ao developer
          </h3>
          <p className="text-pretty whitespace-pre-wrap">
            {closing.manager_rejection_notes}
          </p>
          {closing.manager_rejected_at ? (
            <p className="text-xs text-muted-foreground">
              Reprovado em{" "}
              {new Date(closing.manager_rejected_at).toLocaleString("pt-BR")}
            </p>
          ) : null}
        </section>
      ) : null}

      {closing.status === "in_review" &&
      closing.manager_rejection_notes ? (
        <section className="space-y-1.5 rounded-[var(--radius-sm)] border border-rose-500/30 bg-rose-500/5 px-3 py-3 text-sm">
          <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Última devolução do gestor
          </h3>
          <p className="text-pretty whitespace-pre-wrap">
            {closing.manager_rejection_notes}
          </p>
          {closing.manager_rejected_at ? (
            <p className="text-xs text-muted-foreground">
              {new Date(closing.manager_rejected_at).toLocaleString("pt-BR")}
            </p>
          ) : null}
        </section>
      ) : null}

      {closing.status === "in_review" &&
      closing.developer_resubmission_notes ? (
        <section className="space-y-1.5 rounded-[var(--radius-sm)] border border-border px-3 py-3 text-sm">
          <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Resposta do developer (reenvio)
          </h3>
          <p className="text-pretty whitespace-pre-wrap">
            {closing.developer_resubmission_notes}
          </p>
          {closing.resubmitted_at ? (
            <p className="text-xs text-muted-foreground">
              Reenviado em{" "}
              {new Date(closing.resubmitted_at).toLocaleString("pt-BR")}
            </p>
          ) : null}
        </section>
      ) : null}

      {closing.status === "in_review" ? (
        <section className="space-y-3 rounded-[var(--radius)] border border-border p-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("approve");
                setError(null);
              }}
              className={cn(
                "rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm font-medium",
                mode === "approve"
                  ? "border-brand/40 bg-brand-soft text-foreground"
                  : "border-border hover:bg-muted",
              )}
            >
              Aprovar
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("reject");
                setError(null);
              }}
              className={cn(
                "rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm font-medium",
                mode === "reject"
                  ? "border-rose-500/40 bg-rose-500/15 text-rose-950 dark:text-rose-100"
                  : "border-border hover:bg-muted",
              )}
            >
              Reprovar com observação
            </button>
          </div>

          {mode === "approve" ? (
            <div className="space-y-3 rounded-[var(--radius-sm)] border border-brand/25 bg-brand-soft/40 p-3 dark:bg-brand/10">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">
                  Aprovar fechamento
                </h3>
                <p className="text-xs text-muted-foreground">
                  Informe os dados para emissão da nota fiscal.
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
            </div>
          ) : (
            <div className="space-y-3 rounded-[var(--radius-sm)] border border-rose-500/35 bg-rose-500/10 p-3">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">
                  Reprovar com observação
                </h3>
                <p className="text-xs text-muted-foreground">
                  Descreva a inconsistência. O developer verá este texto e
                  poderá ajustar/reenviar.
                </p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor={rejectId} className="text-sm font-medium">
                  Observação obrigatória
                </label>
                <textarea
                  id={rejectId}
                  value={rejectionNotes}
                  onChange={(event) => setRejectionNotes(event.target.value)}
                  rows={4}
                  placeholder="Ex.: card AP-123 sem justificativa coerente; horas divergentes do Jira…"
                  className="ui-textarea min-h-[7rem]"
                />
              </div>
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <button
                type="button"
                onClick={reject}
                disabled={pending || !rejectionNotes.trim()}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-rose-500/45 bg-rose-500/15 px-3.5 text-sm font-semibold text-rose-950 disabled:opacity-50 dark:text-rose-100"
              >
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Devolver ao developer
              </button>
            </div>
          )}
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
              {error && !confirmRevert ? (
                <p className="text-sm text-danger">{error}</p>
              ) : null}
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
