import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type SurfaceProps = {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  interactive?: boolean;
};

export function Surface({
  children,
  className,
  padded = true,
  interactive = false,
}: SurfaceProps) {
  return (
    <div
      className={cn(
        "ui-card",
        padded && "p-4 sm:p-5",
        interactive &&
          "transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

type DataTableProps = {
  children: ReactNode;
  className?: string;
  minWidthClassName?: string;
};

export function DataTable({
  children,
  className,
  minWidthClassName = "min-w-[640px]",
}: DataTableProps) {
  return (
    <div className={cn("ui-table-wrap", className)}>
      <table className={cn("ui-table", minWidthClassName)}>{children}</table>
    </div>
  );
}

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "ui-card flex flex-col items-start gap-3 px-5 py-8 sm:items-center sm:px-8 sm:py-12 sm:text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="inline-flex size-11 items-center justify-center rounded-2xl border border-brand/20 bg-brand-soft text-brand-foreground">
          <Icon className="size-5" strokeWidth={1.9} />
        </span>
      ) : null}
      <div className="space-y-1.5">
        <p className="text-base font-semibold tracking-tight">{title}</p>
        {description ? (
          <div className="max-w-md text-sm leading-relaxed text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
