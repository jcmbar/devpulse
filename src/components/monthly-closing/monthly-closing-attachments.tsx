"use client";

import {
  getMonthlyClosingAttachmentUrlAction,
  uploadMonthlyClosingAttachmentAction,
} from "@/app/app/monthly-closing-actions";
import { InvoiceIssuerDetailsCard } from "@/components/monthly-closing/invoice-issuer-details-card";
import { formatClosingMoney } from "@/lib/metrics/closing-submit-values";
import {
  formatHoursAsTimeBank,
  formatTimeBankMinutes,
} from "@/lib/metrics/time-bank";
import { cn } from "@/lib/utils";
import type { InvoiceIssuer } from "@/types/invoice-issuer";
import type {
  MonthlyClosing,
  MonthlyClosingAttachment,
  MonthlyClosingAttachmentType,
} from "@/types/monthly-closing";
import type { TimeBankEntry } from "@/types/time-bank";
import {
  closingOffersMealPixSlot,
  monthlyClosingAttachmentTypeLabel,
} from "@/types/monthly-closing";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

type AttachmentSlotProps = {
  closing: MonthlyClosing;
  type: MonthlyClosingAttachmentType;
  attachment: MonthlyClosingAttachment | null;
  readOnly: boolean;
  hint?: string | null;
};

function attachmentStatusText(
  type: MonthlyClosingAttachmentType,
  attachment: MonthlyClosingAttachment,
): string {
  if (type !== "meal_pix_receipt") {
    return attachment.is_valid ? " · validado" : "";
  }
  if (attachment.is_valid === true) {
    return " · aceito pelo gestor";
  }
  if (attachment.is_valid === false) {
    return " · recusado — envie novamente";
  }
  return " · aguardando aceite do gestor";
}

