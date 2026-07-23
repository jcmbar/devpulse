"use client";

import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

type FormAction = (formData: FormData) => void | Promise<void>;

type DestructiveActionBase = {
  label?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  /** Short copy shown only in the confirm step. */
  description?: ReactNode;
  pending?: boolean;
  loadingLabel?: ReactNode;
  disabled?: boolean;
  requireConfirm?: boolean;
  /**
   * `inline` — muted ghost trigger (tables).
   * `panel` — secondary trigger until confirm (cards/panels).
   */
  variant?: "inline" | "panel";
  className?: string;
};

type DestructiveActionFormProps = DestructiveActionBase & {
  /** Server action / form action. Renders a wrapping `<form>`. */
  formAction: FormAction;
  children?: ReactNode;
  onConfirm?: never;
};

type DestructiveActionButtonProps = DestructiveActionBase & {
  formAction?: never;
  children?: never;
  onConfirm: () => void;
};

export type DestructiveActionProps =
  | DestructiveActionFormProps
  | DestructiveActionButtonProps;

/**
 * Destructive control with an optional confirm step.
 * Idle state stays quiet; danger emphasis appears only when confirming.
 */
export function DestructiveAction(props: DestructiveActionProps) {
  const {
    label = "Excluir",
    confirmLabel = "Confirmar exclusão",
    cancelLabel = "Cancelar",
    description,
    pending = false,
    loadingLabel = "Excluindo...",
    disabled = false,
    requireConfirm = true,
    variant = "inline",
    className,
  } = props;

  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const groupId = useId();
  const isForm = "formAction" in props && typeof props.formAction === "function";

  useEffect(() => {
    if (!confirming) {
      return;
    }
    confirmRef.current?.focus();
  }, [confirming]);

  useEffect(() => {
    if (!confirming) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setConfirming(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirming]);

  const triggerClass =
    variant === "panel" ? "ui-btn-secondary" : "ui-btn-danger-ghost";

  function handleImmediateConfirm() {
    if (isForm) {
      return;
    }
    props.onConfirm?.();
  }

  const idleButton = (
    <button
      type={isForm && !requireConfirm ? "submit" : "button"}
      disabled={disabled || pending}
      className={cn(triggerClass, className)}
      aria-haspopup={requireConfirm ? "true" : undefined}
      aria-expanded={requireConfirm ? confirming : undefined}
      aria-controls={requireConfirm ? groupId : undefined}
      onClick={
        requireConfirm
          ? () => setConfirming(true)
          : isForm
            ? undefined
            : handleImmediateConfirm
      }
    >
      {pending && !requireConfirm ? (
        <Loader2
          className="size-3.5 shrink-0 animate-spin"
          strokeWidth={2}
          aria-hidden
        />
      ) : null}
      {pending && !requireConfirm ? loadingLabel : label}
    </button>
  );

  const confirmControls = (
    <div
      id={groupId}
      role="group"
      aria-label={
        typeof label === "string" ? `Confirmar: ${label}` : "Confirmar exclusão"
      }
      className={cn(
        "ui-inline-actions max-w-full gap-1.5",
        variant === "panel" &&
          "flex-col items-stretch sm:flex-row sm:items-center",
        className,
      )}
    >
      {description ? (
        <span className="ui-hint px-1 text-danger/90 sm:max-w-xs">
          {description}
        </span>
      ) : null}
      <button
        ref={confirmRef}
        type={isForm ? "submit" : "button"}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        className={cn("ui-btn-danger", variant === "panel" && "sm:w-auto")}
        onClick={isForm ? undefined : () => props.onConfirm?.()}
      >
        {pending ? (
          <Loader2
            className="size-3.5 shrink-0 animate-spin"
            strokeWidth={2}
            aria-hidden
          />
        ) : null}
        {pending ? loadingLabel : confirmLabel}
      </button>
      <button
        type="button"
        disabled={pending}
        className="ui-btn-ghost"
        onClick={() => setConfirming(false)}
      >
        {cancelLabel}
      </button>
    </div>
  );

  const body = requireConfirm && confirming ? confirmControls : idleButton;

  if (isForm) {
    return (
      <form action={props.formAction} className="inline-flex max-w-full">
        {props.children}
        {body}
      </form>
    );
  }

  return body;
}

/** Compact row of table / list action controls. */
export function InlineActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("ui-inline-actions", className)}>{children}</div>;
}
