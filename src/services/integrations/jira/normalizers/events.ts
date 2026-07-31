import type { RawJiraChangelogHistory } from "@/services/integrations/jira/normalizers/issue";

export type NormalizedStatusEvent = {
  jiraChangelogId: string;
  fromStatus: string | null;
  toStatus: string | null;
  fromStatusId: string | null;
  toStatusId: string | null;
  changedAt: string;
  authorAccountId: string | null;
};

export type NormalizedAssigneeEvent = {
  jiraChangelogId: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  fromDisplayName: string | null;
  toDisplayName: string | null;
  changedAt: string;
  authorAccountId: string | null;
};

export type ChangelogFieldTargets = {
  /** Jira field id or name for status transitions (default: status). */
  statusFieldId?: string | null;
  /** Jira field id or name for assignee transitions (default: assignee). */
  assigneeFieldId?: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function matchesChangelogField(
  item: { field?: string; fieldId?: string },
  mappedId: string | null | undefined,
  fallbackName: string,
): boolean {
  const target = (mappedId?.trim() || fallbackName).toLowerCase();
  const field = (item.field ?? "").toLowerCase();
  const fieldId = (item.fieldId ?? "").toLowerCase();
  return field === target || fieldId === target;
}

export function normalizeChangelogEvents(
  histories: RawJiraChangelogHistory[],
  targets: ChangelogFieldTargets = {},
): {
  statusEvents: NormalizedStatusEvent[];
  assigneeEvents: NormalizedAssigneeEvent[];
} {
  const statusEvents: NormalizedStatusEvent[] = [];
  const assigneeEvents: NormalizedAssigneeEvent[] = [];

  for (const history of histories) {
    const changelogId = asString(history.id);
    const changedAt = asString(history.created);
    if (!changelogId || !changedAt) {
      continue;
    }
    const authorAccountId = asString(history.author?.accountId);

    for (const item of history.items ?? []) {
      if (
        matchesChangelogField(item, targets.statusFieldId, "status")
      ) {
        statusEvents.push({
          jiraChangelogId: changelogId,
          fromStatus: asString(item.fromString),
          toStatus: asString(item.toString),
          fromStatusId: asString(item.from),
          toStatusId: asString(item.to),
          changedAt,
          authorAccountId,
        });
      }
      if (
        matchesChangelogField(item, targets.assigneeFieldId, "assignee")
      ) {
        assigneeEvents.push({
          jiraChangelogId: changelogId,
          fromAccountId: asString(item.from),
          toAccountId: asString(item.to),
          fromDisplayName: asString(item.fromString),
          toDisplayName: asString(item.toString),
          changedAt,
          authorAccountId,
        });
      }
    }
  }

  return { statusEvents, assigneeEvents };
}
