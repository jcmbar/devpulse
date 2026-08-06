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
  compact = false,
}: {
  closingId: string;
  enabled: boolean;
  status?: EmailDispatchStatus | null;
  compact?: boolean;
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
        return;
      }
      router.refresh();
    });
  }

  const statusLabel = status
    ? EMAIL_DISPATCH_STATUS_LABELS[status]
    : enabled
      ? "Pronto para envio"
      : "Não disponível";

  return (
    <div className={cn("flex flex-col items-center gap-0.5", compact && "mt-1")}>
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
              ? "Reenviar ao Financeiro (NF + boleto)"
              : "Enviar ao Financeiro (NF + boleto)"
            : "Disponível após finalize com NF e boleto"
        }
        className={cn(
          "inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-1.5 py-0.5 text-[10px] font-semibold transition-colors",
          enabled
            ? "border-teal-500/50 bg-teal-500/15 text-teal-900 hover:bg-teal-500/25 dark:text-teal-100"
            : "cursor-not-allowed border-border bg-muted/30 text-muted-foreground opacity-60",
        )}
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Mail className="size-3" strokeWidth={2} />
        )}
        {compact ? "Fin." : "Financeiro"}
      </button>
      <span
        className={cn(
          "text-[9px] leading-tight",
          status === "sent" && "text-emerald-700 dark:text-emerald-300",
          status === "error" && "text-rose-700 dark:text-rose-300",
          status === "ready" && "text-amber-700 dark:text-amber-300",
          (!status || status === "unavailable") && "text-muted-foreground",
        )}
      >
        {statusLabel}
      </span>
      {error ? (
        <span className="max-w-[8rem] text-[9px] text-danger text-pretty">
          {error}
        </span>
      ) : null}
    </div>
  );
}
