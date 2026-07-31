import { UTILIZATION_REWORK_WEIGHT } from "@/lib/metrics/developer-period";
import type { DeveloperPeriodMetrics } from "@/types/developer-period-metrics";

export type MetricCalcExplain = {
  title: string;
  facts: Array<{ label: string; value: string }>;
  rule: string;
  calculation: string;
  interpretation?: string;
};

function formatPct(rate: number): string {
  return `${(rate * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`;
}

function formatNum(value: number, digits = 2): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatIndex(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

type UtilizationInput = Pick<
  DeveloperPeriodMetrics,
  "totalCards" | "delayedCardsNet" | "reworkWeightTotal" | "utilizationRate"
>;

type DeliveryIndexInput = Pick<
  DeveloperPeriodMetrics,
  "totalCards" | "utilizationRate" | "deliveryIndex"
>;

/**
 * Memória de cálculo do Aproveitamento (qualidade), pt-BR.
 * P = 1·atrasos líquidos + 2·retrabalhos (peso).
 */
export function buildUtilizationCalcExplain(
  metrics: UtilizationInput,
): MetricCalcExplain {
  const cards = metrics.totalCards;
  const delays = metrics.delayedCardsNet;
  const reworks = metrics.reworkWeightTotal;
  const useful = cards - delays - UTILIZATION_REWORK_WEIGHT * reworks;
  const pct = formatPct(metrics.utilizationRate);

  if (cards <= 0) {
    return {
      title: `Aproveitamento: ${pct}`,
      facts: [
        { label: "Total de cards no período", value: "0" },
        { label: "Atrasos", value: String(delays) },
        { label: "Retrabalhos", value: String(reworks) },
      ],
      rule: "Cada atraso reduz 1 card útil e cada retrabalho reduz 2 cards úteis.",
      calculation: "Sem cards no período → Aproveitamento = 0%",
    };
  }

  const usefulLabel = formatNum(useful, 1);
  const clampedNote =
    useful < 0 ? ` → max(0, …) = ${pct}` : ` = ${pct}`;

  return {
    title: `Aproveitamento: ${pct}`,
    facts: [
      { label: "Total de cards no período", value: String(cards) },
      { label: "Atrasos", value: String(delays) },
      { label: "Retrabalhos", value: String(reworks) },
    ],
    rule: "Cada atraso reduz 1 card útil e cada retrabalho reduz 2 cards úteis.",
    calculation: `(${cards} - ${delays} - ${UTILIZATION_REWORK_WEIGHT}×${reworks}) / ${cards} = ${usefulLabel} / ${cards}${clampedNote}`,
  };
}

/**
 * Memória de cálculo do Índice de Entrega, pt-BR.
 * I = Q × √C
 */
export function buildDeliveryIndexCalcExplain(
  metrics: DeliveryIndexInput,
): MetricCalcExplain {
  const cards = metrics.totalCards;
  const q = metrics.utilizationRate;
  const pct = formatPct(q);
  const index = formatIndex(metrics.deliveryIndex);
  const sqrtC = Math.sqrt(Math.max(0, cards));
  const sqrtLabel = formatNum(sqrtC, 2);

  if (cards <= 0) {
    return {
      title: `Índice de Entrega: ${index}`,
      facts: [
        { label: "Aproveitamento", value: pct },
        { label: "Total de cards", value: "0" },
      ],
      rule: "Índice = Aproveitamento × raiz quadrada do total de cards.",
      calculation: "Sem cards no período → Índice = 0",
      interpretation:
        "Quanto maior o índice, melhor a posição no ranking, pois ele combina qualidade com volume de entrega.",
    };
  }

  return {
    title: `Índice de Entrega: ${index}`,
    facts: [
      { label: "Aproveitamento", value: pct },
      { label: "Total de cards", value: String(cards) },
    ],
    rule: "Índice = Aproveitamento × raiz quadrada do total de cards.",
    calculation: `${formatNum(q, 3)} × √${cards} ≈ ${formatNum(q, 3)} × ${sqrtLabel} = ${index}`,
    interpretation:
      "Quanto maior o índice, melhor a posição no ranking, pois ele combina qualidade com volume de entrega.",
  };
}

/** Plain-text fallback (native title / a11y). */
export function metricCalcExplainToPlainText(explain: MetricCalcExplain): string {
  const lines = [
    explain.title,
    ...explain.facts.map((fact) => `- ${fact.label}: ${fact.value}`),
    `- Regra aplicada: ${explain.rule}`,
    `- Cálculo: ${explain.calculation}`,
  ];
  if (explain.interpretation) {
    lines.push(`- Interpretação: ${explain.interpretation}`);
  }
  return lines.join("\n");
}

export function formatUtilizationBreakdownTooltip(
  metrics: UtilizationInput,
): string {
  return metricCalcExplainToPlainText(buildUtilizationCalcExplain(metrics));
}

export function formatDeliveryIndexTooltip(
  metrics: DeliveryIndexInput,
): string {
  return metricCalcExplainToPlainText(buildDeliveryIndexCalcExplain(metrics));
}
