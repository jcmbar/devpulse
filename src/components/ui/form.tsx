import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type FormFieldProps = {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Label + control + optional hint, using premium `.ui-*` primitives. */
export function FormField({
  label,
  htmlFor,
  hint,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn("ui-field", className)}>
      <label htmlFor={htmlFor} className="ui-label">
        {label}
      </label>
      {children}
      {hint ? <p className="ui-hint">{hint}</p> : null}
    </div>
  );
}

type FormSectionProps = {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  actions?: ReactNode;
};

export function FormSectionHeader({
  title,
  description,
  actions,
  className,
}: FormSectionProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="space-y-1">
        <h2 className="ui-form-section-title">{title}</h2>
        {description ? (
          <div className="ui-form-section-desc max-w-2xl">{description}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

type FormFeedbackProps = {
  error?: string | null;
  success?: string | null;
};

export function FormFeedback({ error, success }: FormFeedbackProps) {
  if (error) {
    return (
      <p className="ui-alert-error" role="alert">
        {error}
      </p>
    );
  }
  if (success) {
    return (
      <p className="ui-alert-success" role="status">
        {success}
      </p>
    );
  }
  return null;
}

type FormCheckProps = {
  children: ReactNode;
  className?: string;
};

export function FormCheck({ children, className }: FormCheckProps) {
  return <label className={cn("ui-check", className)}>{children}</label>;
}

type FormActionButtonProps = {
  label: ReactNode;
  /** Shown while `pending` is true. Falls back to `label`. */
  loadingLabel?: ReactNode;
  pending?: boolean;
  disabled?: boolean;
  type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  name?: string;
  value?: string;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  form?: string;
  className?: string;
};

type FormActionsProps = {
  primary: FormActionButtonProps;
  secondary?: FormActionButtonProps & {
    /** Visual weight. Defaults to `secondary` (never competes with primary). */
    variant?: "secondary" | "ghost";
  };
  /** Optional helper text near the action row. */
  hint?: ReactNode;
  /** Full-width stacked actions (auth screens). */
  fullWidth?: boolean;
  className?: string;
};

/**
 * Standard form action row: one primary + optional secondary.
 * Reuses `.ui-btn-*` primitives; keeps DOM order primary → secondary.
 */
export function FormActions({
  primary,
  secondary,
  hint,
  fullWidth = false,
  className,
}: FormActionsProps) {
  const primaryPending = Boolean(primary.pending);
  const secondaryPending = Boolean(secondary?.pending);

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          "flex gap-3",
          fullWidth
            ? "flex-col"
            : "flex-col sm:flex-row sm:flex-wrap sm:items-center",
        )}
      >
        <button
          type={primary.type ?? "submit"}
          name={primary.name}
          value={primary.value}
          form={primary.form}
          onClick={primary.onClick}
          disabled={primary.disabled || primaryPending}
          aria-busy={primaryPending || undefined}
          className={cn(
            "ui-btn-primary",
            fullWidth && "w-full",
            primary.className,
          )}
        >
          {primaryPending ? (
            <Loader2
              className="size-3.5 shrink-0 animate-spin"
              strokeWidth={2}
              aria-hidden
            />
          ) : null}
          {primaryPending && primary.loadingLabel != null
            ? primary.loadingLabel
            : primary.label}
        </button>

        {secondary ? (
          <button
            type={secondary.type ?? "button"}
            name={secondary.name}
            value={secondary.value}
            form={secondary.form}
            onClick={secondary.onClick}
            disabled={secondary.disabled || secondaryPending}
            aria-busy={secondaryPending || undefined}
            className={cn(
              secondary.variant === "ghost"
                ? "ui-btn-ghost"
                : "ui-btn-secondary",
              fullWidth && "w-full",
              secondary.className,
            )}
          >
            {secondaryPending ? (
              <Loader2
                className="size-3.5 shrink-0 animate-spin"
                strokeWidth={2}
                aria-hidden
              />
            ) : null}
            {secondaryPending && secondary.loadingLabel != null
              ? secondary.loadingLabel
              : secondary.label}
          </button>
        ) : null}
      </div>
      {hint ? <p className="ui-hint">{hint}</p> : null}
    </div>
  );
}
