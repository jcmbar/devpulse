"use client";

import { sendFinanceiroClosingEmailAction } from "@/app/app/gestor/email-actions";
import { cn } from "@/lib/utils";
import type { EmailDispatchStatus } from "@/types/operational-email";
import { EMAIL_DISPATCH_STATUS_LABELS } from "@/types/operational-email";
import { Loader2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function FinanceiroEmailSendButton({
  closingId,
  enabled,
  status = null,
  errorMessage = null,
  compact = false,
  matrix = false,
}: {
  closingId: string;
  enabled: boolean;
  status?: EmailDispatchStatus | null;
  /** Persisted dispatch error (shown when status is error). */
  errorMessage?: string | null;
  compact?: boolean;
  /** Layout mais curto para células da matriz anual. */
  matrix?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await sendFinanceiroClosingEmailAction({ closingId });
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
          ? "Fin."
          : "Financeiro";

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
        title={
          enabled
            ? status === "sent"
              ? `Reenviar ao Financeiro (NF + boleto) · ${statusLabel}`
              : status === "error"
                ? `Retentar envio ao Financeiro · ${displayError ?? statusLabel}`
                : `Enviar ao Financeiro (NF + boleto) · ${statusLabel}`
            : `Disponível após finalize com NF e boleto · ${statusLabel}`
        }
        className={cn(
          "inline-flex items-center justify-center gap-1 rounded-[var(--radius-sm)] border font-semibold transition-colors",
          matrix
            ? "min-h-7 min-w-[4.25rem] px-2 py-1 text-[11px]"
            : "px-1.5 py-0.5 text-[10px]",
          enabled
            ? status === "error"
              ? "border-rose-500/50 bg-rose-500/15 text-rose-900 hover:bg-rose-500/25 dark:text-rose-100"
              : "border-teal-500/50 bg-teal-500/15 text-teal-900 hover:bg-teal-500/25 dark:text-teal-100"
            : "cursor-not-allowed border-border bg-muted/30 text-muted-foreground opacity-60",
        )}
      >
        {pending ? (
          <Loader2 className={cn(matrix ? "size-3.5" : "size-3", "animate-spin")} />
        ) : (
          <Mail
            className={matrix ? "size-3.5" : "size-3"}
            strokeWidth={2}
          />
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