function AttachmentSlot({
  closing,
  type,
  attachment,
  readOnly,
  hint = null,
}: AttachmentSlotProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const label = monthlyClosingAttachmentTypeLabel(type);
  const uploaded = attachment != null;
  const slotTone =
    type === "meal_pix_receipt"
      ? uploaded && attachment.is_valid === true
        ? "ok"
        : uploaded && attachment.is_valid === false
          ? "rejected"
          : uploaded
            ? "pending"
            : "empty"
      : uploaded
        ? "ok"
        : "empty";

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
        attachmentId: attachment.id,
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
        "min-w-0 overflow-hidden rounded-[var(--radius-sm)] border px-3 py-3",
        slotTone === "ok" && "border-emerald-500/40 bg-emerald-500/10",
        slotTone === "rejected" && "border-rose-500/40 bg-rose-500/10",
        slotTone === "pending" && "border-amber-500/40 bg-amber-500/10",
        slotTone === "empty" && "border-border bg-muted/20",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {slotTone === "ok" ? (
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
          <div className="min-w-0">
            <p className="text-sm font-semibold">{label} (PDF)</p>
            {uploaded ? (
              <p
                className="truncate text-xs text-muted-foreground"
                title={attachment.original_filename}
              >
                {attachment.original_filename}
                {attachmentStatusText(type, attachment)}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {readOnly ? "Não enviado" : "Aguardando upload"}
              </p>
            )}
            {hint ? (
              <p className="mt-1 text-xs text-muted-foreground text-pretty">
                {hint}
              </p>
            ) : null}
            {attachment?.review_notes && attachment.is_valid === false ? (
              <p className="mt-1 text-xs text-rose-700 dark:text-rose-300 text-pretty">
                Motivo: {attachment.review_notes}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
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

export function MonthlyClosingValuesSummary({
  closing,
  timeBankBalanceBeforeClosingMinutes = 0,
  recordedTimeBankEntry = null,
}: {
  closing: MonthlyClosing;
  timeBankBalanceBeforeClosingMinutes?: number;
  recordedTimeBankEntry?: TimeBankEntry | null;
}) {
  const hasValues =
    closing.compensation_base_amount != null ||
    closing.differential_amount != null ||
    closing.travel_amount != null ||
    closing.meal_amount != null ||
    closing.invoice_amount != null;

  if (!hasValues) {
    return null;
  }

  const rows: { label: string; value: string }[] = [
    {
      label: "Valor Base",
      value: formatClosingMoney(closing.compensation_base_amount),
    },
    {
      label: "Valor Diferencial",
      value: formatClosingMoney(closing.differential_amount),
    },
    {
      label: "Valor Deslocamento",
      value: formatClosingMoney(closing.travel_amount),
    },
    {
      label: "Valor Refeição",
      value: formatClosingMoney(closing.meal_amount),
    },
    {
      label: "Desconto",
      // Fechamento grava NF sem desconto no envio (descontos ficam na Folha).
      value: formatClosingMoney(0),
    },
    {
      label: "Valor da nota fiscal",
      value: formatClosingMoney(closing.invoice_amount),
    },
  ];

  if (closing.time_bank_enabled_snapshot) {
    rows.splice(1, 0, {
      label: "Saldo anterior banco",
      value: formatTimeBankMinutes(timeBankBalanceBeforeClosingMinutes),
    });
    rows.splice(2, 0, {
      label: "Impacto no banco",
      value: recordedTimeBankEntry
        ? formatTimeBankMinutes(
            recordedTimeBankEntry.entry_type === "credit"
              ? recordedTimeBankEntry.minutes_amount
              : -recordedTimeBankEntry.minutes_amount,
          )
        : formatHoursAsTimeBank(closing.time_bank_hours_delta),
    });
    if (recordedTimeBankEntry) {
      rows.splice(3, 0, {
        label: "Saldo após lançamento",
        value: formatTimeBankMinutes(recordedTimeBankEntry.balance_after_minutes),
      });
    }
  }

  return (
    <div className="rounded-[var(--radius-sm)] border border-border bg-muted/20 px-3 py-3">
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        Valores do fechamento
      </p>
      <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd
              className={cn(
                "tabular-nums font-medium",
                row.label === "Valor da nota fiscal" && "font-semibold",
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ClosingValuesSummary({
  closing,
  timeBankBalanceBeforeClosingMinutes = 0,
  recordedTimeBankEntry = null,
}: {
  closing: MonthlyClosing;
  timeBankBalanceBeforeClosingMinutes?: number;
  recordedTimeBankEntry?: TimeBankEntry | null;
}) {
  return (
    <MonthlyClosingValuesSummary
      closing={closing}
      timeBankBalanceBeforeClosingMinutes={timeBankBalanceBeforeClosingMinutes}
      recordedTimeBankEntry={recordedTimeBankEntry}
    />
  );
}

export function MonthlyClosingAttachmentsPanel({
  closing,
  attachments,
  invoiceIssuer = null,
  requireMealPixReceipt = false,
  timeBankBalanceBeforeClosingMinutes = 0,
  recordedTimeBankEntry = null,
}: {
  closing: MonthlyClosing;
  attachments: MonthlyClosingAttachment[];
  invoiceIssuer?: InvoiceIssuer | null;
  /** Cadastro Valores: cobrar comprovante PIX após finalize. */
  requireMealPixReceipt?: boolean;
  timeBankBalanceBeforeClosingMinutes?: number;
  recordedTimeBankEntry?: TimeBankEntry | null;
}) {
  if (closing.status !== "closed" && closing.status !== "finalized") {
    return null;
  }

  const invoice =
    attachments.find((row) => row.type === "invoice_pdf") ?? null;
  const boleto = attachments.find((row) => row.type === "boleto_pdf") ?? null;
  const mealPix =
    attachments.find((row) => row.type === "meal_pix_receipt") ?? null;
  const docsReadOnly = closing.status === "finalized";
  const showMealPix = closingOffersMealPixSlot({
    closing,
    requireMealPixReceipt,
    hasMealPixAttachment: mealPix != null,
  });
  const mealPixReadOnly = mealPix?.is_valid === true;

  return (
    <section className="space-y-3 rounded-[var(--radius)] border border-border bg-[var(--surface)] p-4">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">
          Documentos do fechamento
        </h3>
        <p className="text-xs text-muted-foreground">
          {docsReadOnly
            ? showMealPix
              ? "Fechamento finalizado — NF e boleto ficam bloqueados; o comprovante PIX de refeição ainda pode ser enviado."
              : "Fechamento finalizado — documentos somente leitura."
            : showMealPix
              ? "Envie a nota fiscal, o boleto e o comprovante PIX de refeição (restaurante) em PDF."
              : "Envie a nota fiscal e o boleto em PDF para o gestor finalizar."}
        </p>
      </div>
      {invoiceIssuer ? (
        <InvoiceIssuerDetailsCard
          issuer={invoiceIssuer}
          observation={closing.manager_invoice_notes}
          title="Orientações do gestor para NF"
        />
      ) : closing.manager_invoice_notes ? (
        <div className="rounded-[var(--radius-sm)] border border-border bg-muted/20 px-3 py-2.5">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Observação para a NF
          </p>
          <p className="mt-1 text-sm text-pretty whitespace-pre-wrap">
            {closing.manager_invoice_notes}
          </p>
        </div>
      ) : null}
      <ClosingValuesSummary
        closing={closing}
        timeBankBalanceBeforeClosingMinutes={timeBankBalanceBeforeClosingMinutes}
        recordedTimeBankEntry={recordedTimeBankEntry}
      />
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <AttachmentSlot
          closing={closing}
          type="invoice_pdf"
          attachment={invoice}
          readOnly={docsReadOnly}
        />
        <AttachmentSlot
          closing={closing}
          type="boleto_pdf"
          attachment={boleto}
          readOnly={docsReadOnly}
        />
        {showMealPix ? (
          <AttachmentSlot
            closing={closing}
            type="meal_pix_receipt"
            attachment={mealPix}
            readOnly={mealPixReadOnly}
            hint={
              requireMealPixReceipt
                ? "Obrigatório. Sem aceite do gestor, novos fechamentos ficam bloqueados."
                : "Comprovante PIX do reembolso de refeição (restaurante)."
            }
          />
        ) : null}
      </div>
    </section>
  );
}
