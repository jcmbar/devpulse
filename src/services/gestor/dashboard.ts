import "server-only";

import {
  formatYearMonthLabel,
  listYearMonthsBetween,
  type CompiladoDateRange,
} from "@/lib/metrics/date-range";
import {
  aggregateTeamPeriodMetrics,
  computeDeveloperPeriodMetrics,
  getCardDeliveryFlags,
  type DeveloperPeriodMetrics,
} from "@/lib/metrics/developer-period";
import type { PerformanceThresholds } from "@/lib/metrics/performance-bands";
import { resolveCapacitiesForDevelopers, resolveTeamDefaultCapacityForPeriod } from "@/services/capacity";
import { listDevelopersAdmin } from "@/services/developers/admin";
import {
  listJiraCardsByImportInRange,
  listJiraCardsForMonthlyMatrix,
} from "@/services/jira-cards";
import { getPerformanceThresholds } from "@/services/performance-thresholds";
import { getTeamLabelMap } from "@/services/teams/labels";
import type {
  AppliedHolidaySummary,
  CapacityMonthContribution,
  CapacitySource,
} from "@/types/capacity";
import type { ImportBatchOption } from "@/types/import-period";
import type { JiraCard } from "@/types/jira-card";
import type { CompiladoSourceMode } from "@/lib/metrics/gestor-data-source";
import {
  resolveCompiladoSnapshot,
  type CompiladoSnapshotProvenance,
} from "@/services/compilado/resolve-snapshot";
import {
  listAcceptedDelayKeysByDeveloper,
  listAcceptedReworkKeysByDeveloper,
  listPendingJustificationKeysByDeveloper,
} from "@/services/delay-justifications";

export type CapacitySignal = "under" | "over" | "balanced" | "unknown";

export type GestorRankingRow = {
  developerId: string;
  fullName: string;
  email: string | null;
  isActive: boolean;
  metrics: DeveloperPeriodMetrics;
  requiredHours: number | null;
  capacitySource: CapacitySource;
  capacityDeltaHours: number | null;
  capacitySignal: CapacitySignal;
  capacitySegments: CapacityMonthContribution[];
  appliedHolidays: AppliedHolidaySummary[];
  holidayHoursExcluded: number;
  holidayContext: {
    stateCode: string;
    cityCode: string;
    teamId: string | null;
    teamCode: string;
    teamName: string | null;
  };
  /** Delay justifications with status=pending awaiting gestor decision. */
  pendingDelayJustifications: number;
  /** Rework justifications with status=pending awaiting gestor decision. */
  pendingReworkJustifications: number;
};

export type GestorMonthlyCell = {
  month: string;
  cardsCount: number;
  utilizationRate: number | null;
  deliveryIndex: number;
  delayedCardsNet: number;
  reworkWeightTotal: number;
};

export type GestorMonthlyRow = {
  developerId: string;
  fullName: string;
  isActive: boolean;
  cells: GestorMonthlyCell[];
};

export type GestorDashboard = {
  batches: ImportBatchOption[];
  selectedBatch: ImportBatchOption | null;
  dataSource: CompiladoSourceMode;
  provenance: CompiladoSnapshotProvenance | null;
  dateRange: CompiladoDateRange;
  monthOptions: string[];
  activeDevelopersCount: number;
  developersWithCardsCount: number;
  teamMetrics: DeveloperPeriodMetrics;
  ranking: GestorRankingRow[];
  monthlyMatrix: {
    months: string[];
    rows: GestorMonthlyRow[];
  };
  thresholds: PerformanceThresholds;
  capacityPeriod: {
    start: string;
    end: string;
    spansMultipleMonths: boolean;
    primaryYearMonth: string | null;
  };
  teamDefaultRequiredHours: number | null;
  holidayImpact: {
    affected: boolean;
    hoursExcluded: number;
    impactingHolidays: Array<{
      date: string;
      name: string;
      hoursExcluded: number;
    }>;
  };
  holidayScopeNote: string;
};

function monthKeyFromDate(value: string): string | null {
  if (value.length < 7) {
    return null;
  }
  return value.slice(0, 7);
}

export function formatGestorMonthLabel(month: string): string {
  return formatYearMonthLabel(month);
}

function capacitySignalFor(input: {
  spentHours: number;
  requiredHours: number | null;
}): CapacitySignal {
  if (input.requiredHours == null) {
    return "unknown";
  }
  const delta = Math.round((input.spentHours - input.requiredHours) * 100) / 100;
  if (delta < 0) {
    return "under";
  }
  if (delta > 0) {
    return "over";
  }
  return "balanced";
}

function groupCardsByDeveloper(cards: JiraCard[]): Map<string, JiraCard[]> {
  const map = new Map<string, JiraCard[]>();
  for (const card of cards) {
    if (!card.developer_id) {
      continue;
    }
    const list = map.get(card.developer_id) ?? [];
    list.push(card);
    map.set(card.developer_id, list);
  }
  return map;
}

/**
 * Pending requests only count while the card is still classified in the metric.
 * A reclassification can orphan a request, and the gestor has no way to decide
 * it from the audit drawer (which lists only cards inside the metric).
 */
