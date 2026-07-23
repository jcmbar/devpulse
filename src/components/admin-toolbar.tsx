import { cn } from "@/lib/utils";
import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

type AdminToolbarProps = {
  children: ReactNode;
  className?: string;
  title?: string;
};

/**
 * Filter/search toolbar with premium surface treatment.
 */
export function AdminToolbar({
  children,
  className,
  title = "Filtros",
}: AdminToolbarProps) {
  return (
    <div
      className={cn(
        "ui-card overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-3.5 py-2.5 sm:px-4">
        <SlidersHorizontal
          className="size-3.5 text-brand"
          strokeWidth={2}
        />
        <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {title}
        </p>
      </div>
      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4 sm:p-4">
        {children}
      </div>
    </div>
  );
}
