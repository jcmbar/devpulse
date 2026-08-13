import { cn } from "@/lib/utils";
import {
  stgResultLabel,
  stgResultTone,
} from "@/lib/stg/ui";
import type { StgSessionResult } from "@/types/stg";
import type { ReactNode } from "react";

type StgResultBannerProps = {
  result: StgSessionResult;
  detail?: ReactNode;
  className?: string;
};

export function StgResultBanner({
  result,
  detail,
  className,
}: StgResultBannerProps) {
  const tone = stgResultTone(result);
  return (
    <div
      role="status"
      className={cn(
        "rounded-[var(--radius)] border px-4 py-3 sm:px-5 sm:py-4",
        tone === "success" && "border-success/50 bg-success/10 text-success",
        tone === "danger" && "border-danger/50 bg-danger/10 text-danger",
        tone === "warning" && "border-warning/50 bg-warning/10 text-warning",
        tone === "neutral" &&
          "border-border/70 bg-muted/40 text-foreground",
        className,
      )}
    >
      <p className="text-sm font-semibold tracking-tight sm:text-base">
        {stgResultLabel(result)}
      </p>
      {detail ? (
        <div className="mt-1 text-sm opacity-90">{detail}</div>
      ) : null}
    </div>
  );
}

export function StgSchemaMissingNotice() {
  return (
    <div
      className="rounded-[var(--radius)] border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
      role="status"
    >
      <p className="font-medium">Schema STG ainda não aplicado no banco</p>
      <p className="mt-1 opacity-90">
        Aplique a migration{" "}
        <code className="text-xs">20260811190000_stg_day_v1.sql</code> para
        liberar lista, wizard, hub e catálogo. A UI já está pronta para quando
        as tabelas existirem.
      </p>
    </div>
  );
}
