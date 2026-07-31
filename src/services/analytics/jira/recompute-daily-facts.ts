import "server-only";

import { createClient } from "@/lib/supabase/server";
import { rulesHash } from "@/services/analytics/jira/rules-hash";
import {
  createFlowRecomputeRun,
  finishFlowRecomputeRun,
  replaceDailyFactsInRange,
  type JiraFlowDailyFactWrite,
} from "@/services/analytics/jira/repository-daily-facts";
import {
  isOpenAtAsOf,
  statusGroupAt,
  type StatusAtEventInput,
} from "@/services/analytics/jira/status-at";
import {
  classifyStatusGroup,
  resolveStatusGroupMapping,
} from "@/services/analytics/jira/status-mapping";
import {
  addUtcDays,
  eachUtcDay,
  toUtcDayString,
  utcDayEndDate,
  utcDayEndMs,
  utcDayStartMs,
} from "@/services/analytics/jira/utc-day";
import { getJiraIntegration } from "@/services/integrations/jira";
import {
  JIRA_FLOW_COMPUTATION_VERSION,
  type JiraStatusGroup,
} from "@/types/jira-flow-analytics";

/** Default lookback when fromDay omitted. */
const DEFAULT_LOOKBACK_DAYS = 180;

export type RecomputeDailyFactsResult = {
  ok: boolean;
  runId: string | null;
  fromDay: string | null;
  toDay: string | null;
  rowsWritten: number;
  issuesScanned: number;
  daysProcessed: number;
  rulesHash: string | null;
  durationMs: number;
  error?: string;
};

type FactKey = string;

function factKey(day: string, group: JiraStatusGroup, issueType: string): FactKey {
  return `${day}\0${group}\0${issueType}`;
}

