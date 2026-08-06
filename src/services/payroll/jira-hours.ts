import "server-only";

import {
  endOfMonth,
  startOfMonth,
  type CompiladoDateRange,
} from "@/lib/metrics/date-range";
import { resolveCompiladoSnapshot } from "@/services/compilado/resolve-snapshot";
import { listJiraCardsByImportInRange } from "@/services/jira-cards";

export { computeContractedHoursDelta } from "@/lib/metrics/payroll-calc";

/**
 * Hours realized in the month — same source as Gestor ranking:
 * Σ time_spent_hours of Compilado cards with Entrega TU in the month.
 */
export async function mapJiraDeliveryHoursByDeveloperForMonth(input: {
  yearMonth: string;
  developerIds: string[];
  teamId?: string | null;
}): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (input.developerIds.length === 0) {
    return result;
  }

  const wanted = new Set(input.developerIds);
  const dateRange: CompiladoDateRange = {
    mode: "month",
    month: input.yearMonth,
    start: startOfMonth(input.yearMonth),
    end: endOfMonth(input.yearMonth),
  };

  const resolved = await resolveCompiladoSnapshot({
    mode: "auto",
    importId: null,
    dateRange,
    teamId: input.teamId ?? null,
  });

  if (!resolved.selectedBatch) {
    return result;
  }

  const cards = await listJiraCardsByImportInRange({
    importId: resolved.selectedBatch.id,
    rangeStart: dateRange.start,
    rangeEnd: dateRange.end,
  });

  for (const card of cards) {
    if (!card.developer_id || !wanted.has(card.developer_id)) {
      continue;
    }
    const hours = Number(card.time_spent_hours ?? 0);
    if (!Number.isFinite(hours) || hours === 0) {
      continue;
    }
    result.set(
      card.developer_id,
      Math.round(((result.get(card.developer_id) ?? 0) + hours) * 100) / 100,
    );
  }

  return result;
}

/** @deprecated Prefer mapJiraDeliveryHoursByDeveloperForMonth */
export const mapJiraWorklogHoursByDeveloperForMonth =
  mapJiraDeliveryHoursByDeveloperForMonth;