function countPendingJustificationsInMetric(input: {
  cards: JiraCard[];
  pendingKeys: Set<string> | undefined;
  kind: "delay" | "rework";
}): number {
  if (!input.pendingKeys || input.pendingKeys.size === 0) {
    return 0;
  }
  let count = 0;
  for (const card of input.cards) {
    const flags = getCardDeliveryFlags(card);
    const inMetric = input.kind === "delay" ? flags.isDelayed : flags.isRework;
    if (inMetric && input.pendingKeys.has(card.jira_key.trim().toUpperCase())) {
      count += 1;
    }
  }
  return count;
}

function buildMonthlyMatrix(input: {
  developers: Awaited<ReturnType<typeof listDevelopersAdmin>>;
  cards: JiraCard[];
  acceptedByDeveloper: Map<string, Set<string>>;
  acceptedReworkByDeveloper: Map<string, Set<string>>;
}): GestorDashboard["monthlyMatrix"] {
  const byDeveloperMonth = new Map<string, Map<string, JiraCard[]>>();
  const monthSet = new Set<string>();

  for (const card of input.cards) {
    if (!card.developer_id || !card.unit_test_delivery_on) {
      continue;
    }
    const month = monthKeyFromDate(card.unit_test_delivery_on);
    if (!month) {
      continue;
    }
    monthSet.add(month);
    const byMonth = byDeveloperMonth.get(card.developer_id) ?? new Map();
    const list = byMonth.get(month) ?? [];
    list.push(card);
    byMonth.set(month, list);
    byDeveloperMonth.set(card.developer_id, byMonth);
  }

  const months = Array.from(monthSet).sort();
  const developerIdsWithData = new Set(byDeveloperMonth.keys());
  const developers = input.developers
    .filter(
      (developer) =>
        developer.is_active || developerIdsWithData.has(developer.id),
    )
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"));

  const rows: GestorMonthlyRow[] = developers.map((developer) => {
    const byMonth = byDeveloperMonth.get(developer.id) ?? new Map();
    return {
      developerId: developer.id,
      fullName: developer.full_name,
      isActive: developer.is_active,
      cells: months.map((month) => {
        const cards = byMonth.get(month) ?? [];
        const metrics = computeDeveloperPeriodMetrics(cards, {
          acceptedDelayKeys: input.acceptedByDeveloper.get(developer.id),
          acceptedReworkKeys: input.acceptedReworkByDeveloper.get(developer.id),
        });
        return {
          month,
          cardsCount: metrics.totalCards,
          utilizationRate: metrics.utilizationRate,
          deliveryIndex: metrics.deliveryIndex,
          delayedCardsNet: metrics.delayedCardsNet,
          reworkWeightTotal: metrics.reworkWeightTotal,
        };
      }),
    };
  });

  return { months, rows };
}

/**
 * Dashboard do gestor: ranking + totais do intervalo + matriz mensal.
 */
