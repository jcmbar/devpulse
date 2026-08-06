import "server-only";

import type { CompiladoDateRange } from "@/lib/metrics/date-range";
import {
  computeDeveloperPeriodMetrics,
  filterCardsByMetric,
  getCardDeliveryFlags,
  metricCountFromPeriod,
  type GestorCardMetricKind,
} from "@/lib/metrics/developer-period";
import {
  annotateGestorCardForAudit,
  summarizeAuditSuspicions,
  type GestorCardAuditSuspicion,
  type GestorCardAuditSuspicionKind,
} from "@/lib/metrics/gestor-card-audit";
import type { CompiladoSourceMode } from "@/lib/metrics/gestor-data-source";
import { getDeveloperAdmin } from "@/services/developers/admin";
import { resolveCompiladoSnapshot } from "@/services/compilado/resolve-snapshot";
import { listDelayJustificationsForImportKeys } from "@/services/delay-justifications";
import { listJiraCardsByDeveloperAndImport } from "@/services/jira-cards";
import type {
  DelayJustificationKind,
  DelayJustificationStatus,
} from "@/types/delay-justification";
import type { DeveloperPeriodMetrics } from "@/types/developer-period-metrics";

export type GestorCardDelayJustification = {
  id: string;
  kind: DelayJustificationKind;
  status: DelayJustificationStatus;
  developerNote: string;
  requestedAt: string;
  reviewerNote: string | null;
  reviewedAt: string | null;
};

export type GestorCardAuditItem = {
  id: string;
  jiraKey: string;
  summary: string | null;
  status: string | null;
  unitTestDeliveryOn: string | null;
  /** Comparison-only dates — do not drive period membership. */
  startedOn: string | null;
  dueOn: string | null;
  completedOn: string | null;
  delayDays: number | null;
  /** Compilado time spent (same source as Gestor ranking hours). */
  timeSpentHours: number | null;
  estimateHours: number | null;
  isOnTime: boolean | null;
  isDelayed: boolean | null;
  isRework: boolean;
  reworkWeight: number;
  importId: string;
  parentKey: string | null;
  inclusionReason: string;
  inPeriodByUnitTestDelivery: boolean;
  classificationLabels: string[];
  suspicions: GestorCardAuditSuspicion[];
  isSuspicious: boolean;
  justification: GestorCardDelayJustification | null;
};

export type GestorDeveloperCardsAudit = {
  developerId: string;
  developerName: string;
  metric: GestorCardMetricKind;
  importId: string | null;
  batchLabel: string | null;
  batchPeriodStart: string | null;
  batchPeriodEnd: string | null;
  dateRange: CompiladoDateRange;
  dataSource: CompiladoSourceMode;
  /** Explicit temporal rule driving Gestor period membership. */
  inclusionRule: string;
  inclusionField: "unit_test_delivery_on";
  /** Metrics over the full period set (before metric filter). */
  periodMetrics: DeveloperPeriodMetrics;
  /** Count that the ranking column should show for this metric. */
  expectedCount: number;
  cards: GestorCardAuditItem[];
  suspicionSummary: {
    suspiciousCardCount: number;
    byKind: Partial<Record<GestorCardAuditSuspicionKind, number>>;
  };
};

/**
 * Card list for a Gestor ranking drill-down.
 * Uses the same snapshot + `unit_test_delivery_on` window as `getGestorDashboard`.
 */
