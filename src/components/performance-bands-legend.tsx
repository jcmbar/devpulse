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
    <div className="rounded-md border border-border px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">Régua de aproveitamento</p>
          <p className="text-xs text-muted-foreground">
            Usada no ranking, nos totais e na matriz mensal.
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
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