function normalizeIssueType(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function emptyCounters() {
  return {
    wip_count: 0,
    arrived_count: 0,
    departed_count: 0,
    resolved_count: 0,
  };
}

/**
 * Rebuild materialized daily flow facts for an integration.
 * Idempotent for a given range: delete + insert under natural key.
 * Does not call the Jira API.
 *
 * Incremental (dirty days only) is intentionally deferred to phase 2;
 * this API already accepts fromDay/toDay for future incremental callers.
 */
export async function recomputeJiraFlowDailyFacts(input: {
  integrationId: string;
  fromDay?: string;
  toDay?: string;
  triggerSource?: string;
  createdBy?: string | null;
}): Promise<RecomputeDailyFactsResult> {
  const startedAt = Date.now();
  const integration = await getJiraIntegration(input.integrationId);
  if (!integration) {
    return {
      ok: false,
      runId: null,
      fromDay: null,
      toDay: null,
      rowsWritten: 0,
      issuesScanned: 0,
      daysProcessed: 0,
      rulesHash: null,
      durationMs: Date.now() - startedAt,
      error: "Integração Jira não encontrada.",
    };
  }

  const mapping = resolveStatusGroupMapping(integration.settings);
  const hash = rulesHash(mapping);
  const computedAt = new Date().toISOString();
  const today = toUtcDayString(new Date());

  const toDay = input.toDay ?? today;
  const fromDay =
    input.fromDay ?? addUtcDays(toDay, -(DEFAULT_LOOKBACK_DAYS - 1));
  const mode = input.fromDay || input.toDay ? "range" : "full";

  let runId: string | null = null;

  try {
    runId = await createFlowRecomputeRun({
      integration_id: input.integrationId,
      kind: "daily_facts",
      mode,
      status: "running",
      trigger_source: input.triggerSource ?? "manual",
      from_day: fromDay,
      to_day: toDay,
      started_at: new Date(startedAt).toISOString(),
      rules_hash: hash,
      computation_version: JIRA_FLOW_COMPUTATION_VERSION,
      created_by: input.createdBy ?? null,
      metrics: {},
    });

    const supabase = await createClient();

    const { data: issues, error: issuesError } = await supabase
      .from("jira_issues")
      .select(
        "id, status, created_at_jira, resolved_at_jira, issue_type",
      )
      .eq("integration_id", input.integrationId);

    if (issuesError) {
      throw new Error(`Falha ao carregar issues: ${issuesError.message}`);
    }

    const issueRows = issues ?? [];
    const issueIds = issueRows.map((row) => String(row.id));

    const statusByIssue = new Map<string, StatusAtEventInput[]>();
    if (issueIds.length > 0) {
      // Chunk .in() to avoid oversized requests
      const chunkSize = 200;
      for (let i = 0; i < issueIds.length; i += chunkSize) {
        const chunk = issueIds.slice(i, i + chunkSize);
        const { data: statusEvents, error: statusError } = await supabase
          .from("jira_issue_status_events")
          .select("issue_id, from_status, to_status, changed_at")
          .eq("integration_id", input.integrationId)
          .in("issue_id", chunk)
          .order("changed_at", { ascending: true });

        if (statusError) {
          throw new Error(
            `Falha ao carregar status events: ${statusError.message}`,
          );
        }

        for (const event of statusEvents ?? []) {
          const issueId = String(event.issue_id);
          const list = statusByIssue.get(issueId) ?? [];
          list.push({
            from_status: (event.from_status as string | null) ?? null,
            to_status: (event.to_status as string | null) ?? null,
            changed_at: String(event.changed_at),
          });
          statusByIssue.set(issueId, list);
        }
      }
    }

    const days = eachUtcDay(fromDay, toDay);
    const counters = new Map<FactKey, ReturnType<typeof emptyCounters>>();

    const bump = (
      day: string,
      group: JiraStatusGroup,
      issueType: string,
      field: keyof ReturnType<typeof emptyCounters>,
      amount = 1,
    ) => {
      const key = factKey(day, group, issueType);
      const current = counters.get(key) ?? emptyCounters();
      current[field] += amount;
      counters.set(key, current);
    };

    for (const row of issueRows) {
      const issueId = String(row.id);
      const issueType = normalizeIssueType(row.issue_type as string | null);
      const issue = {
        status: (row.status as string | null) ?? null,
        created_at_jira: (row.created_at_jira as string | null) ?? null,
        resolved_at_jira: (row.resolved_at_jira as string | null) ?? null,
      };
      const events = statusByIssue.get(issueId) ?? [];

      for (const day of days) {
        const asOf = utcDayEndDate(day);
        if (isOpenAtAsOf(issue, events, asOf, mapping)) {
          const at = statusGroupAt(issue, events, asOf, mapping);
          bump(day, at.group, issueType, "wip_count");
        }

        if (issue.resolved_at_jira) {
          const resolvedDay = toUtcDayString(issue.resolved_at_jira);
          if (resolvedDay === day) {
            const atResolve = statusGroupAt(
              issue,
              events,
              new Date(Date.parse(issue.resolved_at_jira)),
              mapping,
            );
            bump(day, atResolve.group, issueType, "resolved_count");
          }
        }
      }

      // Arrivals / departures from status transitions within range
      const dayStart = utcDayStartMs(fromDay);
      const dayEnd = utcDayEndMs(toDay);
      for (const event of events) {
        const eventMs = Date.parse(event.changed_at);
        if (!Number.isFinite(eventMs) || eventMs < dayStart || eventMs > dayEnd) {
          continue;
        }
        const fromGroup = classifyStatusGroup(event.from_status, mapping.groups, {
          strict: mapping.strict,
        }) as JiraStatusGroup;
        const toGroup = classifyStatusGroup(event.to_status, mapping.groups, {
          strict: mapping.strict,
        }) as JiraStatusGroup;
        if (fromGroup === toGroup) {
          continue;
        }
        const eventDay = toUtcDayString(event.changed_at);
        bump(eventDay, fromGroup, issueType, "departed_count");
        bump(eventDay, toGroup, issueType, "arrived_count");
      }
    }

    const rows: JiraFlowDailyFactWrite[] = [];
    for (const [key, counts] of counters.entries()) {
      const [day, group, issueType] = key.split("\0") as [
        string,
        JiraStatusGroup,
        string,
      ];
      if (
        counts.wip_count === 0 &&
        counts.arrived_count === 0 &&
        counts.departed_count === 0 &&
        counts.resolved_count === 0
      ) {
        continue;
      }
      rows.push({
        integration_id: input.integrationId,
        day,
        status_group: group,
        issue_type: issueType,
        wip_count: counts.wip_count,
        arrived_count: counts.arrived_count,
        departed_count: counts.departed_count,
        resolved_count: counts.resolved_count,
        rules_hash: hash,
        computation_version: JIRA_FLOW_COMPUTATION_VERSION,
        computed_at: computedAt,
      });
    }

    // Ensure continuous WIP series: for every day in range, if any WIP existed
    // that day, zero-fill missing groups are handled in the read model.
    // Still write at least one row per active day via counters above.

    const rowsWritten = await replaceDailyFactsInRange({
      integrationId: input.integrationId,
      fromDay,
      toDay,
      rows,
    });

    const durationMs = Date.now() - startedAt;
    const metrics = {
      issues_scanned: issueRows.length,
      days_processed: days.length,
      rows_written: rowsWritten,
      events_loaded: [...statusByIssue.values()].reduce(
        (sum, list) => sum + list.length,
        0,
      ),
      duration_ms: durationMs,
      rules_hash: hash,
      from_day: fromDay,
      to_day: toDay,
    };

    await finishFlowRecomputeRun({
      runId,
      status: "success",
      metrics,
    });

    return {
      ok: true,
      runId,
      fromDay,
      toDay,
      rowsWritten,
      issuesScanned: issueRows.length,
      daysProcessed: days.length,
      rulesHash: hash,
      durationMs,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao recalcular daily facts.";
    if (runId) {
      try {
        await finishFlowRecomputeRun({
          runId,
          status: "error",
          errorMessage: message,
          metrics: { duration_ms: Date.now() - startedAt },
        });
      } catch {
        // swallow secondary failure
      }
    }
    return {
      ok: false,
      runId,
      fromDay,
      toDay,
      rowsWritten: 0,
      issuesScanned: 0,
      daysProcessed: 0,
      rulesHash: hash,
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }
}
