import { computeDeveloperPeriodMetrics } from "@/lib/metrics/developer-period";
import { resolveRequiredHoursForPeriod } from "@/services/capacity";
import { createClient } from "@/lib/supabase/server";
import type { JiraCard } from "@/types/jira-card";
import type { ProductivitySnapshot } from "@/types/productivity-snapshot";

export type UpsertSnapshotInput = {
  developerId: string;
  importId: string;
  periodStart: string;
  periodEnd: string;
  cards: JiraCard[];
};

export async function upsertProductivitySnapshot(
  input: UpsertSnapshotInput,
): Promise<ProductivitySnapshot> {
  const metrics = computeDeveloperPeriodMetrics(input.cards);
  const requiredHours = await resolveRequiredHoursForPeriod({
    developerId: input.developerId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });

  const supabase = await createClient();
  const payload = {
    developer_id: input.developerId,
    import_id: input.importId,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    cards_count: metrics.totalCards,
    completed_cards_count: metrics.onTimeCards,
    on_time_cards_count: metrics.onTimeCards,
    delayed_cards_count: metrics.delayedCards,
    rework_cards_count: metrics.reworkCards,
    rework_weight_total: metrics.reworkWeightTotal,
    total_estimate_hours: metrics.totalEstimateHours,
    total_time_spent_hours: metrics.totalTimeSpentHours,
    total_difference_hours: metrics.totalDifferenceHours,
    total_delay_days: metrics.averageDelayDays ?? 0,
    avg_delay_days: metrics.averageDelayDays,
    max_delay_days: metrics.maxDelayDays,
    utilization_rate: metrics.utilizationRate,
    required_hours: requiredHours,
    metrics: {
      statusCounts: metrics.statusCounts,
      source: "compilado-v1",
    },
  };

  const { data, error } = await supabase
    .from("productivity_snapshots")
    .upsert(payload, {
      onConflict: "developer_id,period_start,period_end",
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to upsert productivity snapshot: ${error.message}`);
  }

  return data;
}

export async function buildSnapshotsForImport(input: {
  importId: string;
  periodStart: string;
  periodEnd: string;
  cards: JiraCard[];
}): Promise<number> {
  const byDeveloper = new Map<string, JiraCard[]>();

  for (const card of input.cards) {
    if (!card.developer_id) {
      continue;
    }

    const delivery = card.unit_test_delivery_on ?? card.completed_on;
    if (!delivery) {
      continue;
    }
    if (delivery < input.periodStart || delivery > input.periodEnd) {
      continue;
    }

    const list = byDeveloper.get(card.developer_id) ?? [];
    list.push(card);
    byDeveloper.set(card.developer_id, list);
  }

  let count = 0;
  for (const [developerId, cards] of byDeveloper) {
    await upsertProductivitySnapshot({
      developerId,
      importId: input.importId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      cards,
    });
    count += 1;
  }

  return count;
}
