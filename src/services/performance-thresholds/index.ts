import "server-only";

import {
  DEFAULT_PERFORMANCE_THRESHOLDS,
  type PerformanceThresholds,
} from "@/lib/metrics/performance-bands";
import { createClient } from "@/lib/supabase/server";
import type { PerformanceThresholdsRow } from "@/types/performance-thresholds";

function mapRow(row: PerformanceThresholdsRow): PerformanceThresholds {
  return {
    bandVeryLowMax: Number(row.band_very_low_max),
    bandLowMax: Number(row.band_low_max),
    bandAverageMax: Number(row.band_average_max),
    labelVeryLow: row.label_very_low,
    labelLow: row.label_low,
    labelAverage: row.label_average,
    labelExcellent: row.label_excellent,
  };
}

/**
 * Loads team thresholds; falls back to Compilado defaults if table empty/missing.
 */
export async function getPerformanceThresholds(): Promise<PerformanceThresholds> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("performance_thresholds")
    .select(
      "id, band_very_low_max, band_low_max, band_average_max, label_very_low, label_low, label_average, label_excellent",
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    // Migration not applied yet — keep dashboard usable with defaults.
    console.warn("performance_thresholds unavailable:", error.message);
    return DEFAULT_PERFORMANCE_THRESHOLDS;
  }

  if (!data) {
    return DEFAULT_PERFORMANCE_THRESHOLDS;
  }

  return mapRow(data as PerformanceThresholdsRow);
}

export async function updatePerformanceThresholds(input: {
  bandVeryLowMax: number;
  bandLowMax: number;
  bandAverageMax: number;
  labelVeryLow: string;
  labelLow: string;
  labelAverage: string;
  labelExcellent: string;
}): Promise<PerformanceThresholds> {
  if (
    !(
      input.bandVeryLowMax > 0 &&
      input.bandLowMax > input.bandVeryLowMax &&
      input.bandAverageMax > input.bandLowMax
    )
  ) {
    throw new Error(
      "Faixas inválidas: use limites crescentes (ex.: 70% < 85% < 100%).",
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("performance_thresholds")
    .upsert(
      {
        id: 1,
        band_very_low_max: input.bandVeryLowMax,
        band_low_max: input.bandLowMax,
        band_average_max: input.bandAverageMax,
        label_very_low: input.labelVeryLow.trim() || "Muito abaixo",
        label_low: input.labelLow.trim() || "Abaixo",
        label_average: input.labelAverage.trim() || "Na média",
        label_excellent: input.labelExcellent.trim() || "Excelente",
      },
      { onConflict: "id" },
    )
    .select(
      "id, band_very_low_max, band_low_max, band_average_max, label_very_low, label_low, label_average, label_excellent",
    )
    .single();

  if (error) {
    throw new Error(`Failed to save performance thresholds: ${error.message}`);
  }

  return mapRow(data as PerformanceThresholdsRow);
}
