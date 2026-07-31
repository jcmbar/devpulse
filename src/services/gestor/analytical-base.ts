import "server-only";

import {
  listYearMonthsBetween,
  type CompiladoDateRange,
} from "@/lib/metrics/date-range";
import {
  getCardDeliveryFlags,
  type GestorCardMetricKind,
} from "@/lib/metrics/developer-period";
import { annotateGestorCardForAudit } from "@/lib/metrics/gestor-card-audit";
import type { CompiladoSourceMode } from "@/lib/metrics/gestor-data-source";
import { mapImportSourceToResolved } from "@/lib/metrics/gestor-data-source";
import {
  resolveCompiladoSnapshot,
  type CompiladoSnapshotProvenance,
} from "@/services/compilado/resolve-snapshot";
import { listAcceptedDelayKeysByDeveloper } from "@/services/delay-justifications";
import { listDevelopersAdmin } from "@/services/developers/admin";
import { listJiraCardsByImportInRange } from "@/services/jira-cards";
import type { ImportBatchOption } from "@/types/import-period";

export type GestorAnalyticalCardRow = {
  id: string;
  jiraKey: string;
  summary: string | null;
  developerId: string;
  developerName: string;
  status: string | null;
  unitTestDeliveryOn: string | null;
  startedOn: string | null;
  dueOn: string | null;
  completedOn: string | null;
  delayDays: number | null;
  isOnTime: boolean | null;
  isDelayed: boolean | null;
  /** Delayed card with accepted justification in this lote. */
  delayAccepted: boolean;
  isRework: boolean;
  reworkWeight: number;
  classificationLabels: string[];
  inclusionReason: string;
  importId: string;
  sourceLabel: string;
  batchLabel: string | null;
};

export type GestorAnalyticalBase = {
  rows: GestorAnalyticalCardRow[];
  batches: ImportBatchOption[];
  selectedBatch: ImportBatchOption | null;
  provenance: CompiladoSnapshotProvenance | null;
  dateRange: CompiladoDateRange;
  dataSource: CompiladoSourceMode;
  monthOptions: string[];
  developers: Array<{ id: string; fullName: string }>;
  statuses: string[];
};

/**
 * Flat card base for Gestor analytical view ("Base Jira").
 * Same snapshot + `unit_test_delivery_on` window as `getGestorDashboard`.
 */
export async function getGestorAnalyticalBase(input: {
  importId?: string | null;
  dateRange: CompiladoDateRange;
  dataSource?: CompiladoSourceMode;
}): Promise<GestorAnalyticalBase> {
  const dataSource = input.dataSource ?? "auto";

  const [resolved, developers] = await Promise.all([
    resolveCompiladoSnapshot({
      mode: dataSource,
      importId: input.importId,
      dateRange: input.dateRange,
    }),
    listDevelopersAdmin(),
  ]);

  const { batches, selectedBatch, provenance } = resolved;
  const developerNameById = new Map(
    developers.map((developer) => [developer.id, developer.full_name]),
  );

  const cards =
    selectedBatch != null
      ? await listJiraCardsByImportInRange({
          importId: selectedBatch.id,
          rangeStart: input.dateRange.start,
          rangeEnd: input.dateRange.end,
        })
      : [];

  const resolvedSource =
    selectedBatch != null
      ? mapImportSourceToResolved(selectedBatch.source)
      : null;
  const sourceLabel =
    resolvedSource === "manual"
      ? "Manual (planilha)"
      : resolvedSource === "jira"
        ? "Jira Compilado"
        : selectedBatch?.source_label ?? selectedBatch?.source ?? "—";

  const batchLabel =
    selectedBatch == null
      ? null
      : [
          selectedBatch.team_name,
          selectedBatch.completed_at
            ? `capturado ${selectedBatch.completed_at.slice(0, 10)}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || null;

  const metric: GestorCardMetricKind = "cards";
  const statusSet = new Set<string>();
  const developerIdsWithCards = new Set<string>();

  const acceptedByDeveloper =
    selectedBatch != null
      ? await listAcceptedDelayKeysByDeveloper({
          importId: selectedBatch.id,
        })
      : new Map<string, Set<string>>();

  const rows: GestorAnalyticalCardRow[] = cards
    .filter((card) => card.developer_id != null)
    .map((card) => {
      const developerId = card.developer_id as string;
      developerIdsWithCards.add(developerId);
      const flags = getCardDeliveryFlags(card);
      const annotations = annotateGestorCardForAudit({
        card,
        dateRange: input.dateRange,
        resolvedImportId: selectedBatch?.id ?? null,
        metric,
      });
      const status = card.status?.trim() || "Sem status";
      statusSet.add(status);
      const jiraKey = card.jira_key.trim().toUpperCase();
      const delayAccepted =
        flags.isDelayed === true &&
        (acceptedByDeveloper.get(developerId)?.has(jiraKey) ?? false);

      return {
        id: card.id,
        jiraKey: card.jira_key,
        summary: card.summary,
        developerId,
        developerName: developerNameById.get(developerId) ?? "Developer",
        status,
        unitTestDeliveryOn: card.unit_test_delivery_on,
        startedOn: card.started_on,
        dueOn: card.due_on,
        completedOn: card.completed_on,
        delayDays: card.delay_days,
        isOnTime: flags.isOnTime,
        isDelayed: flags.isDelayed,
        delayAccepted,
        isRework: flags.isRework,
        reworkWeight: flags.isRework
          ? Math.max(1, Number(card.rework_weight) || 1)
          : 0,
        classificationLabels: annotations.classificationLabels,
        inclusionReason: annotations.inclusionReason,
        importId: card.import_id,
        sourceLabel,
        batchLabel,
      };
    })
    .sort((a, b) => {
      const byDev = a.developerName.localeCompare(b.developerName, "pt-BR");
      if (byDev !== 0) {
        return byDev;
      }
      return a.jiraKey.localeCompare(b.jiraKey, "en");
    });

  const developersForFilter = developers
    .filter(
      (developer) =>
        developer.is_active || developerIdsWithCards.has(developer.id),
    )
    .map((developer) => ({
      id: developer.id,
      fullName: developer.full_name,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"));

  const monthOptions =
    selectedBatch?.period_start && selectedBatch.period_end
      ? listYearMonthsBetween(
          selectedBatch.period_start,
          selectedBatch.period_end,
        )
      : listYearMonthsBetween(input.dateRange.start, input.dateRange.end);

  return {
    rows,
    batches,
    selectedBatch,
    provenance,
    dateRange: input.dateRange,
    dataSource,
    monthOptions,
    developers: developersForFilter,
    statuses: Array.from(statusSet).sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    ),
  };
}