export async function getGestorDashboard(input: {
  importId?: string | null;
  dateRange: CompiladoDateRange;
  dataSource?: CompiladoSourceMode;
  /** When set, scopes developers (+ Compilado batches) to this team_id. */
  teamId?: string | null;
}): Promise<GestorDashboard> {
  const dataSource = input.dataSource ?? "auto";
  const teamId = input.teamId?.trim() || null;

  const [resolved, developers, thresholds] = await Promise.all([
    resolveCompiladoSnapshot({
      mode: dataSource,
      importId: input.importId,
      dateRange: input.dateRange,
      teamId,
    }),
    listDevelopersAdmin(teamId ? { teamId } : undefined),
    getPerformanceThresholds(),
  ]);

  const { batches, selectedBatch, provenance } = resolved;

  const rangeCards =
    selectedBatch != null
      ? await listJiraCardsByImportInRange({
          importId: selectedBatch.id,
          rangeStart: input.dateRange.start,
          rangeEnd: input.dateRange.end,
        })
      : [];

  const cardsByDeveloper = groupCardsByDeveloper(rangeCards);
  const activeDevelopers = developers.filter((developer) => developer.is_active);

  const rankingSource = developers.filter(
    (developer) =>
      developer.is_active || cardsByDeveloper.has(developer.id),
  );

  const [capacities, teamDefaultCapacity, teamLabels] = await Promise.all([
    resolveCapacitiesForDevelopers({
      developerIds: rankingSource.map((developer) => developer.id),
      periodStart: input.dateRange.start,
      periodEnd: input.dateRange.end,
    }),
    resolveTeamDefaultCapacityForPeriod({
      periodStart: input.dateRange.start,
      periodEnd: input.dateRange.end,
    }),
    getTeamLabelMap(
      rankingSource
        .map((developer) => developer.team_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]);

  const teamDefaultRequiredHours = teamDefaultCapacity.requiredHours;

  const acceptedByDeveloper =
    selectedBatch != null
      ? await listAcceptedDelayKeysByDeveloper({
          importId: selectedBatch.id,
          developerIds: rankingSource.map((developer) => developer.id),
        })
      : new Map<string, Set<string>>();

  const acceptedReworkByDeveloper =
    selectedBatch != null
      ? await listAcceptedReworkKeysByDeveloper({
          importId: selectedBatch.id,
          developerIds: rankingSource.map((developer) => developer.id),
        })
      : new Map<string, Set<string>>();

  const [pendingDelayKeysByDeveloper, pendingReworkKeysByDeveloper] =
    selectedBatch != null
      ? await Promise.all([
          listPendingJustificationKeysByDeveloper({
            importId: selectedBatch.id,
            developerIds: rankingSource.map((developer) => developer.id),
            kind: "delay",
          }),
          listPendingJustificationKeysByDeveloper({
            importId: selectedBatch.id,
            developerIds: rankingSource.map((developer) => developer.id),
            kind: "rework",
          }),
        ])
      : [new Map<string, Set<string>>(), new Map<string, Set<string>>()];

  const ranking: GestorRankingRow[] = rankingSource
    .map((developer) => {
      const cards = cardsByDeveloper.get(developer.id) ?? [];
      const metrics = computeDeveloperPeriodMetrics(cards, {
        acceptedDelayKeys: acceptedByDeveloper.get(developer.id),
        acceptedReworkKeys: acceptedReworkByDeveloper.get(developer.id),
      });
      const capacity = capacities.get(developer.id);
      const requiredHours = capacity?.requiredHours ?? null;
      const capacityDeltaHours =
        requiredHours == null
          ? null
          : Math.round(
              (metrics.totalTimeSpentHours - requiredHours) * 100,
            ) / 100;
      const teamLabel = developer.team_id
        ? teamLabels.get(developer.team_id)
        : undefined;

      return {
        developerId: developer.id,
        fullName: developer.full_name,
        email: developer.email,
        isActive: developer.is_active,
        metrics,
        requiredHours,
        capacitySource: capacity?.source ?? "missing",
        capacityDeltaHours,
        capacitySignal: capacitySignalFor({
          spentHours: metrics.totalTimeSpentHours,
          requiredHours,
        }),
        capacitySegments: capacity?.segments ?? [],
        appliedHolidays: capacity?.appliedHolidays ?? [],
        holidayHoursExcluded: capacity?.holidayHoursExcluded ?? 0,
        holidayContext: {
          stateCode: developer.state_code ?? "",
          cityCode: developer.city_code ?? "",
          teamId: developer.team_id ?? null,
          teamCode: teamLabel?.code ?? "",
          teamName: teamLabel?.name ?? null,
        },
        pendingDelayJustifications: countPendingJustificationsInMetric({
          cards,
          pendingKeys: pendingDelayKeysByDeveloper.get(developer.id),
          kind: "delay",
        }),
        pendingReworkJustifications: countPendingJustificationsInMetric({
          cards,
          pendingKeys: pendingReworkKeysByDeveloper.get(developer.id),
          kind: "rework",
        }),
      };
    })
    .sort((a, b) => {
      const indexA = a.metrics.deliveryIndex;
      const indexB = b.metrics.deliveryIndex;
      if (indexB !== indexA) {
        return indexB - indexA;
      }
      if (b.metrics.utilizationRate !== a.metrics.utilizationRate) {
        return b.metrics.utilizationRate - a.metrics.utilizationRate;
      }
      if (b.metrics.totalCards !== a.metrics.totalCards) {
        return b.metrics.totalCards - a.metrics.totalCards;
      }
      return a.fullName.localeCompare(b.fullName, "pt-BR");
    });

  const teamMetrics = aggregateTeamPeriodMetrics(
    ranking.map((row) => row.metrics),
  );

  const matrixCards =
    selectedBatch != null
      ? await listJiraCardsForMonthlyMatrix({
          importIds: [selectedBatch.id],
          rangeStart: input.dateRange.start,
          rangeEnd: input.dateRange.end,
        })
      : [];

  const monthlyMatrix = buildMonthlyMatrix({
    developers,
    cards: matrixCards,
    acceptedByDeveloper,
    acceptedReworkByDeveloper,
  });

  const monthOptions =
    selectedBatch?.period_start && selectedBatch.period_end
      ? listYearMonthsBetween(
          selectedBatch.period_start,
          selectedBatch.period_end,
        )
      : listYearMonthsBetween(input.dateRange.start, input.dateRange.end);

  return {
    batches,
    selectedBatch,
    dataSource,
    provenance,
    dateRange: input.dateRange,
    monthOptions,
    activeDevelopersCount: activeDevelopers.length,
    developersWithCardsCount: ranking.filter(
      (row) => row.metrics.totalCards > 0,
    ).length,
    teamMetrics,
    ranking,
    monthlyMatrix,
    thresholds,
    capacityPeriod: {
      start: input.dateRange.start,
      end: input.dateRange.end,
      spansMultipleMonths: teamDefaultCapacity.spansMultipleMonths,
      primaryYearMonth: teamDefaultCapacity.primaryYearMonth,
    },
    teamDefaultRequiredHours,
    holidayImpact: teamDefaultCapacity.holidayImpact,
    holidayScopeNote: teamDefaultCapacity.holidayScopeNote,
  };
}

