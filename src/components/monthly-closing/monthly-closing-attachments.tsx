"use client";

import {
  getMonthlyClosingAttachmentUrlAction,
  uploadMonthlyClosingAttachmentAction,
} from "@/app/app/monthly-closing-actions";
import { cn } from "@/lib/utils";
import type {
  MonthlyClosing,
  MonthlyClosingAttachment,
  MonthlyClosingAttachmentType,
} from "@/types/monthly-closing";
import { monthlyClosingAttachmentTypeLabel } from "@/types/monthly-closing";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

type AttachmentSlotProps = {
  closing: MonthlyClosing;
  type: MonthlyClosingAttachmentType;
  attachment: MonthlyClosingAttachment | null;
  readOnly: boolean;
};

function AttachmentSlot({
  closing,
  type,
  attachment,
  readOnly,
}: AttachmentSlotProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const label = monthlyClosingAttachmentTypeLabel(type);
  const uploaded = attachment != null;

  function onFileChange(file: File | null) {
    if (!file) {
      return;
    }
    setError(null);
    const formData = new FormData();
    formData.set("closingId", closing.id);
    formData.set("type", type);
    formData.set("file", file);
    startTransition(async () => {
      const result = await uploadMonthlyClosingAttachmentAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function openAttachment() {
    if (!attachment) {
      return;
    }
    startTransition(async () => {
      const result = await getMonthlyClosingAttachmentUrlAction({
        storageKey: attachment.file_storage_key,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div
      className={cn(
        "rounded-[var(--radius-sm)] border px-3 py-3",
        uploaded
          ? "border-emerald-500/40 bg-emerald-500/10"
          : "border-border bg-muted/20",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          {uploaded ? (
            <CheckCircle2
              className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-300"
              strokeWidth={2}
              aria-hidden
            />
          ) : (
            <Circle
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              strokeWidth={2}
              aria-hidden
            />
          )}
          <div>
            <p className="text-sm font-semibold">{label} (PDF)</p>
            {uploaded ? (
              <p className="text-xs text-muted-foreground">
                {attachment.original_filename}
                {attachment.is_valid ? " · validado" : ""}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {readOnly ? "Não enviado" : "Aguardando upload"}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {uploaded ? (
            <button
              type="button"
              onClick={openAttachment}
              disabled={pending}
              className="ui-btn-secondary text-xs"
            >
              Abrir
            </button>
          ) : null}
          {!readOnly ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(event) => {
                  onFileChange(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={pending}
                className="ui-btn-primary text-xs"
              >
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : null}
                {uploaded ? "Substituir PDF" : "Enviar PDF"}
              </button>
            </>
          ) : null}
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function MonthlyClosingAttachmentsPanel({
  closing,
  attachments,
}: {
  closing: MonthlyClosing;
  attachments: MonthlyClosingAttachment[];
}) {
  if (closing.status !== "closed" && closing.status !== "finalized") {
    return null;
  }

  const invoice =
    attachments.find((row) => row.type === "invoice_pdf") ?? null;
  const boleto = attachments.find((row) => row.type === "boleto_pdf") ?? null;
  const readOnly = closing.status === "finalized";

  return (
    <section className="space-y-3 rounded-[var(--radius)] border border-border bg-[var(--surface)] p-4">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">
          Documentos do fechamento
        </h3>
        <p className="text-xs text-muted-foreground">
          {readOnly
            ? "Fechamento finalizado — documentos somente leitura."
            : "Envie a nota fiscal e o boleto em PDF para o gestor finalizar."}
        </p>
      </div>
      {closing.manager_invoice_notes ? (
        <div className="rounded-[var(--radius-sm)] border border-border bg-muted/20 px-3 py-2.5">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Orientações do gestor para NF
          </p>
          <p className="mt-1 text-sm text-pretty whitespace-pre-wrap">
            {closing.manager_invoice_notes}
          </p>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <AttachmentSlot
          closing={closing}
          type="invoice_pdf"
          attachment={invoice}
          readOnly={readOnly}
        />
        <AttachmentSlot
          closing={closing}
          type="boleto_pdf"
          attachment={boleto}
          readOnly={readOnly}
        />
      </div>
    </section>
  );
}
