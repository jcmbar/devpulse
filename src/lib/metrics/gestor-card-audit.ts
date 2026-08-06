import type { CompiladoDateRange } from "@/lib/metrics/date-range";
import {
  cardMatchesMetric,
  getCardDeliveryFlags,
  type GestorCardMetricKind,
} from "@/lib/metrics/developer-period";
import type { JiraCard } from "@/types/jira-card";

/**
 * Audit-only heuristics for investigating period membership.
 * Does not change dashboard inclusion rules.
 */
export type GestorCardAuditSuspicionKind =
  | "missing_unit_test_delivery"
  | "outside_period"
  | "missing_delay_days"
  | "metric_mismatch"
  | "import_mismatch";

export type GestorCardAuditSuspicion = {
  kind: GestorCardAuditSuspicionKind;
  label: string;
  severity: "warning" | "info";
};

export type GestorCardAuditAnnotations = {
  inclusionReason: string;
  inPeriodByUnitTestDelivery: boolean;
  suspicions: GestorCardAuditSuspicion[];
  isSuspicious: boolean;
  classificationLabels: string[];
};

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function classificationLabelsFromFlags(
  card: JiraCard,
  metric: GestorCardMetricKind,
): string[] {
  const flags = getCardDeliveryFlags(card);
  const labels: string[] = [];

  if (metric === "cards" || cardMatchesMetric(card, "cards")) {
    labels.push("Cards");
  }
  if (flags.isOnTime === true) {
    labels.push("No prazo");
  } else if (flags.isDelayed === true) {
    labels.push("Atraso");
  }
  if (flags.isRework) {
    labels.push("Retrabalho");
  }
  if (flags.isOnTime == null && flags.isDelayed == null) {
    labels.push("Atenção");
  }

  return labels;
}

/**
 * Annotate a card for audit UI. Uses the same period window as the dashboard
 * query (`unit_test_delivery_on` between start/end inclusive).
 */
export function annotateGestorCardForAudit(input: {
  card: JiraCard;
  dateRange: CompiladoDateRange;
  resolvedImportId: string | null;
  metric: GestorCardMetricKind;
}): GestorCardAuditAnnotations {
  const { card, dateRange, resolvedImportId, metric } = input;
  const delivery = card.unit_test_delivery_on?.trim() || null;
  const suspicions: GestorCardAuditSuspicion[] = [];

  let inPeriodByUnitTestDelivery = false;
  let inclusionReason: string;

  if (!delivery) {
    inclusionReason =
      "Não possui `unit_test_delivery_on`; por isso não deveria compor este recorte.";
    suspicions.push({
      kind: "missing_unit_test_delivery",
      label: "Entrega TU ausente",
      severity: "warning",
    });
  } else if (!isIsoDate(delivery)) {
    inclusionReason = `Valor inválido em \`unit_test_delivery_on\` (${delivery}).`;
    suspicions.push({
      kind: "outside_period",
      label: "Entrega TU inválida",
      severity: "warning",
    });
  } else if (delivery < dateRange.start || delivery > dateRange.end) {
    inclusionReason = `\`unit_test_delivery_on = ${delivery}\` está fora do período ${dateRange.start} → ${dateRange.end}; não deveria compor este recorte.`;
    suspicions.push({
      kind: "outside_period",
      label: "Entrega TU fora do período",
      severity: "warning",
    });
  } else {
    inPeriodByUnitTestDelivery = true;
    inclusionReason = `Entrou neste período por \`unit_test_delivery_on = ${delivery}\`.`;
  }

  if (card.delay_days == null || !Number.isFinite(card.delay_days)) {
    suspicions.push({
      kind: "missing_delay_days",
      label: "delay_days ausente",
      severity: "info",
    });
  }

  if (
    resolvedImportId != null &&
    card.import_id !== resolvedImportId
  ) {
    suspicions.push({
      kind: "import_mismatch",
      label: "Lote diferente do snapshot",
      severity: "warning",
    });
  }

  if (!cardMatchesMetric(card, metric)) {
    suspicions.push({
      kind: "metric_mismatch",
      label: `Não classifica em ${metric}`,
      severity: "warning",
    });
  }

  return {
    inclusionReason,
    inPeriodByUnitTestDelivery,
    suspicions,
    isSuspicious: suspicions.length > 0,
    classificationLabels: classificationLabelsFromFlags(card, metric),
  };
}

export function summarizeAuditSuspicions(
  items: Array<{ suspicions: GestorCardAuditSuspicion[] }>,
): {
  suspiciousCardCount: number;
  byKind: Partial<Record<GestorCardAuditSuspicionKind, number>>;
} {
  const byKind: Partial<Record<GestorCardAuditSuspicionKind, number>> = {};
  let suspiciousCardCount = 0;

  for (const item of items) {
    if (item.suspicions.length === 0) {
      continue;
    }
    suspiciousCardCount += 1;
    for (const suspicion of item.suspicions) {
      byKind[suspicion.kind] = (byKind[suspicion.kind] ?? 0) + 1;
    }
  }

  return { suspiciousCardCount, byKind };
}
