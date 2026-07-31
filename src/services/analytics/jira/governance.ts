import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  classifyObservedStatuses,
  resolveStatusGroupMapping,
  type ObservedStatusStat,
  type ResolvedStatusMapping,
} from "@/services/analytics/jira/status-mapping";
import { getJiraIntegration } from "@/services/integrations/jira";

export type StatusGovernanceReport = {
  integrationId: string;
  teamId: string;
  strict: boolean;
  mapping: ResolvedStatusMapping;
  observed: ObservedStatusStat[];
  unmapped: ObservedStatusStat[];
  fuzzy: ObservedStatusStat[];
  mappedExact: ObservedStatusStat[];
  summary: {
    distinctStatuses: number;
    unmappedCount: number;
    fuzzyCount: number;
    exactCount: number;
    otherGroupIssueDwellMs: number;
  };
  recommendations: string[];
};

/**
 * Scan derived metrics for status labels and classify match quality.
 */
export async function getStatusGovernanceReport(
  integrationId: string,
): Promise<StatusGovernanceReport | null> {
  const integration = await getJiraIntegration(integrationId);
  if (!integration) {
    return null;
  }

  const mapping = resolveStatusGroupMapping(integration.settings);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jira_issue_flow_metrics")
    .select("status_dwell_ms, current_status, current_status_group")
    .eq("integration_id", integrationId);

  if (error) {
    throw new Error(`Falha ao carregar métricas para governança: ${error.message}`);
  }

  const observations: Array<{ status: string; issueCount: number; dwellMs: number }> =
    [];

  for (const row of data ?? []) {
    const dwell =
      row.status_dwell_ms && typeof row.status_dwell_ms === "object"
        ? (row.status_dwell_ms as Record<string, number>)
        : {};
    for (const [status, dwellMs] of Object.entries(dwell)) {
      observations.push({
        status,
        issueCount: 1,
        dwellMs: Number(dwellMs) || 0,
      });
    }
    if (row.current_status) {
      observations.push({
        status: String(row.current_status),
        issueCount: 1,
        dwellMs: 0,
      });
    }
  }

  const observed = classifyObservedStatuses(observations, mapping);
  const unmapped = observed.filter((row) => row.matchedBy === "unmapped");
  const fuzzy = observed.filter((row) => row.matchedBy === "fuzzy");
  const mappedExact = observed.filter((row) => row.matchedBy === "exact");

  const otherGroupIssueDwellMs = observed
    .filter((row) => row.group === "other")
    .reduce((sum, row) => sum + row.dwellMs, 0);

  const recommendations: string[] = [];
  if (unmapped.length > 0) {
    recommendations.push(
      `Adicione aliases explícitos em settings.status_groups para: ${unmapped
        .slice(0, 8)
        .map((row) => row.status)
        .join(", ")}${unmapped.length > 8 ? "…" : ""}.`,
    );
  }
  if (fuzzy.length > 0) {
    recommendations.push(
      `${fuzzy.length} status casaram por fuzzy — promova para aliases exatos ou ative strict: true.`,
    );
  }
  if (mapping.strict) {
    recommendations.push(
      "Modo strict ativo: apenas aliases exatos (e lista other) são considerados mapeados.",
    );
  }

  return {
    integrationId,
    teamId: integration.team_id,
    strict: mapping.strict,
    mapping,
    observed,
    unmapped,
    fuzzy,
    mappedExact,
    summary: {
      distinctStatuses: observed.length,
      unmappedCount: unmapped.length,
      fuzzyCount: fuzzy.length,
      exactCount: mappedExact.length,
      otherGroupIssueDwellMs,
    },
    recommendations,
  };
}
