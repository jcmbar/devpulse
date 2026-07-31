import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { JiraStatusGroup } from "@/types/jira-flow-analytics";
import { JIRA_FLOW_COMPUTATION_VERSION } from "@/types/jira-flow-analytics";
import {
  getJiraIntegration,
  listJiraIntegrations,
} from "@/services/integrations/jira";
import {
  classifyStatusDetailed,
  resolveStatusGroupMapping,
} from "@/services/analytics/jira/status-mapping";
import { rulesHash } from "@/services/analytics/jira/rules-hash";
import {
  getDailyFactsCoverage,
  listDailyFacts,
} from "@/services/analytics/jira/repository-daily-facts";
import { toUtcDayString } from "@/services/analytics/jira/utc-day";

export type FlowReadScope = {
  /** Prefer explicit integration. */
  integrationId?: string;
  /** Resolve enabled integration(s) for team when integrationId omitted. */
  teamId?: string;
  fromIso?: string;
  toIso?: string;
  /** Filter by current_status_group on snapshots. */
  statusGroup?: JiraStatusGroup | "all";
  /** Filter by jira_issues.issue_type (exact). */
  issueType?: string;
};

export type ThroughputPoint = {
  periodStart: string;
  periodEnd: string;
  bucket: "day" | "week";
  resolvedCount: number;
};

export type AgingSummary = {
  openCount: number;
  avgAgingMs: number | null;
  p50AgingMs: number | null;
  p90AgingMs: number | null;
  maxAgingMs: number | null;
};

export type StatusGroupDistribution = {
  group: string;
  openCount: number;
  totalCount: number;
};

export type OldestOpenIssue = {
  issue_id: string;
  jira_key: string | null;
  current_status: string | null;
  current_status_group: string | null;
  aging_ms: number | null;
  created_at_jira: string | null;
  mapping_warning: "fuzzy" | "unmapped" | null;
};

export type FrictionIssue = {
  issue_id: string;
  jira_key: string | null;
  current_status: string | null;
  current_status_group: string | null;
  reopen_count: number;
  develop_reentry_count: number;
  assignee_change_count: number;
  resolved_at_jira: string | null;
  is_open: boolean;
};

export type PeriodStatSummary = {
  resolvedCount: number;
  avgLeadTimeMs: number | null;
  /** Alias of median — p50 lead time. */
  medianLeadTimeMs: number | null;
  p50LeadTimeMs: number | null;
  p90LeadTimeMs: number | null;
  reopenTotal: number;
  developReentryTotal: number;
  assigneeChangeTotal: number;
  issuesWithReopen: number;
  issuesWithDevelopReentry: number;
};

export type FlowHistoryWipDay = {
  day: string;
  byGroup: Record<string, number>;
  totalOpen: number;
};

export type FlowDashboardHistory = {
  wipByDay: FlowHistoryWipDay[];
  /** exact when daily_facts exist and rules_hash matches current mapping */
  confidence: "exact" | "approximate" | "none";
  source: "daily_facts" | "none";
  rulesHash: string | null;
  coverageFrom: string | null;
  coverageTo: string | null;
};

export type FlowDashboardMeta = {
  computationVersion: string;
  metricsConfidence: Record<
    string,
    "exact" | "proxy" | "snapshot" | "approximate" | "none"
  >;
};

export type FlowDashboardReadModel = {
  throughputDaily: ThroughputPoint[];
  throughputWeekly: ThroughputPoint[];
  aging: AgingSummary;
  statusGroups: StatusGroupDistribution[];
  oldestOpen: OldestOpenIssue[];
  topFriction: FrictionIssue[];
  periodStats: PeriodStatSummary;
  /** Phase 1 history — empty/safe when daily facts missing. */
  history: FlowDashboardHistory;
  meta: FlowDashboardMeta;
};

