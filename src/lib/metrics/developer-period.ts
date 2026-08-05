import { computeDeliveryDelayDays } from "@/lib/metrics/business-days";
import type { JiraCard } from "@/types/jira-card";
import type { DeveloperPeriodMetrics } from "@/types/developer-period-metrics";

export type { DeveloperPeriodMetrics };

/** Metric columns on the Gestor ranking that can drill into card lists. */
export type GestorCardMetricKind =
  | "cards"
  | "onTime"
  | "delayed"
  | "rework";

export type CardDeliveryFlags = {
  /** null when dates missing (counts in Cards, not No prazo/Atraso). */
  isOnTime: boolean | null;
  isDelayed: boolean | null;
  isRework: boolean;
};

/** Weight of net delayed cards in utilization penalty. */
export const UTILIZATION_DELAY_WEIGHT = 1;
/** Weight of rework units (reworkWeightTotal) in utilization penalty. */
export const UTILIZATION_REWORK_WEIGHT = 2;

export type UtilizationBreakdown = {
  /** P = w_A·A_l + w_R·R */
  utilizationPenalty: number;
  /** C_aprov = C − P (may be negative). */
  utilizedCardEquivalents: number;
  /** max(0, C_aprov / C) when C > 0; else 0. Fraction 0–1 (qualidade). */
  utilizationRate: number;
  /** I = Q × √C when C > 0; else 0. */
  deliveryIndex: number;
};

function toNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeJiraKey(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Aproveitamento (qualidade) + Índice de Entrega (qualidade × volume):
 * P = 1·A_líquido + 2·R
 * Q = C > 0 ? max(0, (C − P) / C) : 0
 * I = Q × √C  (C = 0 → 0)
 */
export function computeUtilizationBreakdown(input: {
  totalCards: number;
  delayedCardsNet: number;
  reworkWeightTotal: number;
}): UtilizationBreakdown {
  const totalCards = Math.max(0, input.totalCards);
  const delayedNet = Math.max(0, input.delayedCardsNet);
  const reworkWeight = Math.max(0, input.reworkWeightTotal);
  const utilizationPenalty =
    UTILIZATION_DELAY_WEIGHT * delayedNet +
    UTILIZATION_REWORK_WEIGHT * reworkWeight;
  const utilizedCardEquivalents = totalCards - utilizationPenalty;
  const utilizationRate =
    totalCards > 0 ? Math.max(0, utilizedCardEquivalents / totalCards) : 0;
  const deliveryIndex =
    totalCards > 0 ? utilizationRate * Math.sqrt(totalCards) : 0;

  return {
    utilizationPenalty,
    utilizedCardEquivalents,
    utilizationRate,
    deliveryIndex,
  };
}

export function formatDeliveryIndex(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Same delay/rework rules as `computeDeveloperPeriodMetrics`.
 * Keep UI filters and aggregates on this helper — do not fork formulas.
 *
 * No prazo / Atraso follow the Compilado business-day rule, so the badge never
 * disagrees with the "Atraso (d)" column:
 * - delayed: delay_days > 0 (NETWORKDAYS.INTL between due_on and Entrega TU)
 * - on time: delay_days == 0, including deliveries on the weekend right after
 *   due_on, which add no business day
 * - neither: missing due_on or missing Entrega TU
 */
export function getCardDeliveryFlags(card: JiraCard): CardDeliveryFlags {
  const isRework = card.is_rework === true;
  const delivery = card.unit_test_delivery_on;
  const due = card.due_on;

  if (!delivery || !due) {
    return { isOnTime: null, isDelayed: null, isRework };
  }

  // Stored value first: it is what the UI shows in "Atraso (d)".
  const delayDays =
    typeof card.delay_days === "number" && Number.isFinite(card.delay_days)
      ? card.delay_days
      : computeDeliveryDelayDays({ dueOn: due, deliveryOn: delivery });

  if (delayDays != null && delayDays > 0) {
    return { isOnTime: false, isDelayed: true, isRework };
  }

  return { isOnTime: true, isDelayed: false, isRework };
}

export function cardMatchesMetric(
  card: JiraCard,
  metric: GestorCardMetricKind,
): boolean {
  if (metric === "cards") {
    return true;
  }
  const flags = getCardDeliveryFlags(card);
  switch (metric) {
    case "onTime":
      return flags.isOnTime === true;
    case "delayed":
      return flags.isDelayed === true;
    case "rework":
      return flags.isRework;
  }
}

export function filterCardsByMetric(
  cards: JiraCard[],
  metric: GestorCardMetricKind,
): JiraCard[] {
  if (metric === "cards") {
    return cards;
  }
  return cards.filter((card) => cardMatchesMetric(card, metric));
}

/**
 * Ranking column for delayed uses net; audit drawer expected size uses gross.
 */
export function metricCountFromPeriod(
  metrics: DeveloperPeriodMetrics,
  metric: GestorCardMetricKind,
): number {
  switch (metric) {
    case "cards":
      return metrics.totalCards;
    case "onTime":
      return metrics.onTimeCards;
    case "delayed":
      return metrics.delayedCardsGross;
    case "rework":
      return metrics.reworkCards;
  }
}

export function computeDeveloperPeriodMetrics(
  cards: JiraCard[],
  options?: {
    /** Accepted delay jira_keys (uppercase) for this developer/lote. */
    acceptedDelayKeys?: Iterable<string> | null;
    /** Accepted rework jira_keys (uppercase) — excluded from rework penalty. */
    acceptedReworkKeys?: Iterable<string> | null;
  },
): DeveloperPeriodMetrics {
  let totalEstimateHours = 0;
  let totalTimeSpentHours = 0;
  let onTimeCards = 0;
  let delayedCardsGross = 0;
  let delayedCardsAccepted = 0;
  let reworkCards = 0;
  let reworkCardsAccepted = 0;
  let reworkWeightTotal = 0;
  let totalDelayDays = 0;
  let delaySumForAverage = 0;
  let delayCount = 0;
  let maxDelayDays: number | null = null;
  const statusCounts: Record<string, number> = {};

  const acceptedDelays = new Set(
    [...(options?.acceptedDelayKeys ?? [])].map(normalizeJiraKey),
  );
  const acceptedReworks = new Set(
    [...(options?.acceptedReworkKeys ?? [])].map(normalizeJiraKey),
  );

  for (const card of cards) {
    totalEstimateHours += toNumber(card.estimate_hours);
    totalTimeSpentHours += toNumber(card.time_spent_hours);

    const flags = getCardDeliveryFlags(card);
    const key = normalizeJiraKey(card.jira_key);
    if (flags.isRework) {
      reworkCards += 1;
      const weight = toNumber(card.rework_weight) || 1;
      if (acceptedReworks.has(key)) {
        reworkCardsAccepted += 1;
      } else {
        reworkWeightTotal += weight;
      }
    }

    if (card.delay_days != null && Number.isFinite(card.delay_days)) {
      const delayDays = Math.max(0, card.delay_days);
      totalDelayDays += delayDays;
      delaySumForAverage += delayDays;
      delayCount += 1;
      maxDelayDays =
        maxDelayDays == null
          ? delayDays
          : Math.max(maxDelayDays, delayDays);
    }

    if (flags.isOnTime === true) {
      onTimeCards += 1;
    } else if (flags.isDelayed === true) {
      delayedCardsGross += 1;
      if (acceptedDelays.has(key)) {
        delayedCardsAccepted += 1;
      }
    }

    const status = card.status?.trim() || "Sem status";
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }

  const delayedCardsNet = Math.max(0, delayedCardsGross - delayedCardsAccepted);
  const totalCards = cards.length;
  const utilization = computeUtilizationBreakdown({
    totalCards,
    delayedCardsNet,
    reworkWeightTotal,
  });

  return {
    totalCards,
    onTimeCards,
    delayedCards: delayedCardsNet,
    delayedCardsGross,
    delayedCardsAccepted,
    delayedCardsNet,
    reworkCards,
    reworkCardsAccepted,
    reworkWeightTotal,
    totalEstimateHours,
    totalTimeSpentHours,
    totalDifferenceHours: totalTimeSpentHours - totalEstimateHours,
    totalDelayDays,
    averageDelayDays:
      delayCount > 0 ? delaySumForAverage / delayCount : null,
    maxDelayDays,
    utilizationPenalty: utilization.utilizationPenalty,
    utilizedCardEquivalents: utilization.utilizedCardEquivalents,
    utilizationRate: utilization.utilizationRate,
    deliveryIndex: utilization.deliveryIndex,
    statusCounts,
  };
}

/**
 * Totais do time com a mesma fórmula de aproveitamento sobre somas:
 * P = 1·ΣA_l + 2·ΣR; % = max(0, (ΣC − P) / ΣC) se ΣC > 0;
 * I = Q × √ΣC.
 */
export function aggregateTeamPeriodMetrics(
  metricsList: DeveloperPeriodMetrics[],
): DeveloperPeriodMetrics {
  let totalCards = 0;
  let onTimeCards = 0;
  let delayedCardsGross = 0;
  let delayedCardsAccepted = 0;
  let delayedCardsNet = 0;
  let reworkCards = 0;
  let reworkCardsAccepted = 0;
  let reworkWeightTotal = 0;
  let totalEstimateHours = 0;
  let totalTimeSpentHours = 0;
  let totalDelayDays = 0;
  let delayWeightedSum = 0;
  let delayWeight = 0;
  let maxDelayDays: number | null = null;
  const statusCounts: Record<string, number> = {};

  for (const metrics of metricsList) {
    totalCards += metrics.totalCards;
    onTimeCards += metrics.onTimeCards;
    delayedCardsGross += metrics.delayedCardsGross;
    delayedCardsAccepted += metrics.delayedCardsAccepted;
    delayedCardsNet += metrics.delayedCardsNet;
    reworkCards += metrics.reworkCards;
    reworkCardsAccepted += metrics.reworkCardsAccepted;
    reworkWeightTotal += metrics.reworkWeightTotal;
    totalEstimateHours += metrics.totalEstimateHours;
    totalTimeSpentHours += metrics.totalTimeSpentHours;
    totalDelayDays += metrics.totalDelayDays;

    if (metrics.averageDelayDays != null) {
      const delayCards = metrics.onTimeCards + metrics.delayedCardsGross;
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

  const utilization = computeUtilizationBreakdown({
    totalCards,
    delayedCardsNet,
    reworkWeightTotal,
  });

  return {
    totalCards,
    onTimeCards,
    delayedCards: delayedCardsNet,
    delayedCardsGross,
    delayedCardsAccepted,
    delayedCardsNet,
    reworkCards,
    reworkCardsAccepted,
    reworkWeightTotal,
    totalEstimateHours,
    totalTimeSpentHours,
    totalDifferenceHours: totalTimeSpentHours - totalEstimateHours,
    totalDelayDays,
    averageDelayDays: delayWeight > 0 ? delayWeightedSum / delayWeight : null,
    maxDelayDays,
    utilizationPenalty: utilization.utilizationPenalty,
    utilizedCardEquivalents: utilization.utilizedCardEquivalents,
    utilizationRate: utilization.utilizationRate,
    deliveryIndex: utilization.deliveryIndex,
    statusCounts,
  };
}
