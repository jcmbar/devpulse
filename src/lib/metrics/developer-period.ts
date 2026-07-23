import type { JiraCard } from "@/types/jira-card";
import type { DeveloperPeriodMetrics } from "@/types/developer-period-metrics";

export type { DeveloperPeriodMetrics };

function toNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function computeDeveloperPeriodMetrics(
  cards: JiraCard[],
): DeveloperPeriodMetrics {
  let totalEstimateHours = 0;
  let totalTimeSpentHours = 0;
  let onTimeCards = 0;
  let delayedCards = 0;
  let reworkCards = 0;
  let reworkWeightTotal = 0;
  let delaySum = 0;
  let delayCount = 0;
  let maxDelayDays: number | null = null;
  const statusCounts: Record<string, number> = {};

  for (const card of cards) {
    totalEstimateHours += toNumber(card.estimate_hours);
    totalTimeSpentHours += toNumber(card.time_spent_hours);

    if (card.is_rework) {
      reworkCards += 1;
      reworkWeightTotal += toNumber(card.rework_weight) || 1;
    }

    if (card.delay_days != null && Number.isFinite(card.delay_days)) {
      delaySum += card.delay_days;
      delayCount += 1;
      maxDelayDays =
        maxDelayDays == null
          ? card.delay_days
          : Math.max(maxDelayDays, card.delay_days);

      if (card.delay_days <= 0) {
        onTimeCards += 1;
      } else {
        delayedCards += 1;
      }
    }

    const status = card.status?.trim() || "Sem status";
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }

  const totalCards = cards.length;
  const utilizationRate =
    totalCards > 0 ? (onTimeCards - reworkCards) / totalCards : null;

  return {
    totalCards,
    onTimeCards,
    delayedCards,
    reworkCards,
    reworkWeightTotal,
    totalEstimateHours,
    totalTimeSpentHours,
    totalDifferenceHours: totalTimeSpentHours - totalEstimateHours,
    averageDelayDays: delayCount > 0 ? delaySum / delayCount : null,
    maxDelayDays,
    utilizationRate,
    statusCounts,
  };
}

/**
 * Totais do time com aproveitamento ponderado:
 * (Σ on_time − Σ rework) / Σ cards — nunca média aritmética das taxas.
 */
export function aggregateTeamPeriodMetrics(
  metricsList: DeveloperPeriodMetrics[],
): DeveloperPeriodMetrics {
  let totalCards = 0;
  let onTimeCards = 0;
  let delayedCards = 0;
  let reworkCards = 0;
  let reworkWeightTotal = 0;
  let totalEstimateHours = 0;
  let totalTimeSpentHours = 0;
  let delayWeightedSum = 0;
  let delayWeight = 0;
  let maxDelayDays: number | null = null;
  const statusCounts: Record<string, number> = {};

  for (const metrics of metricsList) {
    totalCards += metrics.totalCards;
    onTimeCards += metrics.onTimeCards;
    delayedCards += metrics.delayedCards;
    reworkCards += metrics.reworkCards;
    reworkWeightTotal += metrics.reworkWeightTotal;
    totalEstimateHours += metrics.totalEstimateHours;
    totalTimeSpentHours += metrics.totalTimeSpentHours;

    if (metrics.averageDelayDays != null) {
      const delayCards = metrics.onTimeCards + metrics.delayedCards;
      if (delayCards > 0) {
        delayWeightedSum += metrics.averageDelayDays * delayCards;
        delayWeight += delayCards;
      }
    }

    if (metrics.maxDelayDays != null) {
      maxDelayDays =
        maxDelayDays == null
          ? metrics.maxDelayDays
          : Math.max(maxDelayDays, metrics.maxDelayDays);
    }

    for (const [status, count] of Object.entries(metrics.statusCounts)) {
      statusCounts[status] = (statusCounts[status] ?? 0) + count;
    }
  }

  return {
    totalCards,
    onTimeCards,
    delayedCards,
    reworkCards,
    reworkWeightTotal,
    totalEstimateHours,
    totalTimeSpentHours,
    totalDifferenceHours: totalTimeSpentHours - totalEstimateHours,
    averageDelayDays: delayWeight > 0 ? delayWeightedSum / delayWeight : null,
    maxDelayDays,
    utilizationRate:
      totalCards > 0 ? (onTimeCards - reworkCards) / totalCards : null,
    statusCounts,
  };
}
