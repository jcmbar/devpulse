"use client";

import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

type CollapsibleSectionProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** When true, section starts expanded. */
  defaultOpen?: boolean;
};

/**
 * SectionShell with expand/collapse. Use for long or growing blocks.
 */
export function CollapsibleSection({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  defaultOpen = false,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className={cn("ui-section", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <button
          type="button"
          className="ui-section__header min-w-0 flex-1 rounded-[var(--radius-sm)] text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 -mx-1 px-1 py-0.5"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <div className="flex items-start gap-2">
            <ChevronDown
              className={cn(
                "mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-150",
                open ? "rotate-0" : "-rotate-90",
              )}
              strokeWidth={2}
              aria-hidden
            />
            <div className="min-w-0 space-y-1">
              <h2 className="ui-section__title">{title}</h2>
              {description ? (
                <div className="ui-section__description">{description}</div>
              ) : null}
            </div>
          </div>
        </button>
        {actions ? (
          <div
            className="flex shrink-0 flex-wrap items-center gap-2"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {actions}
          </div>
        ) : null}
      </div>
      {open ? (
        <div id={panelId} className={bodyClassName}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
