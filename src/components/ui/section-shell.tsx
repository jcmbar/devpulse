import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type SectionShellProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Extra class on the body wrapper around children. */
  bodyClassName?: string;
};

/**
 * One-job section: title + short description + optional actions + body.
 * Use between filter bars, KPI strips, and tables.
 */
export function SectionShell({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: SectionShellProps) {
  return (
    <section className={cn("ui-section", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="ui-section__header min-w-0">
          <h2 className="ui-section__title">{title}</h2>
          {description ? (
            <div className="ui-section__description">{description}</div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

type FilterBarProps = {
  children: ReactNode;
  className?: string;
};

/** Compact container for date/source/lote controls. */
export function FilterBar({ children, className }: FilterBarProps) {
  return <div className={cn("ui-filter-bar", className)}>{children}</div>;
}
