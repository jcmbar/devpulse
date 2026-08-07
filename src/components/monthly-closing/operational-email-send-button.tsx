"use client";

import {
  sendFinanceiroClosingEmailAction,
  sendOperationalEmailByTypeAction,
} from "@/app/app/gestor/email-actions";
import { cn } from "@/lib/utils";
import type {
  EmailDispatchStatus,
  EmailSendTypeCode,
} from "@/types/operational-email";
import { EMAIL_DISPATCH_STATUS_LABELS } from "@/types/operational-email";
import { Loader2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const TYPE_META: Record<
  EmailSendTypeCode,
  {
    fullLabel: string;
    compactLabel: string;
    readyHint: string;
    blockedHint: string;
    tone: "teal" | "emerald" | "cyan";
  }
> = {
  financeiro: {
    fullLabel: "Financeiro",
    compactLabel: "Fin.",
    readyHint: "Enviar ao Financeiro (NF + boleto)",
    blockedHint: "Disponível após finalize com NF e boleto",
    tone: "teal",
  },
  rh: {
    fullLabel: "RH",
    compactLabel: "RH",
    readyHint: "Enviar ao RH (comprovante PIX)",
    blockedHint: "Disponível com comprovante PIX de refeição",
    tone: "emerald",
  },
  colaborador: {
    fullLabel: "Recibo",
    compactLabel: "Rec.",
    readyHint: "Enviar recibo ao colaborador (anexa NF/boleto se existirem)",
    blockedHint: "Disponível após finalize do fechamento",
    tone: "cyan",
  },
};

const TONE_ENABLED: Record<
  "teal" | "emerald" | "cyan",
  string
> = {
  teal: "border-teal-500/50 bg-teal-500/15 text-teal-900 hover:bg-teal-500/25 dark:text-teal-100",
  emerald:
    "border-emerald-500/50 bg-emerald-500/15 text-emerald-900 hover:bg-emerald-500/25 dark:text-emerald-100",
  cyan: "border-cyan-500/50 bg-cyan-500/15 text-cyan-900 hover:bg-cyan-500/25 dark:text-cyan-100",
};

export function OperationalEmailSendButton({
  closingId,
  typeCode,
  enabled,
  status = null,
  errorMessage = null,
  compact = false,
  matrix = false,
  titleExtra,
}: {
  closingId: string;
  typeCode: EmailSendTypeCode;
  enabled: boolean;
  status?: EmailDispatchStatus | null;
  errorMessage?: string | null;
  compact?: boolean;
  matrix?: boolean;
  /** Extra context for the button title (e.g. NF+boleto attached). */
  titleExtra?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const meta = TYPE_META[typeCode];

  function send() {
    setError(null);
    startTransition(async () => {
      const result =
        typeCode === "financeiro"
          ? await sendFinanceiroClosingEmailAction({ closingId })
          : await sendOperationalEmailByTypeAction({
              closingId,
              typeCode,
            });
      if (!result.ok) {
        setError(result.error);
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  const displayError =
    error ?? (status === "error" ? errorMessage : null);

  const statusLabel = status
    ? EMAIL_DISPATCH_STATUS_LABELS[status]
    : enabled
      ? "Pronto para envio"
      : "Não disponível";

  const shortStatus =
    status === "sent"
      ? "Enviado"
      : status === "error"
        ? "Erro"
        : status === "ready" || (enabled && status == null)
          ? "Pronto"
          : "Indisp.";

  const buttonLabel =
    status === "sent"
      ? compact || matrix
        ? "Reenv."
        : "Reenviar"
      : status === "error"
        ? compact || matrix
          ? "Retentar"
          : "Tentar de novo"
        : compact || matrix
          ? meta.compactLabel
          : meta.fullLabel;

  const titleBase = enabled
    ? status === "sent"
      ? `Reenviar ${meta.fullLabel} · ${statusLabel}`
      : status === "error"
        ? `Retentar envio ${meta.fullLabel} · ${displayError ?? statusLabel}`
        : `${meta.readyHint} · ${statusLabel}`
    : `${meta.blockedHint} · ${statusLabel}`;

  return (
    <div
      className={cn(
        "flex flex-col items-center",
        matrix ? "gap-1" : "gap-0.5",
        compact && !matrix && "mt-1",
      )}
    >
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!enabled || pending) {
            return;
          }
          send();
        }}
        disabled={!enabled || pending}
        title={titleExtra ? `${titleBase} · ${titleExtra}` : titleBase}
        className={cn(
          "inline-flex items-center justify-center gap-1 rounded-[var(--radius-sm)] border font-semibold transition-colors",
          matrix
            ? "min-h-7 min-w-[4.25rem] px-2 py-1 text-[11px]"
            : "px-1.5 py-0.5 text-[10px]",
          enabled
            ? status === "error"
              ? "border-rose-500/50 bg-rose-500/15 text-rose-900 hover:bg-rose-500/25 dark:text-rose-100"
              : TONE_ENABLED[meta.tone]
            : "cursor-not-allowed border-border bg-muted/30 text-muted-foreground opacity-60",
        )}
      >
        {pending ? (
          <Loader2
            className={cn(matrix ? "size-3.5" : "size-3", "animate-spin")}
          />
        ) : (
          <Mail className={matrix ? "size-3.5" : "size-3"} strokeWidth={2} />
        )}
        {pending ? (matrix || compact ? "…" : "Enviando…") : buttonLabel}
      </button>
      <span
        className={cn(
          "leading-tight",
          matrix ? "text-[10px]" : "text-[9px]",
          status === "sent" && "text-emerald-700 dark:text-emerald-300",
          status === "error" && "text-rose-700 dark:text-rose-300",
          status === "ready" && "text-amber-700 dark:text-amber-300",
          (!status || status === "unavailable") && "text-muted-foreground",
        )}
      >
        {matrix ? shortStatus : statusLabel}
      </span>
      {displayError ? (
        <span
          className={cn(
            "text-danger text-pretty text-left",
            matrix ? "max-w-[9rem] text-[9px]" : "max-w-[14rem] text-[10px]",
          )}
          title={displayError}
        >
          {displayError}
        </span>
      ) : null}
    </div>
  );
}

/** @deprecated Prefer OperationalEmailSendButton with typeCode="financeiro". */
export function FinanceiroEmailSendButton(props: {
  closingId: string;
  enabled: boolean;
  status?: EmailDispatchStatus | null;
  errorMessage?: string | null;
  compact?: boolean;
  matrix?: boolean;
}) {
  return <OperationalEmailSendButton {...props} typeCode="financeiro" />;
}
