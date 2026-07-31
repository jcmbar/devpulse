import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  className?: string;
  eyebrow?: string;
};

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  className,
  eyebrow,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b border-border/50 pb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-5 sm:pb-6",
        className,
      )}
    >
      <div className="min-w-0 space-y-2">
        {breadcrumb ? (
          <div className="text-sm text-muted-foreground">{breadcrumb}</div>
        ) : null}
        {eyebrow ? (
          <p className="text-[11px] font-semibold tracking-[0.14em] text-brand uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl sm:text-[2rem]">
          {title}
        </h1>
        {description ? (
          <div className="max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">
            {description}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex w-full min-w-0 shrink-0 flex-col gap-2 sm:w-auto sm:items-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
