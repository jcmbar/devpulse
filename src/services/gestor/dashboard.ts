import "server-only";

import {
  formatYearMonthLabel,
  listYearMonthsBetween,
  type CompiladoDateRange,
} from "@/lib/metrics/date-range";
import {
  aggregateTeamPeriodMetrics,
  computeDeveloperPeriodMetrics,
  type DeveloperPeriodMetrics,
} from "@/lib/metrics/developer-period";
import type { PerformanceThresholds } from "@/lib/metrics/performance-bands";
import { resolveCapacitiesForDevelopers, resolveTeamDefaultCapacityForPeriod } from "@/services/capacity";
import { listDevelopersAdmin } from "@/services/developers/admin";
import { listImportBatches } from "@/services/imports";
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
};

export type GestorMonthlyCell = {
  month: string;
  cardsCount: number;
  utilizationRate: number | null;
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

function buildMonthlyMatrix(input: {
  developers: Awaited<ReturnType<typeof listDevelopersAdmin>>;
  cards: JiraCard[];
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
        const metrics = computeDeveloperPeriodMetrics(cards);
        return {
          month,
          cardsCount: metrics.totalCards,
          utilizationRate: metrics.utilizationRate,
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
}): Promise<GestorDashboard> {
  const [batches, developers, thresholds] = await Promise.all([
    listImportBatches(),
    listDevelopersAdmin(),
    getPerformanceThresholds(),
  ]);

  const selectedBatch =
    batches.find((batch) => batch.id === input.importId) ?? batches[0] ?? null;

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

  const ranking: GestorRankingRow[] = rankingSource
    .map((developer) => {
      const cards = cardsByDeveloper.get(developer.id) ?? [];
      const metrics = computeDeveloperPeriodMetrics(cards);
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
      };
    })
    .sort((a, b) => {
      const rateA = a.metrics.utilizationRate;
      const rateB = b.metrics.utilizationRate;
      if (rateA == null && rateB == null) {
        return a.fullName.localeCompare(b.fullName, "pt-BR");
      }
      if (rateA == null) {
        return 1;
      }
      if (rateB == null) {
        return -1;
      }
      if (rateB !== rateA) {
        return rateB - rateA;
      }
      return b.metrics.totalCards - a.metrics.totalCards;
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
