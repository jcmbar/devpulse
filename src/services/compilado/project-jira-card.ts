/**
 * Pure projection: Jira Cloud issue (+ flow + worklogs) → Compilado card shape.
 *
 * Compilado / Gestor delivery axis requires the mapped Jira field
 * “Entrega p/ Teste Unitário”. Issues without it are not considered delivered
 * and are skipped at materialization (no staging/resolved fallback).
 */

import { computeDeliveryDelayDays } from "@/lib/metrics/business-days";
import { detectRework } from "@/lib/metrics/rework";
import type { JiraCardInsert } from "@/types/jira-card";

export type JiraBridgeIssueRow = {
  id: string;
  jira_key: string;
  summary: string | null;
  status: string | null;
  labels: string[];
  assignee_account_id: string | null;
  assignee_display_name: string | null;
  story_points: number | null;
  created_at_jira: string | null;
  resolved_at_jira: string | null;
  /** Mapped Jira field Entrega p/ Teste Unitário (date-only). */
  unit_test_delivery_on: string | null;
  due_on: string | null;
  estimate_hours: number | null;
  parent_key: string | null;
};

export type JiraBridgeFlowRow = {
  issue_id: string;
  first_develop_at: string | null;
  first_staging_at: string | null;
  resolved_at_jira: string | null;
  develop_reentry_count: number;
};

export type ProjectJiraBridgeCardInput = {
  importId: string;
  issue: JiraBridgeIssueRow;
  flow: JiraBridgeFlowRow | null;
  timeSpentHours: number | null;
  developerId: string | null;
  syncRunId: string | null;
  integrationId: string;
};

/** Only the mapped custom field qualifies a card for Compilado/Gestor. */
export type DeliveryProxyKind = "jira_custom_field";

/**
 * @deprecated Kept for impact/diagnostic scripts that compare pre-fix behavior.
 * Do not use for Compilado materialization.
 */
export type LegacyDeliveryProxyKind = "first_staging_at" | "resolved_at_jira";

export type ProjectJiraBridgeCardResult = {
  card: JiraCardInsert;
  deliveryProxy: DeliveryProxyKind;
} | null;

function toDateOnly(iso: string | null | undefined): string | null {
  if (!iso || iso.length < 10) {
    return null;
  }
  return iso.slice(0, 10);
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * @deprecated Pre custom-field Compilado axis (staging → resolved).
 * Retained only for validation scripts.
 */
export function resolveDeliveryProxyLegacy(input: {
  flow: JiraBridgeFlowRow | null;
  issue: Pick<JiraBridgeIssueRow, "resolved_at_jira">;
}): { date: string; proxy: LegacyDeliveryProxyKind } | null {
  const staging = toDateOnly(input.flow?.first_staging_at);
  if (staging) {
    return { date: staging, proxy: "first_staging_at" };
  }
  const resolved = toDateOnly(
    input.flow?.resolved_at_jira ?? input.issue.resolved_at_jira,
  );
  if (resolved) {
    return { date: resolved, proxy: "resolved_at_jira" };
  }
  return null;
}

/**
 * Compilado delivery axis: mapped Entrega p/ Teste Unitário only.
 * Missing custom-field date → skip (not delivered for Gestor productivity).
 */
export function resolveDeliveryProxy(input: {
  flow: JiraBridgeFlowRow | null;
  issue: JiraBridgeIssueRow;
}): { date: string; proxy: DeliveryProxyKind } | null {
  const fromCustomField = toDateOnly(input.issue.unit_test_delivery_on);
  if (fromCustomField) {
    return { date: fromCustomField, proxy: "jira_custom_field" };
  }
  return null;
}

export function projectJiraIssueToCompiladoCard(
  input: ProjectJiraBridgeCardInput,
): ProjectJiraBridgeCardResult {
  const delivery = resolveDeliveryProxy({
    flow: input.flow,
    issue: input.issue,
  });
  if (!delivery) {
    return null;
  }

  const categories = input.issue.labels ?? [];
  const rework = detectRework(categories);
  const isRework = rework.isRework;
  const reworkWeight = rework.reworkWeight;

  const startedOn = toDateOnly(input.flow?.first_develop_at);
  const completedOn = toDateOnly(
    input.flow?.resolved_at_jira ?? input.issue.resolved_at_jira,
  );
  const dueOn = toDateOnly(input.issue.due_on);
  const timeSpent =
    input.timeSpentHours != null && Number.isFinite(input.timeSpentHours)
      ? roundHours(input.timeSpentHours)
      : null;
  const estimateHours =
    input.issue.estimate_hours != null &&
    Number.isFinite(input.issue.estimate_hours)
      ? roundHours(input.issue.estimate_hours)
      : null;

  const computedDelay = computeDeliveryDelayDays({
    dueOn,
    deliveryOn: delivery.date,
  });
  // null when due_on missing → card does not enter No prazo / Atraso.
  const delayDays = computedDelay;
  const delayProxy =
    computedDelay == null
      ? "missing_due_on_excluded_from_delay"
      : "business_days_due_vs_unit_test_delivery";

  const differenceHours =
    estimateHours != null && timeSpent != null
      ? roundHours(timeSpent - estimateHours)
      : timeSpent;

  return {
    deliveryProxy: delivery.proxy,
    card: {
      import_id: input.importId,
      developer_id: input.developerId,
      jira_key: input.issue.jira_key,
      parent_key: input.issue.parent_key,
      summary: input.issue.summary,
      status: input.issue.status,
      categories,
      estimate_hours: estimateHours,
      time_spent_hours: timeSpent,
      difference_hours: differenceHours,
      delay_days: delayDays,
      started_on: startedOn,
      due_on: dueOn,
      completed_on: completedOn,
      unit_test_delivery_on: delivery.date,
      is_rework: isRework,
      rework_weight: reworkWeight,
      raw_payload: {
        bridge: "jira_cloud_v1",
        integration_id: input.integrationId,
        sync_run_id: input.syncRunId,
        issue_id: input.issue.id,
        assignee_account_id: input.issue.assignee_account_id,
        assignee_display_name: input.issue.assignee_display_name,
        story_points: input.issue.story_points,
        proxies: {
          unit_test_delivery_on: delivery.proxy,
          delay_days: delayProxy,
          is_rework: "category_labels_detect_rework",
          estimate_hours: estimateHours != null ? "mapped_field" : "not_mapped",
          time_spent_hours: "sum_worklogs_seconds",
        },
      },
    },
  };
}
