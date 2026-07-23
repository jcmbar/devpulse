/**
 * Shared aproveitamento band interpretation (Compilado faixas).
 * Defaults: <70%, 70–84%, 85–99%, ≥100%.
 */

export type PerformanceBandId =
  | "very_low"
  | "low"
  | "average"
  | "excellent"
  | "none";

export type PerformanceThresholds = {
  bandVeryLowMax: number;
  bandLowMax: number;
  bandAverageMax: number;
  labelVeryLow: string;
  labelLow: string;
  labelAverage: string;
  labelExcellent: string;
};

export const DEFAULT_PERFORMANCE_THRESHOLDS: PerformanceThresholds = {
  bandVeryLowMax: 0.7,
  bandLowMax: 0.85,
  bandAverageMax: 1,
  labelVeryLow: "Muito abaixo",
  labelLow: "Abaixo",
  labelAverage: "Na média",
  labelExcellent: "Excelente",
};

export function resolvePerformanceBand(
  rate: number | null,
  thresholds: PerformanceThresholds = DEFAULT_PERFORMANCE_THRESHOLDS,
): PerformanceBandId {
  if (rate == null) {
    return "none";
  }
  if (rate < thresholds.bandVeryLowMax) {
    return "very_low";
  }
  if (rate < thresholds.bandLowMax) {
    return "low";
  }
  if (rate < thresholds.bandAverageMax) {
    return "average";
  }
  return "excellent";
}

export function performanceBandLabel(
  band: PerformanceBandId,
  thresholds: PerformanceThresholds = DEFAULT_PERFORMANCE_THRESHOLDS,
): string {
  switch (band) {
    case "very_low":
      return thresholds.labelVeryLow;
    case "low":
      return thresholds.labelLow;
    case "average":
      return thresholds.labelAverage;
    case "excellent":
      return thresholds.labelExcellent;
    case "none":
      return "Sem dados";
  }
}

/** Text color for ranking / KPI values. */
export function performanceBandTextClass(band: PerformanceBandId): string {
  switch (band) {
    case "very_low":
      return "text-red-700 dark:text-red-300";
    case "low":
      return "text-amber-800 dark:text-amber-200";
    case "average":
      return "text-sky-800 dark:text-sky-200";
    case "excellent":
      return "text-emerald-800 dark:text-emerald-200";
    case "none":
      return "text-muted-foreground";
  }
}

/** Soft background for matrix cells / badges. */
export function performanceBandSurfaceClass(band: PerformanceBandId): string {
  switch (band) {
    case "very_low":
      return "bg-red-500/10";
    case "low":
      return "bg-amber-500/10";
    case "average":
      return "bg-sky-500/10";
    case "excellent":
      return "bg-emerald-500/10";
    case "none":
      return "";
  }
}

export function formatBandRangeLabel(
  band: Exclude<PerformanceBandId, "none">,
  thresholds: PerformanceThresholds = DEFAULT_PERFORMANCE_THRESHOLDS,
): string {
  const pct = (value: number) =>
    `${(value * 100).toLocaleString("pt-BR", {
      maximumFractionDigits: 0,
    })}%`;

  switch (band) {
    case "very_low":
      return `abaixo de ${pct(thresholds.bandVeryLowMax)}`;
    case "low":
      return `${pct(thresholds.bandVeryLowMax)} a ${pct(thresholds.bandLowMax - 0.01)}`;
    case "average":
      return `${pct(thresholds.bandLowMax)} a ${pct(thresholds.bandAverageMax - 0.01)}`;
    case "excellent":
      return `${pct(thresholds.bandAverageMax)} ou mais`;
  }
}

export function listPerformanceBandLegend(
  thresholds: PerformanceThresholds = DEFAULT_PERFORMANCE_THRESHOLDS,
): Array<{
  id: Exclude<PerformanceBandId, "none">;
  label: string;
  range: string;
  textClass: string;
}> {
  const ids = ["very_low", "low", "average", "excellent"] as const;
  return ids.map((id) => ({
    id,
    label: performanceBandLabel(id, thresholds),
    range: formatBandRangeLabel(id, thresholds),
    textClass: performanceBandTextClass(id),
  }));
}
