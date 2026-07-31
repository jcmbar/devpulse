import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CollectedIssueBundle } from "@/services/integrations/jira/collectors/issues";

const CHUNK = 50;

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export type PersistSyncResult = {
  issuesUpserted: number;
  issuesReprocessed: number;
  issuesNew: number;
  statusEventsUpserted: number;
  assigneeEventsUpserted: number;
  worklogsUpserted: number;
};

/**
 * Idempotent persistence of a collected sync page/batch.
 * Upserts by natural Jira keys (integration_id + jira ids).
 * Reprocess count = issues that already existed (overlap / retries).
 */
export async function persistCollectedBundles(input: {
  integrationId: string;
  projectIdByKey: Map<string, string>;
  bundles: CollectedIssueBundle[];
}): Promise<PersistSyncResult> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  let issuesUpserted = 0;
  let issuesReprocessed = 0;
  let issuesNew = 0;
  let statusEventsUpserted = 0;
  let assigneeEventsUpserted = 0;
  let worklogsUpserted = 0;

  const jiraIds = input.bundles.map((bundle) => bundle.issue.jiraId);
  const existingIds = new Set<string>();

  for (const batch of chunkArray(jiraIds, CHUNK)) {
    if (batch.length === 0) {
      continue;
    }
    const { data, error } = await supabase
      .from("jira_issues")
      .select("jira_id")
      .eq("integration_id", input.integrationId)
      .in("jira_id", batch);

    if (error) {
      throw new Error(
        `Falha ao verificar issues existentes antes do upsert: ${error.message}`,
      );
    }
    for (const row of data ?? []) {
      existingIds.add(String(row.jira_id));
    }
  }

  const issueRows = input.bundles.map((bundle) => {
    const issue = bundle.issue;
    if (existingIds.has(issue.jiraId)) {
      issuesReprocessed += 1;
    } else {
      issuesNew += 1;
    }
    return {
      integration_id: input.integrationId,
      project_id: issue.projectKey
        ? (input.projectIdByKey.get(issue.projectKey) ?? null)
        : null,
      jira_id: issue.jiraId,
      jira_key: issue.jiraKey,
      summary: issue.summary,
      issue_type: issue.issueType,
      status: issue.status,
      status_category: issue.statusCategory,
      priority: issue.priority,
      labels: issue.labels,
      assignee_account_id: issue.assigneeAccountId,
      assignee_display_name: issue.assigneeDisplayName,
      reporter_account_id: issue.reporterAccountId,
      story_points: issue.storyPoints,
      created_at_jira: issue.createdAtJira,
      updated_at_jira: issue.updatedAtJira,
      resolved_at_jira: issue.resolvedAtJira,
      unit_test_delivery_on: issue.unitTestDeliveryOn,
      due_on: issue.dueOn,
      estimate_hours: issue.estimateHours,
      parent_key: issue.parentKey,
      content_hash: issue.contentHash,
      raw_payload: issue.rawPayload,
      last_synced_at: now,
    };
  });

  const issueIdByJiraId = new Map<string, string>();

  for (const batch of chunkArray(issueRows, CHUNK)) {
    if (batch.length === 0) {
      continue;
    }
    const { data, error } = await supabase
      .from("jira_issues")
      .upsert(batch, { onConflict: "integration_id,jira_id" })
      .select("id, jira_id");

    if (error) {
      throw new Error(`Falha ao upsert issues Jira: ${error.message}`);
    }

    issuesUpserted += data?.length ?? 0;
    for (const row of data ?? []) {
      issueIdByJiraId.set(String(row.jira_id), String(row.id));
    }
  }

  const statusRows: Array<Record<string, unknown>> = [];
  const assigneeRows: Array<Record<string, unknown>> = [];
  const worklogRows: Array<Record<string, unknown>> = [];

  for (const bundle of input.bundles) {
    const issueId = issueIdByJiraId.get(bundle.issue.jiraId);
    if (!issueId) {
      continue;
    }

    for (const event of bundle.statusEvents) {
      statusRows.push({
        integration_id: input.integrationId,
        issue_id: issueId,
        jira_changelog_id: event.jiraChangelogId,
        from_status: event.fromStatus,
        to_status: event.toStatus,
        from_status_id: event.fromStatusId,
        to_status_id: event.toStatusId,
        changed_at: event.changedAt,
        author_account_id: event.authorAccountId,
      });
    }

    for (const event of bundle.assigneeEvents) {
      assigneeRows.push({
        integration_id: input.integrationId,
        issue_id: issueId,
        jira_changelog_id: event.jiraChangelogId,
        from_account_id: event.fromAccountId,
        to_account_id: event.toAccountId,
        from_display_name: event.fromDisplayName,
        to_display_name: event.toDisplayName,
        changed_at: event.changedAt,
        author_account_id: event.authorAccountId,
      });
    }

    for (const worklog of bundle.worklogs) {
      worklogRows.push({
        integration_id: input.integrationId,
        issue_id: issueId,
        jira_worklog_id: worklog.jiraWorklogId,
        author_account_id: worklog.authorAccountId,
        author_display_name: worklog.authorDisplayName,
        time_spent_seconds: worklog.timeSpentSeconds,
        started_at: worklog.startedAt,
        created_at_jira: worklog.createdAtJira,
        updated_at_jira: worklog.updatedAtJira,
        comment_text: worklog.commentText,
        raw_payload: worklog.rawPayload,
        last_synced_at: now,
      });
    }
  }

  for (const batch of chunkArray(statusRows, CHUNK)) {
    if (batch.length === 0) {
      continue;
    }
    const { data, error } = await supabase
      .from("jira_issue_status_events")
      .upsert(batch, {
        onConflict:
          "integration_id,jira_changelog_id,from_status_id,to_status_id,changed_at",
      })
      .select("id");

    if (error) {
      throw new Error(`Falha ao upsert status events: ${error.message}`);
    }
    statusEventsUpserted += data?.length ?? batch.length;
  }

  for (const batch of chunkArray(assigneeRows, CHUNK)) {
    if (batch.length === 0) {
      continue;
    }
    const { data, error } = await supabase
      .from("jira_issue_assignee_events")
      .upsert(batch, {
        onConflict:
          "integration_id,jira_changelog_id,from_account_id,to_account_id,changed_at",
      })
      .select("id");

    if (error) {
      throw new Error(`Falha ao upsert assignee events: ${error.message}`);
    }
    assigneeEventsUpserted += data?.length ?? batch.length;
  }

  for (const batch of chunkArray(worklogRows, CHUNK)) {
    if (batch.length === 0) {
      continue;
    }
    const { data, error } = await supabase
      .from("jira_worklogs")
      .upsert(batch, { onConflict: "integration_id,jira_worklog_id" })
      .select("id");

    if (error) {
      throw new Error(`Falha ao upsert worklogs: ${error.message}`);
    }
    worklogsUpserted += data?.length ?? batch.length;
  }

  return {
    issuesUpserted,
    issuesReprocessed,
    issuesNew,
    statusEventsUpserted,
    assigneeEventsUpserted,
    worklogsUpserted,
  };
}
