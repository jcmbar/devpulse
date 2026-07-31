import "server-only";

import {
  JIRA_CHANGELOG_PAGE_SIZE,
  JIRA_MAX_CHANGELOG_HISTORIES_PER_ISSUE,
} from "@/services/integrations/jira/constants";
import type { JiraClient } from "@/services/integrations/jira/client";
import {
  normalizeChangelogEvents,
  type NormalizedAssigneeEvent,
  type NormalizedStatusEvent,
} from "@/services/integrations/jira/normalizers/events";
import type { RawJiraChangelogHistory } from "@/services/integrations/jira/normalizers/issue";

export type ChangelogCollectResult = {
  statusEvents: NormalizedStatusEvent[];
  assigneeEvents: NormalizedAssigneeEvent[];
  historiesFetched: number;
  requestCount: number;
  pagesFetched: number;
  capped: boolean;
};

/**
 * Full changelog via dedicated endpoint:
 * GET /rest/api/3/issue/{idOrKey}/changelog
 *
 * Prefer this over search `expand=changelog`, which truncates long histories
 * and is unsuitable as the primary source for flow metrics.
 */
export async function collectChangelogForIssue(
  client: JiraClient,
  issueIdOrKey: string,
  targets?: {
    statusFieldId?: string | null;
    assigneeFieldId?: string | null;
  },
): Promise<ChangelogCollectResult> {
  const histories: RawJiraChangelogHistory[] = [];
  let startAt = 0;
  let requestCount = 0;
  let pagesFetched = 0;
  let capped = false;

  for (;;) {
    requestCount += 1;
    pagesFetched += 1;
    const page = await client.getIssueChangelog(
      issueIdOrKey,
      startAt,
      JIRA_CHANGELOG_PAGE_SIZE,
    );

    for (const value of page.values) {
      histories.push(value as RawJiraChangelogHistory);
    }

    startAt += page.values.length;

    if (page.isLast || page.values.length === 0 || startAt >= page.total) {
      break;
    }

    if (startAt >= JIRA_MAX_CHANGELOG_HISTORIES_PER_ISSUE) {
      capped = true;
      break;
    }
  }

  const events = normalizeChangelogEvents(histories, targets);

  return {
    statusEvents: events.statusEvents,
    assigneeEvents: events.assigneeEvents,
    historiesFetched: histories.length,
    requestCount,
    pagesFetched,
    capped,
  };
}
