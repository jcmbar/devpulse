import {
  classifyStatusGroup,
  type ResolvedStatusMapping,
} from "@/services/analytics/jira/status-mapping";
import type { JiraStatusGroup } from "@/types/jira-flow-analytics";

export type StatusAtIssueInput = {
  status: string | null;
  created_at_jira: string | null;
  resolved_at_jira: string | null;
};

export type StatusAtEventInput = {
  from_status: string | null;
  to_status: string | null;
  changed_at: string;
};

export type StatusAtResult = {
  /** Raw status label as of asOf (best effort). */
  status: string | null;
  group: JiraStatusGroup;
  /** False when no changelog events — status may be projected from current issue.status. */
  hasEvents: boolean;
  /** Issue did not exist yet at asOf (asOf < created_at). */
  existed: boolean;
};

function toMs(iso: string | null | undefined): number | null {
  if (!iso) {
    return null;
  }
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Reconstruct status group at an instant (UTC), matching flow_v1 timeline seeds:
 * - Before first event: `from_status` of first event, else current `issue.status`
 * - Apply events with `changed_at <= asOf`
 * - If no events: project current `issue.status` for all days since created
 *   (documented approximation — same as flow_v1 dwell seed when changelog is empty)
 *
 * Reopen: group follows events; open/closed uses resolved_at vs asOf separately
 * via `isOpenAtAsOf`.
 */
export function statusGroupAt(
  issue: StatusAtIssueInput,
  events: StatusAtEventInput[],
  asOf: Date,
  mapping: ResolvedStatusMapping,
): StatusAtResult {
  const asOfMs = asOf.getTime();
  const createdMs = toMs(issue.created_at_jira);
  const { groups, strict } = mapping;

  if (createdMs != null && asOfMs < createdMs) {
    return {
      status: null,
      group: "other",
      hasEvents: events.length > 0,
      existed: false,
    };
  }

  const ordered = [...events].sort((a, b) =>
    a.changed_at.localeCompare(b.changed_at),
  );

  if (ordered.length === 0) {
    const status = issue.status;
    return {
      status,
      group: classifyStatusGroup(status, groups, { strict }) as JiraStatusGroup,
      hasEvents: false,
      existed: true,
    };
  }

  let status = ordered[0]?.from_status ?? issue.status ?? "unknown";
  let applied = 0;

  for (const event of ordered) {
    const eventMs = toMs(event.changed_at);
    if (eventMs == null || eventMs > asOfMs) {
      break;
    }
    status = event.to_status ?? status;
    applied += 1;
  }

  return {
    status,
    group: classifyStatusGroup(status, groups, { strict }) as JiraStatusGroup,
    hasEvents: applied > 0 || ordered.length > 0,
    existed: true,
  };
}

/**
 * Open-as-of semantics for historical WIP (aligned with flow_v1 intent):
 * - must exist (created <= asOf)
 * - status group at asOf is not `done`
 * - resolved_at is null OR resolved_at > asOf (reopen after resolve returns to WIP)
 *
 * Note: does **not** use current `status_category` (not historically safe).
 */
export function isOpenAtAsOf(
  issue: StatusAtIssueInput,
  events: StatusAtEventInput[],
  asOf: Date,
  mapping: ResolvedStatusMapping,
): boolean {
  const asOfMs = asOf.getTime();
  const createdMs = toMs(issue.created_at_jira);
  if (createdMs != null && asOfMs < createdMs) {
    return false;
  }

  const resolvedMs = toMs(issue.resolved_at_jira);
  if (resolvedMs != null && resolvedMs <= asOfMs) {
    return false;
  }

  const at = statusGroupAt(issue, events, asOf, mapping);
  if (!at.existed) {
    return false;
  }
  return at.group !== "done";
}
