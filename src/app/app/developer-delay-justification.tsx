"use client";

import { submitDelayJustificationAction } from "@/app/app/delay-actions";
import { cn } from "@/lib/utils";
import type {
  DelayJustificationKind,
  DelayJustificationStatus,
} from "@/types/delay-justification";
import { justificationKindLabel } from "@/types/delay-justification";
import { Loader2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

export type DelayJustificationBadgeInfo = {
  id: string;
  status: DelayJustificationStatus;
  developerNote: string;
  reviewerNote: string | null;
};

const STATUS_LABEL: Record<DelayJustificationStatus, string> = {
  pending: "Pendente",
  accepted: "Aceito",
  rejected: "Rejeitado",
};

export function DelayJustificationStatusBadge({
  status,
  className,
}: {
  status: DelayJustificationStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
        status === "pending" &&
          "border-amber-500/40 bg-amber-500/15 text-amber-950 dark:text-amber-100",
        status === "accepted" &&
          "border-emerald-500/40 bg-emerald-500/15 text-emerald-950 dark:text-emerald-100",
        status === "rejected" &&
          "border-rose-500/40 bg-rose-500/15 text-rose-950 dark:text-rose-100",
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

type JustifyDeliveryButtonProps = {
  importId: string;
  jiraCardId: string;
  jiraKey: string;
  kind: DelayJustificationKind;
  existing: DelayJustificationBadgeInfo | null;
};

export function JustifyDeliveryButton({
  importId,
  jiraCardId,
  jiraKey,
  kind,
  existing,
}: JustifyDeliveryButtonProps) {
  const [open, setOpen] = useState(false);
  const canRequest =
    existing == null || existing.status === "rejected";
  const kindLabel = justificationKindLabel(kind);

  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {kindLabel}
      </span>
      {existing ? (
        <DelayJustificationStatusBadge status={existing.status} />
      ) : null}
      {canRequest ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-medium text-brand underline-offset-4 hover:underline"
        >
          {existing?.status === "rejected"
            ? "Reenviar"
            : `Justificar ${kindLabel.toLowerCase()}`}
        </button>
      ) : null}
      {open ? (
        <JustifyDeliveryModal
          importId={importId}
          jiraCardId={jiraCardId}
          jiraKey={jiraKey}
          kind={kind}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** @deprecated Prefer JustifyDeliveryButton with kind="delay" */
export function JustifyDelayButton(
  props: Omit<JustifyDeliveryButtonProps, "kind">,
) {
  return <JustifyDeliveryButton {...props} kind="delay" />;
}

function JustifyDeliveryModal({
  importId,
  jiraCardId,
  jiraKey,
  kind,
  onClose,
}: {
  importId: string;
  jiraCardId: string;
  jiraKey: string;
  kind: DelayJustificationKind;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const kindLabel = justificationKindLabel(kind);

  useEffect(() => {
    setMounted(true);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await submitDelayJustificationAction({
        importId,
        jiraCardId,
        developerNote: note,
        kind,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(90dvh,100%)] w-full min-w-0 max-w-md flex-col gap-4 overflow-x-hidden overflow-y-auto rounded-t-[var(--radius)] border border-border bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-md)] sm:rounded-[var(--radius)] sm:p-5"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Justificar {kindLabel.toLowerCase()}
            </p>
            <h2
              id={titleId}
              className="truncate text-base font-semibold tracking-tight"
            >
              {jiraKey}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
            aria-label="Fechar"
          >
            <X className="size-4" strokeWidth={1.9} />
          </button>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5 text-sm">
          <label htmlFor={`${titleId}-note`} className="font-medium">
            Motivo do {kindLabel.toLowerCase()}
          </label>
          <textarea
            id={`${titleId}-note`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            required
            placeholder={`Explique o contexto do ${kindLabel.toLowerCase()} para o gestor avaliar.`}
            className="ui-textarea min-h-[6.5rem] min-w-0 max-w-full"
          />
        </div>

        {error ? (
          <p className="text-sm text-danger text-pretty">{error}</p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="ui-btn-secondary w-full sm:w-auto"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !note.trim()}
            className="ui-btn-primary w-full sm:w-auto"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Enviar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
