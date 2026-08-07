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
  resolveCompiladoSnapshotsForDashboard,
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

function mergeKeySetsByDeveloper(
  maps: Array<Map<string, Set<string>>>,
): Map<string, Set<string>> {
  const merged = new Map<string, Set<string>>();
  for (const map of maps) {
    for (const [developerId, keys] of map) {
      const set = merged.get(developerId) ?? new Set<string>();
      for (const key of keys) {
        set.add(key);
      }
      merged.set(developerId, set);
    }
  }
  return merged;
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
 *
 * Compilado batches are per team. When viewing all teams without an explicit
 * `importId`, resolves one winning snapshot per team and merges cards (a
 * single global winner would zero out people from other teams).
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

  const [developers, thresholds] = await Promise.all([
    listDevelopersAdmin(teamId ? { teamId } : undefined),
    getPerformanceThresholds(),
  ]);

  const resolved = await resolveCompiladoSnapshotsForDashboard({
    mode: dataSource,
    importId: input.importId,
    dateRange: input.dateRange,
    teamId,
    teamIds: developers.map((developer) => developer.team_id),
  });

  const {
    batches,
    selectedBatch,
    provenance,
    winningImportIds,
  } = resolved;

  const rangeCardLists =
    winningImportIds.length > 0
      ? await Promise.all(
          winningImportIds.map((importId) =>
            listJiraCardsByImportInRange({
              importId,
              rangeStart: input.dateRange.start,
              rangeEnd: input.dateRange.end,
            }),
          ),
        )
      : [];
  const rangeCards = rangeCardLists.flat();

  const cardsByDeveloper = groupCardsByDeveloper(rangeCards);
  const activeDevelopers = developers.filter((developer) => developer.is_active);

  const rankingSource = developers.filter(
    (developer) =>
      developer.is_active || cardsByDeveloper.has(developer.id),
  );

  const developerIds = rankingSource.map((developer) => developer.id);

  const [capacities, teamDefaultCapacity, teamLabels] = await Promise.all([
    resolveCapacitiesForDevelopers({
      developerIds,
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

  const justificationMaps =
    winningImportIds.length > 0
      ? await Promise.all(
          winningImportIds.map(async (importId) => {
            const [
              acceptedDelay,
              acceptedRework,
              pendingDelay,
              pendingRework,
            ] = await Promise.all([
              listAcceptedDelayKeysByDeveloper({
                importId,
                developerIds,
              }),
              listAcceptedReworkKeysByDeveloper({
                importId,
                developerIds,
              }),
              listPendingJustificationKeysByDeveloper({
                importId,
                developerIds,
                kind: "delay",
              }),
              listPendingJustificationKeysByDeveloper({
                importId,
                developerIds,
                kind: "rework",
              }),
            ]);
            return {
              acceptedDelay,
              acceptedRework,
              pendingDelay,
              pendingRework,
            };
          }),
        )
      : [];

  const acceptedByDeveloper = mergeKeySetsByDeveloper(
    justificationMaps.map((entry) => entry.acceptedDelay),
  );
  const acceptedReworkByDeveloper = mergeKeySetsByDeveloper(
    justificationMaps.map((entry) => entry.acceptedRework),
  );
  const pendingDelayKeysByDeveloper = mergeKeySetsByDeveloper(
    justificationMaps.map((entry) => entry.pendingDelay),
  );
  const pendingReworkKeysByDeveloper = mergeKeySetsByDeveloper(
    justificationMaps.map((entry) => entry.pendingRework),
  );

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
    winningImportIds.length > 0
      ? await listJiraCardsForMonthlyMatrix({
          importIds: winningImportIds,
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

  // Month picker options must cover the Compilado batch period(s), not the
  // active date filter — otherwise "Exibir todos" + month=2026-07 collapses
  // the dropdown to a single month.
  const periodBatches =
    winningImportIds.length > 0
      ? batches.filter((batch) => winningImportIds.includes(batch.id))
      : selectedBatch
        ? [selectedBatch]
        : [];
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  for (const batch of periodBatches) {
    if (
      batch.period_start &&
      (!periodStart || batch.period_start < periodStart)
    ) {
      periodStart = batch.period_start;
    }
    if (batch.period_end && (!periodEnd || batch.period_end > periodEnd)) {
      periodEnd = batch.period_end;
    }
  }

  const monthOptions =
    periodStart && periodEnd
      ? listYearMonthsBetween(periodStart, periodEnd)
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