export async function getGestorDeveloperCardsAudit(input: {
  developerId: string;
  importId?: string | null;
  dateRange: CompiladoDateRange;
  dataSource?: CompiladoSourceMode;
  metric?: GestorCardMetricKind;
}): Promise<GestorDeveloperCardsAudit> {
  const dataSource = input.dataSource ?? "auto";
  const metric = input.metric ?? "cards";

  const [resolved, developer] = await Promise.all([
    resolveCompiladoSnapshot({
      mode: dataSource,
      importId: input.importId,
      dateRange: input.dateRange,
    }),
    getDeveloperAdmin(input.developerId),
  ]);

  const selectedBatch = resolved.selectedBatch;
  const periodCards =
    selectedBatch != null
      ? await listJiraCardsByDeveloperAndImport({
          developerId: input.developerId,
          importId: selectedBatch.id,
          rangeStart: input.dateRange.start,
          rangeEnd: input.dateRange.end,
        })
      : [];

  const justificationKind: DelayJustificationKind | null =
    metric === "delayed" ? "delay" : metric === "rework" ? "rework" : null;

  const [delayJustificationByKey, reworkJustificationByKey] =
    selectedBatch != null
      ? await Promise.all([
          listDelayJustificationsForImportKeys({
            importId: selectedBatch.id,
            developerId: input.developerId,
            jiraKeys: periodCards.map((card) => card.jira_key),
            kind: "delay",
          }),
          listDelayJustificationsForImportKeys({
            importId: selectedBatch.id,
            developerId: input.developerId,
            jiraKeys: periodCards.map((card) => card.jira_key),
            kind: "rework",
          }),
        ])
      : [new Map(), new Map()];

  const acceptedDelayKeys = [...delayJustificationByKey.values()]
    .filter((row) => row.status === "accepted")
    .map((row) => row.jira_key);
  const acceptedReworkKeys = [...reworkJustificationByKey.values()]
    .filter((row) => row.status === "accepted")
    .map((row) => row.jira_key);

  const periodMetrics = computeDeveloperPeriodMetrics(periodCards, {
    acceptedDelayKeys,
    acceptedReworkKeys,
  });
  const filtered = filterCardsByMetric(periodCards, metric);

  const cards: GestorCardAuditItem[] = filtered.map((card) => {
    const flags = getCardDeliveryFlags(card);
    const annotations = annotateGestorCardForAudit({
      card,
      dateRange: input.dateRange,
      resolvedImportId: selectedBatch?.id ?? null,
      metric,
    });
    const key = card.jira_key.trim().toUpperCase();
    const justificationRow =
      justificationKind === "delay"
        ? (delayJustificationByKey.get(key) ?? null)
        : justificationKind === "rework"
          ? (reworkJustificationByKey.get(key) ?? null)
          : null;

    return {
      id: card.id,
      jiraKey: card.jira_key,
      summary: card.summary,
      status: card.status,
      unitTestDeliveryOn: card.unit_test_delivery_on,
      startedOn: card.started_on,
      dueOn: card.due_on,
      completedOn: card.completed_on,
      delayDays: card.delay_days,
      timeSpentHours:
        card.time_spent_hours == null
          ? null
          : Number(card.time_spent_hours),
      estimateHours:
        card.estimate_hours == null ? null : Number(card.estimate_hours),
      isOnTime: flags.isOnTime,
      isDelayed: flags.isDelayed,
      isRework: flags.isRework,
      reworkWeight: card.rework_weight,
      importId: card.import_id,
      parentKey: card.parent_key,
      inclusionReason: annotations.inclusionReason,
      inPeriodByUnitTestDelivery: annotations.inPeriodByUnitTestDelivery,
      classificationLabels: annotations.classificationLabels,
      suspicions: annotations.suspicions,
      isSuspicious: annotations.isSuspicious,
      justification: justificationRow
        ? {
            id: justificationRow.id,
            kind: justificationRow.kind,
            status: justificationRow.status,
            developerNote: justificationRow.developer_note,
            requestedAt: justificationRow.requested_at,
            reviewerNote: justificationRow.reviewer_note,
            reviewedAt: justificationRow.reviewed_at,
          }
        : null,
    };
  });

  const batchLabel =
    selectedBatch == null
      ? null
      : [
          selectedBatch.source_label ?? selectedBatch.source,
          selectedBatch.team_name,
          selectedBatch.completed_at
            ? `capturado ${selectedBatch.completed_at.slice(0, 10)}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return {
    developerId: input.developerId,
    developerName: developer?.full_name ?? "Developer",
    metric,
    importId: selectedBatch?.id ?? null,
    batchLabel,
    batchPeriodStart: selectedBatch?.period_start ?? null,
    batchPeriodEnd: selectedBatch?.period_end ?? null,
    dateRange: input.dateRange,
    dataSource,
    inclusionField: "unit_test_delivery_on",
    inclusionRule:
      "Cards incluídos pelo campo Entrega p/ Teste Unitário (`unit_test_delivery_on`).",
    periodMetrics,
    expectedCount: metricCountFromPeriod(periodMetrics, metric),
    cards,
    suspicionSummary: summarizeAuditSuspicions(cards),
  };
}
