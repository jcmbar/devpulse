import { computeDeveloperPeriodMetrics } from "@/lib/metrics/developer-period";
import type { DeveloperPeriodMetrics } from "@/types/developer-period-metrics";
import type { JiraCard } from "@/types/jira-card";

export type MonthlyTrendPoint = {
  month: string;
  label: string;
  cards: number;
  onTime: number;
  delayedNet: number;
  reworkWeight: number;
  utilizationPct: number | null;
  deliveryIndex: number;
  estimateHours: number;
  spentHours: number;
};

function shortMonthLabel(yearMonth: string): string {
  const [year, monthPart] = yearMonth.split("-");
  const date = new Date(Number(year), Number(monthPart) - 1, 1);
  if (Number.isNaN(date.getTime())) {
    return yearMonth;
  }
  return new Intl.DateTimeFormat("pt-BR", { month: "short" })
    .format(date)
    .replace(".", "")
    .replace(/^\w/, (char) => char.toUpperCase());
}

/**
 * Groups existing cards by Entrega TU month and applies the same period metrics
 * helper already used on Home/Gestor — no new formulas.
 */
export function buildMonthlyTrendFromCards(
  cards: JiraCard[],
  options?: {
    acceptedDelayKeys?: string[];
    acceptedReworkKeys?: string[];
  },
): MonthlyTrendPoint[] {
  const byMonth = new Map<string, JiraCard[]>();
  for (const card of cards) {
    const delivery = card.unit_test_delivery_on;
    if (!delivery) {
      continue;
    }
    const month = delivery.slice(0, 7);
    const list = byMonth.get(month) ?? [];
    list.push(card);
    byMonth.set(month, list);
  }

  return [...byMonth.keys()]
    .sort()
    .map((month) => {
      const metrics = computeDeveloperPeriodMetrics(byMonth.get(month) ?? [], {
        acceptedDelayKeys: options?.acceptedDelayKeys,
        acceptedReworkKeys: options?.acceptedReworkKeys,
      });
      return metricsToTrendPoint(month, metrics);
    });
}

export function metricsToTrendPoint(
  month: string,
  metrics: DeveloperPeriodMetrics,
): MonthlyTrendPoint {
  return {
    month,
    label: shortMonthLabel(month),
    cards: metrics.totalCards,
    onTime: metrics.onTimeCards,
    delayedNet: metrics.delayedCardsNet,
    reworkWeight: metrics.reworkWeightTotal,
    utilizationPct:
      metrics.totalCards > 0
        ? Math.round(metrics.utilizationRate * 1000) / 10
        : null,
    deliveryIndex: Math.round(metrics.deliveryIndex * 100) / 100,
    estimateHours: metrics.totalEstimateHours,
    spentHours: metrics.totalTimeSpentHours,
  };
}

/**
 * Team monthly series from the existing gestor monthlyMatrix cells.
 * Cards / atraso / retrabalho are sums; aproveitamento and índice are averages
 * across developers with cards in that month (labeled as such in the UI).
 */
export function buildMonthlyTrendFromMatrix(input: {
  months: string[];
  rows: Array<{
    cells: Array<{
      month: string;
      cardsCount: number;
      utilizationRate: number | null;
      deliveryIndex: number;
      delayedCardsNet: number;
      reworkWeightTotal: number;
    }>;
  }>;
}): MonthlyTrendPoint[] {
  return input.months.map((month) => {
    let cards = 0;
    let delayedNet = 0;
    let reworkWeight = 0;
    let utilSum = 0;
    let utilCount = 0;
    let indexSum = 0;
    let indexCount = 0;

    for (const row of input.rows) {
      const cell = row.cells.find((item) => item.month === month);
      if (!cell || cell.cardsCount <= 0) {
        continue;
      }
      cards += cell.cardsCount;
      delayedNet += cell.delayedCardsNet;
      reworkWeight += cell.reworkWeightTotal;
      if (cell.utilizationRate != null) {
        utilSum += cell.utilizationRate;
        utilCount += 1;
      }
      indexSum += cell.deliveryIndex;
      indexCount += 1;
    }

    return {
      month,
      label: shortMonthLabel(month),
      cards,
      onTime: 0,
      delayedNet,
      reworkWeight,
      utilizationPct:
        utilCount > 0 ? Math.round((utilSum / utilCount) * 1000) / 10 : null,
      deliveryIndex:
        indexCount > 0 ? Math.round((indexSum / indexCount) * 100) / 100 : 0,
      estimateHours: 0,
      spentHours: 0,
    };
  });
}
