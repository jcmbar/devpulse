import {
  classifyStatusGroup,
  matchesAlias,
  resolveStatusGroupMapping,
} from "@/services/analytics/jira/status-mapping";
import {
  JIRA_FLOW_COMPUTATION_VERSION,
  type JiraFlowRulesSnapshot,
  type JiraIssueFlowMetricsWrite,
  type JiraStatusGroup,
} from "@/types/jira-flow-analytics";

export type FlowIssueInput = {
  id: string;
  integration_id: string;
  status: string | null;
  status_category: string | null;
  created_at_jira: string | null;
  updated_at_jira: string | null;
  resolved_at_jira: string | null;
  assignee_account_id: string | null;
};

export type FlowStatusEventInput = {
  from_status: string | null;
  to_status: string | null;
  changed_at: string;
};

export type FlowAssigneeEventInput = {
  from_account_id: string | null;
  to_account_id: string | null;
  changed_at: string;
};

function toMs(iso: string | null | undefined): number | null {
  if (!iso) {
    return null;
  }
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function addDwell(
  map: Record<string, number>,
  key: string | null | undefined,
  durationMs: number,
) {
  if (!key || durationMs <= 0) {
    return;
  }
  map[key] = (map[key] ?? 0) + durationMs;
}

/**
 * Pure computation of flow metrics for one issue.
 *
 * Lead time = resolved - created (null if open).
 * Status dwell reconstructed from ordered changelog transitions.
 * Reopen = done-group → non-done.
 * Develop re-entry = enter develop after having previously left develop.
 */
export function computeIssueFlowMetrics(input: {
  issue: FlowIssueInput;
  statusEvents: FlowStatusEventInput[];
  assigneeEvents: FlowAssigneeEventInput[];
  settings?: Record<string, unknown> | null;
  asOf?: Date;
}): JiraIssueFlowMetricsWrite {
  const asOf = input.asOf ?? new Date();
  const asOfMs = asOf.getTime();
  const mapping = resolveStatusGroupMapping(input.settings);
  const { groups, developAliases, stagingAliases, strict } = mapping;

  const rulesSnapshot: JiraFlowRulesSnapshot = {
    computation_version: JIRA_FLOW_COMPUTATION_VERSION,
    status_groups: groups,
    as_of: asOf.toISOString(),
  };

  const createdMs = toMs(input.issue.created_at_jira);
  const resolvedMs = toMs(input.issue.resolved_at_jira);
  const statusCategoryDone =
    (input.issue.status_category ?? "").toLowerCase() === "done";
  const currentGroup = classifyStatusGroup(input.issue.status, groups, {
    strict,
  });
  const isOpen = !(resolvedMs != null || statusCategoryDone || currentGroup === "done");

  const leadTimeMs =
    createdMs != null && resolvedMs != null && resolvedMs >= createdMs
      ? resolvedMs - createdMs
      : null;

  const agingMs =
    isOpen && createdMs != null && asOfMs >= createdMs
      ? asOfMs - createdMs
      : null;

  const statusEvents = [...input.statusEvents].sort((a, b) =>
    a.changed_at.localeCompare(b.changed_at),
  );
  const assigneeEvents = [...input.assigneeEvents].sort((a, b) =>
    a.changed_at.localeCompare(b.changed_at),
  );

  const statusDwellMs: Record<string, number> = {};
  const statusGroupDwellMs: Record<string, number> = {};

  let firstDevelopAt: string | null = null;
  let firstStagingAt: string | null = null;
  let reopenCount = 0;
  let developReentryCount = 0;
  let leftDevelopOnce = false;

  // Seed timeline: before first event, assume created_at in from_status of first
  // event (or current status if no events).
  let cursorMs = createdMs;
  let currentStatus =
    statusEvents[0]?.from_status ?? input.issue.status ?? "unknown";

  for (const event of statusEvents) {
    const eventMs = toMs(event.changed_at);
    if (eventMs == null) {
      continue;
    }

    if (cursorMs != null && eventMs >= cursorMs) {
      const duration = eventMs - cursorMs;
      addDwell(statusDwellMs, currentStatus, duration);
      addDwell(
        statusGroupDwellMs,
        classifyStatusGroup(currentStatus, groups, { strict }),
        duration,
      );
    }

    const fromGroup = classifyStatusGroup(event.from_status, groups, {
      strict,
    });
    const toGroup = classifyStatusGroup(event.to_status, groups, { strict });

    if (fromGroup === "done" && toGroup !== "done") {
      reopenCount += 1;
    }

    if (matchesAlias(event.from_status, developAliases)) {
      leftDevelopOnce = true;
    }

    if (matchesAlias(event.to_status, developAliases)) {
      if (!firstDevelopAt) {
        firstDevelopAt = event.changed_at;
      } else if (leftDevelopOnce) {
        developReentryCount += 1;
        leftDevelopOnce = false;
      }
    }

    if (matchesAlias(event.to_status, stagingAliases) && !firstStagingAt) {
      firstStagingAt = event.changed_at;
    }

    currentStatus = event.to_status ?? currentStatus;
    cursorMs = eventMs;
  }

  // Tail: from last transition (or created) until resolved or asOf.
  const endMs = !isOpen
    ? (resolvedMs ?? cursorMs ?? asOfMs)
    : asOfMs;
  if (cursorMs != null && endMs >= cursorMs) {
    const duration = endMs - cursorMs;
    addDwell(statusDwellMs, currentStatus, duration);
    addDwell(
      statusGroupDwellMs,
      classifyStatusGroup(currentStatus, groups, { strict }),
      duration,
    );
  }

  // Issues created already in Develop/Staging with no matching transition.
  if (!firstDevelopAt && matchesAlias(input.issue.status, developAliases)) {
    firstDevelopAt = input.issue.created_at_jira;
  }
  if (!firstStagingAt && matchesAlias(input.issue.status, stagingAliases)) {
    firstStagingAt = input.issue.created_at_jira;
  }

  const firstDevelopMs = toMs(firstDevelopAt);
  const firstStagingMs = toMs(firstStagingAt);
  const timeToFirstDevelopMs =
    createdMs != null && firstDevelopMs != null && firstDevelopMs >= createdMs
      ? firstDevelopMs - createdMs
      : null;
  const timeToFirstStagingMs =
    createdMs != null && firstStagingMs != null && firstStagingMs >= createdMs
      ? firstStagingMs - createdMs
      : null;

  let assigneeChangeCount = 0;
  let firstAssignmentAt: string | null = null;
  for (const event of assigneeEvents) {
    if (event.to_account_id === event.from_account_id) {
      continue;
    }
    assigneeChangeCount += 1;
    if (event.to_account_id && !firstAssignmentAt) {
      firstAssignmentAt = event.changed_at;
    }
  }

  let timeToFirstAssignmentMs: number | null = null;
  if (createdMs != null) {
    if (firstAssignmentAt) {
      const assignedMs = toMs(firstAssignmentAt);
      if (assignedMs != null && assignedMs >= createdMs) {
        timeToFirstAssignmentMs = assignedMs - createdMs;
      }
    } else if (input.issue.assignee_account_id) {
      // Assigned since creation with no changelog assignee events.
      timeToFirstAssignmentMs = 0;
    }
  }

  return {
    integration_id: input.issue.integration_id,
    issue_id: input.issue.id,
    computation_version: JIRA_FLOW_COMPUTATION_VERSION,
    computed_at: asOf.toISOString(),
    source_issue_updated_at: input.issue.updated_at_jira,
    created_at_jira: input.issue.created_at_jira,
    resolved_at_jira: input.issue.resolved_at_jira,
    is_open: isOpen,
    lead_time_ms: leadTimeMs,
    aging_ms: agingMs,
    time_to_first_assignment_ms: timeToFirstAssignmentMs,
    first_develop_at: firstDevelopAt,
    first_staging_at: firstStagingAt,
    time_to_first_develop_ms: timeToFirstDevelopMs,
    time_to_first_staging_ms: timeToFirstStagingMs,
    reopen_count: reopenCount,
    develop_reentry_count: developReentryCount,
    assignee_change_count: assigneeChangeCount,
    status_transition_count: statusEvents.length,
    status_dwell_ms: statusDwellMs,
    status_group_dwell_ms: statusGroupDwellMs,
    current_status: input.issue.status,
    current_status_group: currentGroup as JiraStatusGroup,
    rules_snapshot: rulesSnapshot,
  };
}
