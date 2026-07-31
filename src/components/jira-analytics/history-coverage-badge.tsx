type HistoryCoverageBadgeProps = {
  confidence: "exact" | "approximate" | "none";
  source: "daily_facts" | "none";
  coverageFrom: string | null;
  coverageTo: string | null;
};

/**
 * Presentational coverage / confidence indicator for flow history.
 * Does not interpret mapping rules — only surfaces read-model flags.
 */
export function HistoryCoverageBadge({
  confidence,
  source,
  coverageFrom,
  coverageTo,
}: HistoryCoverageBadgeProps) {
  if (source === "none") {
    return null;
  }

  const coverageLabel =
    coverageFrom && coverageTo
      ? `${coverageFrom} → ${coverageTo} (UTC)`
      : "cobertura parcial";

  if (confidence === "approximate") {
    return (
      <div className="space-y-1">
        <span className="inline-flex items-center gap-1.5 rounded border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium tracking-wide text-amber-800 dark:text-amber-300">
          confidence: approximate
        </span>
        <p className="text-[11px] text-muted-foreground">
          `rules_hash` diverge do mapping atual — o histórico pode estar
          desatualizado. Recalcule os fatos diários em /app/jira. · {coverageLabel}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center rounded border border-border/70 bg-muted/50 px-2 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground">
        confidence: exact
      </span>
      <span className="text-[11px] text-muted-foreground">{coverageLabel}</span>
    </div>
  );
}
