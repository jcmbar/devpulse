import {
  listPerformanceBandLegend,
  type PerformanceThresholds,
} from "@/lib/metrics/performance-bands";

export function PerformanceBandsLegend({
  thresholds,
}: {
  thresholds: PerformanceThresholds;
}) {
  const legend = listPerformanceBandLegend(thresholds);

  return (
    <div className="rounded-[var(--radius-sm)] border border-border/70 bg-muted/20 px-3 py-2.5 sm:px-4 sm:py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">Régua de aproveitamento</p>
          <p className="text-xs text-muted-foreground">
            Usada no ranking, nos totais e na matriz mensal.
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs sm:gap-x-4">
          {legend.map((item) => (
            <li key={item.id} className={item.textClass}>
              <span className="font-medium">{item.label}</span>
              <span className="text-muted-foreground"> · {item.range}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
