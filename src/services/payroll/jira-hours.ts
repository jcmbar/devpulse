import "server-only";

import {
  endOfMonth,
  startOfMonth,
  type CompiladoDateRange,
} from "@/lib/metrics/date-range";
import { resolveCompiladoSnapshot } from "@/services/compilado/resolve-snapshot";
import { listJiraCardsByImportInRange } from "@/services/jira-cards";

export { computeContractedHoursDelta } from "@/lib/metrics/payroll-calc";

function addHours(
  map: Map<string, number>,
  developerId: string,
  hours: number,
): void {
  if (!Number.isFinite(hours) || hours === 0) {
    return;
  }
  map.set(
    developerId,
    Math.round(((map.get(developerId) ?? 0) + hours) * 100) / 100,
  );
}

async function hoursFromTeamSnapshot(input: {
  dateRange: CompiladoDateRange;
  teamId: string | null;
  wantedDeveloperIds: Set<string>;
}): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const resolved = await resolveCompiladoSnapshot({
    mode: "auto",
    importId: null,
    dateRange: input.dateRange,
    teamId: input.teamId,
  });

  if (!resolved.selectedBatch) {
    return result;
  }

  const cards = await listJiraCardsByImportInRange({
    importId: resolved.selectedBatch.id,
    rangeStart: input.dateRange.start,
    rangeEnd: input.dateRange.end,
  });

  for (const card of cards) {
    if (!card.developer_id || !input.wantedDeveloperIds.has(card.developer_id)) {
      continue;
    }
    addHours(result, card.developer_id, Number(card.time_spent_hours ?? 0));
  }

  return result;
}

/**
 * Hours realized in the month — same source as Gestor ranking:
 * Σ time_spent_hours of Compilado cards with Entrega TU in the month.
 *
 * Compilado batches are per team. When viewing all teams, we resolve the
 * winning snapshot for each team and merge hours (a single global winner
 * would zero out people from other teams).
 */
export async function mapJiraDeliveryHoursByDeveloperForMonth(input: {
  yearMonth: string;
  developers: Array<{ id: string; teamId: string | null }>;
  /** When set, only resolve that team's Compilado batch. */
  teamId?: string | null;
}): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (input.developers.length === 0) {
    return result;
  }

  const dateRange: CompiladoDateRange = {
    mode: "month",
    month: input.yearMonth,
    start: startOfMonth(input.yearMonth),
    end: endOfMonth(input.yearMonth),
  };

  const scopedTeamId = input.teamId?.trim() || null;
  if (scopedTeamId) {
    return hoursFromTeamSnapshot({
      dateRange,
      teamId: scopedTeamId,
      wantedDeveloperIds: new Set(input.developers.map((dev) => dev.id)),
    });
  }

  const byTeam = new Map<string | null, Set<string>>();
  for (const developer of input.developers) {
    const key = developer.teamId;
    const set = byTeam.get(key) ?? new Set<string>();
    set.add(developer.id);
    byTeam.set(key, set);
  }

  const teamEntries = [...byTeam.entries()];
  const partials = await Promise.all(
    teamEntries.map(([teamId, wantedDeveloperIds]) =>
      hoursFromTeamSnapshot({
        dateRange,
        teamId,
        wantedDeveloperIds,
      }),
    ),
  );

  for (const partial of partials) {
    for (const [developerId, hours] of partial) {
      addHours(result, developerId, hours);
    }
  }

  return result;
}

/** @deprecated Prefer mapJiraDeliveryHoursByDeveloperForMonth */
export const mapJiraWorklogHoursByDeveloperForMonth =
  mapJiraDeliveryHoursByDeveloperForMonth;