function isoWeekKey(isoDate: string): string {
  const date = new Date(isoDate);
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekBounds(weekKey: string): { start: string; end: string } {
  const [yearStr, weekStr] = weekKey.split("-W");
  const year = Number(yearStr);
  const week = Number(weekStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);
  return {
    start: monday.toISOString(),
    end: sunday.toISOString(),
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

async function resolveIntegrationIds(
  scope: FlowReadScope,
): Promise<string[]> {
  if (scope.integrationId) {
    return [scope.integrationId];
  }
  if (!scope.teamId) {
    throw new Error("Informe integrationId ou teamId para leitura agregada.");
  }
  const integrations = await listJiraIntegrations();
  return integrations
    .filter((row) => row.team_id === scope.teamId)
    .map((row) => row.id);
}

type IssueJoin = {
  jira_key?: string;
  issue_type?: string | null;
};

function extractIssueJoin(join: unknown): IssueJoin | null {
  const value = join as IssueJoin | IssueJoin[] | null;
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

function extractJiraKey(join: unknown): string | null {
  return extractIssueJoin(join)?.jira_key ?? null;
}

function mappingWarningForStatus(
  status: string | null,
  mapping: ReturnType<typeof resolveStatusGroupMapping>,
): "fuzzy" | "unmapped" | null {
  if (!status) {
    return null;
  }
  const detail = classifyStatusDetailed(status, mapping);
  if (detail.matchedBy === "fuzzy" || detail.matchedBy === "unmapped") {
    return detail.matchedBy;
  }
  return null;
}

/**
 * When issueType is set, resolve matching issue ids (metrics has no issue_type).
 */
async function resolveIssueIdsForTypeFilter(
  integrationIds: string[],
  issueType: string | undefined,
): Promise<string[] | null> {
  if (!issueType || issueType === "all") {
    return null;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jira_issues")
    .select("id")
    .in("integration_id", integrationIds)
    .eq("issue_type", issueType);
  if (error) {
    throw new Error(`Falha ao filtrar por tipo: ${error.message}`);
  }
  return (data ?? []).map((row) => String(row.id));
}

async function loadMappingForScope(scope: FlowReadScope) {
  if (scope.integrationId) {
    const integration = await getJiraIntegration(scope.integrationId);
    return resolveStatusGroupMapping(integration?.settings);
  }
  return resolveStatusGroupMapping(undefined);
}

/**
 * Dashboard-oriented read API over jira_issue_flow_metrics (no Jira API).
 */
export async function getThroughputSeries(
  scope: FlowReadScope & { bucket?: "day" | "week" },
): Promise<ThroughputPoint[]> {
  const integrationIds = await resolveIntegrationIds(scope);
  if (integrationIds.length === 0) {
    return [];
  }

  const issueIds = await resolveIssueIdsForTypeFilter(
    integrationIds,
    scope.issueType,
  );
  if (issueIds && issueIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  let query = supabase
    .from("jira_issue_flow_metrics")
    .select("resolved_at_jira")
    .in("integration_id", integrationIds)
    .not("resolved_at_jira", "is", null);

  if (issueIds) {
    query = query.in("issue_id", issueIds);
  }
  if (scope.statusGroup && scope.statusGroup !== "all") {
    query = query.eq("current_status_group", scope.statusGroup);
  }
  if (scope.fromIso) {
    query = query.gte("resolved_at_jira", scope.fromIso);
  }
  if (scope.toIso) {
    query = query.lte("resolved_at_jira", scope.toIso);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha no throughput: ${error.message}`);
  }

  const bucket = scope.bucket ?? "day";
  const counts = new Map<string, number>();

  for (const row of data ?? []) {
    const resolved = String(row.resolved_at_jira);
    const key =
      bucket === "day" ? resolved.slice(0, 10) : isoWeekKey(resolved);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, resolvedCount]) => {
      if (bucket === "day") {
        return {
          periodStart: `${key}T00:00:00.000Z`,
          periodEnd: `${key}T23:59:59.999Z`,
          bucket,
          resolvedCount,
        };
      }
      const bounds = weekBounds(key);
      return {
        periodStart: bounds.start,
        periodEnd: bounds.end,
        bucket,
        resolvedCount,
      };
    });
}

export async function getOpenAgingSummary(
  scope: FlowReadScope,
): Promise<AgingSummary> {
  const integrationIds = await resolveIntegrationIds(scope);
  if (integrationIds.length === 0) {
    return {
      openCount: 0,
      avgAgingMs: null,
      p50AgingMs: null,
      p90AgingMs: null,
      maxAgingMs: null,
    };
  }

  const issueIds = await resolveIssueIdsForTypeFilter(
    integrationIds,
    scope.issueType,
  );
  if (issueIds && issueIds.length === 0) {
    return {
      openCount: 0,
      avgAgingMs: null,
      p50AgingMs: null,
      p90AgingMs: null,
      maxAgingMs: null,
    };
  }

  const supabase = await createClient();
  let query = supabase
    .from("jira_issue_flow_metrics")
    .select("aging_ms")
    .in("integration_id", integrationIds)
    .eq("is_open", true);

  if (issueIds) {
    query = query.in("issue_id", issueIds);
  }
  if (scope.statusGroup && scope.statusGroup !== "all") {
    query = query.eq("current_status_group", scope.statusGroup);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Falha no aging: ${error.message}`);
  }

  const values = (data ?? [])
    .map((row) => Number(row.aging_ms))
    .filter((value) => Number.isFinite(value) && value >= 0);

  if (values.length === 0) {
    return {
      openCount: 0,
      avgAgingMs: null,
      p50AgingMs: null,
      p90AgingMs: null,
      maxAgingMs: null,
    };
  }

  const sum = values.reduce((acc, value) => acc + value, 0);
  return {
    openCount: values.length,
    avgAgingMs: Math.round(sum / values.length),
    p50AgingMs: median(values),
    p90AgingMs: percentile(values, 90),
    maxAgingMs: Math.max(...values),
  };
}

export async function getStatusGroupDistribution(
  scope: FlowReadScope,
): Promise<StatusGroupDistribution[]> {
  const integrationIds = await resolveIntegrationIds(scope);
  if (integrationIds.length === 0) {
    return [];
  }

  const issueIds = await resolveIssueIdsForTypeFilter(
    integrationIds,
    scope.issueType,
  );
  if (issueIds && issueIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  let query = supabase
    .from("jira_issue_flow_metrics")
    .select("current_status_group, is_open")
    .in("integration_id", integrationIds);

  if (issueIds) {
    query = query.in("issue_id", issueIds);
  }
  if (scope.statusGroup && scope.statusGroup !== "all") {
    query = query.eq("current_status_group", scope.statusGroup);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Falha na distribuição por grupo: ${error.message}`);
  }

  const map = new Map<string, { openCount: number; totalCount: number }>();
  for (const row of data ?? []) {
    const group = String(row.current_status_group ?? "other");
    const current = map.get(group) ?? { openCount: 0, totalCount: 0 };
    current.totalCount += 1;
    if (row.is_open) {
      current.openCount += 1;
    }
    map.set(group, current);
  }

  const order: JiraStatusGroup[] = [
    "analysis",
    "development",
    "validation",
    "done",
    "other",
  ];

  return order
    .filter((group) => map.has(group))
    .map((group) => ({
      group,
      openCount: map.get(group)!.openCount,
      totalCount: map.get(group)!.totalCount,
    }));
}

export async function getOldestOpenIssues(
  scope: FlowReadScope & { limit?: number },
): Promise<OldestOpenIssue[]> {
  const integrationIds = await resolveIntegrationIds(scope);
  if (integrationIds.length === 0) {
    return [];
  }

  const issueIds = await resolveIssueIdsForTypeFilter(
    integrationIds,
    scope.issueType,
  );
  if (issueIds && issueIds.length === 0) {
    return [];
  }

  const mapping = await loadMappingForScope(scope);
  const supabase = await createClient();
  let query = supabase
    .from("jira_issue_flow_metrics")
    .select(
      "issue_id, current_status, current_status_group, aging_ms, created_at_jira, jira_issues ( jira_key )",
    )
    .in("integration_id", integrationIds)
    .eq("is_open", true)
    .order("aging_ms", { ascending: false, nullsFirst: false })
    .limit(scope.limit ?? 20);

  if (issueIds) {
    query = query.in("issue_id", issueIds);
  }
  if (scope.statusGroup && scope.statusGroup !== "all") {
    query = query.eq("current_status_group", scope.statusGroup);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Falha ao listar aging aberto: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const status = (row.current_status as string | null) ?? null;
    return {
      issue_id: String(row.issue_id),
      jira_key: extractJiraKey(row.jira_issues),
      current_status: status,
      current_status_group:
        (row.current_status_group as string | null) ?? null,
      aging_ms: row.aging_ms == null ? null : Number(row.aging_ms),
      created_at_jira: (row.created_at_jira as string | null) ?? null,
      mapping_warning: mappingWarningForStatus(status, mapping),
    };
  });
}

/**
 * Issues with highest reopen + develop reentry in the period (resolved)
 * plus open issues that still carry friction counts.
 */
export async function getTopFrictionIssues(
  scope: FlowReadScope & { limit?: number },
): Promise<FrictionIssue[]> {
  const integrationIds = await resolveIntegrationIds(scope);
  if (integrationIds.length === 0) {
    return [];
  }

  const issueIds = await resolveIssueIdsForTypeFilter(
    integrationIds,
    scope.issueType,
  );
  if (issueIds && issueIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  let query = supabase
    .from("jira_issue_flow_metrics")
    .select(
      "issue_id, current_status, current_status_group, reopen_count, develop_reentry_count, assignee_change_count, resolved_at_jira, is_open, jira_issues ( jira_key )",
    )
    .in("integration_id", integrationIds)
    .or("reopen_count.gt.0,develop_reentry_count.gt.0");

  if (issueIds) {
    query = query.in("issue_id", issueIds);
  }
  if (scope.statusGroup && scope.statusGroup !== "all") {
    query = query.eq("current_status_group", scope.statusGroup);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao listar friction: ${error.message}`);
  }

  const fromMs = scope.fromIso ? Date.parse(scope.fromIso) : null;
  const toMs = scope.toIso ? Date.parse(scope.toIso) : null;

  const rows = (data ?? [])
    .filter((row) => {
      if (row.is_open) {
        return true;
      }
      if (!row.resolved_at_jira) {
        return false;
      }
      const resolvedMs = Date.parse(String(row.resolved_at_jira));
      if (!Number.isFinite(resolvedMs)) {
        return false;
      }
      if (fromMs != null && resolvedMs < fromMs) {
        return false;
      }
      if (toMs != null && resolvedMs > toMs) {
        return false;
      }
      return true;
    })
    .map((row) => ({
      issue_id: String(row.issue_id),
      jira_key: extractJiraKey(row.jira_issues),
      current_status: (row.current_status as string | null) ?? null,
      current_status_group:
        (row.current_status_group as string | null) ?? null,
      reopen_count: Number(row.reopen_count ?? 0),
      develop_reentry_count: Number(row.develop_reentry_count ?? 0),
      assignee_change_count: Number(row.assignee_change_count ?? 0),
      resolved_at_jira: (row.resolved_at_jira as string | null) ?? null,
      is_open: Boolean(row.is_open),
    }))
    .sort(
      (a, b) =>
        b.reopen_count +
        b.develop_reentry_count -
        (a.reopen_count + a.develop_reentry_count),
    )
    .slice(0, scope.limit ?? 15);

  return rows;
}

/**
 * Lead time / reopen / rework / assignee changes for issues resolved in period.
 */
export async function getPeriodFlowStats(
  scope: FlowReadScope,
): Promise<PeriodStatSummary> {
  const integrationIds = await resolveIntegrationIds(scope);
  if (integrationIds.length === 0) {
    return {
      resolvedCount: 0,
      avgLeadTimeMs: null,
      medianLeadTimeMs: null,
      p50LeadTimeMs: null,
      p90LeadTimeMs: null,
      reopenTotal: 0,
      developReentryTotal: 0,
      assigneeChangeTotal: 0,
      issuesWithReopen: 0,
      issuesWithDevelopReentry: 0,
    };
  }

  const issueIds = await resolveIssueIdsForTypeFilter(
    integrationIds,
    scope.issueType,
  );
  if (issueIds && issueIds.length === 0) {
    return {
      resolvedCount: 0,
      avgLeadTimeMs: null,
      medianLeadTimeMs: null,
      p50LeadTimeMs: null,
      p90LeadTimeMs: null,
      reopenTotal: 0,
      developReentryTotal: 0,
      assigneeChangeTotal: 0,
      issuesWithReopen: 0,
      issuesWithDevelopReentry: 0,
    };
  }

  const supabase = await createClient();
  let query = supabase
    .from("jira_issue_flow_metrics")
    .select(
      "lead_time_ms, reopen_count, develop_reentry_count, assignee_change_count, resolved_at_jira",
    )
    .in("integration_id", integrationIds)
    .not("resolved_at_jira", "is", null);

  if (issueIds) {
    query = query.in("issue_id", issueIds);
  }
  if (scope.statusGroup && scope.statusGroup !== "all") {
    query = query.eq("current_status_group", scope.statusGroup);
  }
  if (scope.fromIso) {
    query = query.gte("resolved_at_jira", scope.fromIso);
  }
  if (scope.toIso) {
    query = query.lte("resolved_at_jira", scope.toIso);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha nas estatísticas de período: ${error.message}`);
  }

  const rows = data ?? [];
  const leadTimes = rows
    .map((row) => Number(row.lead_time_ms))
    .filter((value) => Number.isFinite(value) && value >= 0);

  const reopenTotal = rows.reduce(
    (sum, row) => sum + Number(row.reopen_count ?? 0),
    0,
  );
  const developReentryTotal = rows.reduce(
    (sum, row) => sum + Number(row.develop_reentry_count ?? 0),
    0,
  );
  const assigneeChangeTotal = rows.reduce(
    (sum, row) => sum + Number(row.assignee_change_count ?? 0),
    0,
  );
  const p50 = median(leadTimes);

  return {
    resolvedCount: rows.length,
    avgLeadTimeMs:
      leadTimes.length > 0
        ? Math.round(
            leadTimes.reduce((sum, value) => sum + value, 0) / leadTimes.length,
          )
        : null,
    medianLeadTimeMs: p50,
    p50LeadTimeMs: p50,
    p90LeadTimeMs: percentile(leadTimes, 90),
    reopenTotal,
    developReentryTotal,
    assigneeChangeTotal,
    issuesWithReopen: rows.filter((row) => Number(row.reopen_count ?? 0) > 0)
      .length,
    issuesWithDevelopReentry: rows.filter(
      (row) => Number(row.develop_reentry_count ?? 0) > 0,
    ).length,
  };
}

/** Distinct issue types for filter dropdown (from synced issues). */
export async function listIssueTypesForScope(
  scope: Pick<FlowReadScope, "integrationId" | "teamId">,
): Promise<string[]> {
  const integrationIds = await resolveIntegrationIds(scope);
  if (integrationIds.length === 0) {
    return [];
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jira_issues")
    .select("issue_type")
    .in("integration_id", integrationIds)
    .not("issue_type", "is", null);
  if (error) {
    throw new Error(`Falha ao listar tipos: ${error.message}`);
  }
  return [
    ...new Set(
      (data ?? [])
        .map((row) => String(row.issue_type ?? "").trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function emptyHistory(): FlowDashboardHistory {
  return {
    wipByDay: [],
    confidence: "none",
    source: "none",
    rulesHash: null,
    coverageFrom: null,
    coverageTo: null,
  };
}

function defaultMeta(): FlowDashboardMeta {
  return {
    computationVersion: JIRA_FLOW_COMPUTATION_VERSION,
    metricsConfidence: {
      throughput: "exact",
      leadTime: "exact",
      aging: "snapshot",
      reopen: "exact",
      rework: "proxy",
      assigneeChanges: "exact",
      statusGroups: "snapshot",
      wipHistory: "none",
    },
  };
}

/**
 * WIP history from materialized daily facts.
 * Never invents CFD from the current snapshot — returns empty/safe when missing.
 */
export async function getWipHistorySeries(
  scope: FlowReadScope,
): Promise<FlowDashboardHistory> {
  const integrationIds = await resolveIntegrationIds(scope);
  if (integrationIds.length === 0) {
    return emptyHistory();
  }

  // Phase 1: history is scoped to a single integration when provided.
  const primaryId = scope.integrationId ?? integrationIds[0];
  if (!primaryId) {
    return emptyHistory();
  }

  const coverage = await getDailyFactsCoverage({ integrationId: primaryId });
  if (!coverage) {
    return emptyHistory();
  }

  const integration = await getJiraIntegration(primaryId);
  const mapping = resolveStatusGroupMapping(integration?.settings);
  const currentHash = rulesHash(mapping);
  const hashMatches = coverage.rulesHash === currentHash;

  const fromDay =
    scope.fromIso != null
      ? toUtcDayString(scope.fromIso)
      : coverage.coverageFrom;
  const toDay =
    scope.toIso != null ? toUtcDayString(scope.toIso) : coverage.coverageTo;

  const facts = await listDailyFacts({
    integrationIds: [primaryId],
    fromDay: fromDay ?? undefined,
    toDay: toDay ?? undefined,
    issueType: scope.issueType,
    statusGroup: scope.statusGroup,
  });

  if (facts.length === 0) {
    return {
      ...emptyHistory(),
      rulesHash: coverage.rulesHash,
      coverageFrom: coverage.coverageFrom,
      coverageTo: coverage.coverageTo,
      confidence: hashMatches ? "exact" : "approximate",
      source: "daily_facts",
    };
  }

  const byDay = new Map<string, Record<string, number>>();
  for (const row of facts) {
    // WIP history excludes done for operational open WIP series
    if (row.status_group === "done") {
      continue;
    }
    const current = byDay.get(row.day) ?? {};
    current[row.status_group] =
      (current[row.status_group] ?? 0) + row.wip_count;
    byDay.set(row.day, current);
  }

  const wipByDay: FlowHistoryWipDay[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, byGroup]) => ({
      day,
      byGroup,
      totalOpen: Object.values(byGroup).reduce((sum, n) => sum + n, 0),
    }));

  return {
    wipByDay,
    confidence: hashMatches ? "exact" : "approximate",
    source: "daily_facts",
    rulesHash: coverage.rulesHash,
    coverageFrom: coverage.coverageFrom,
    coverageTo: coverage.coverageTo,
  };
}

export async function getFlowDashboardReadModel(
  scope: FlowReadScope,
): Promise<FlowDashboardReadModel> {
  const [
    throughputDaily,
    throughputWeekly,
    aging,
    statusGroups,
    oldestOpen,
    topFriction,
    periodStats,
    history,
  ] = await Promise.all([
    getThroughputSeries({ ...scope, bucket: "day" }),
    getThroughputSeries({ ...scope, bucket: "week" }),
    getOpenAgingSummary(scope),
    getStatusGroupDistribution(scope),
    getOldestOpenIssues({ ...scope, limit: 15 }),
    getTopFrictionIssues({ ...scope, limit: 15 }),
    getPeriodFlowStats(scope),
    getWipHistorySeries(scope),
  ]);

  const meta = defaultMeta();
  meta.metricsConfidence.wipHistory =
    history.source === "none"
      ? "none"
      : history.confidence === "exact"
        ? "exact"
        : "approximate";

  return {
    throughputDaily,
    throughputWeekly,
    aging,
    statusGroups,
    oldestOpen,
    topFriction,
    periodStats,
    history,
    meta,
  };
}
