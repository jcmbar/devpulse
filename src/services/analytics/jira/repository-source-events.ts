import "server-only";

import { createClient } from "@/lib/supabase/server";

const ISSUE_ID_CHUNK_SIZE = 75;

export type FlowStatusEventRow = {
  issue_id: string;
  from_status: string | null;
  to_status: string | null;
  changed_at: string;
};

export type FlowAssigneeEventRow = {
  issue_id: string;
  from_account_id: string | null;
  to_account_id: string | null;
  changed_at: string;
};

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function describePostgrestError(error: {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}): string {
  return [
    error.message,
    error.details ? `details=${error.details}` : null,
    error.hint ? `hint=${error.hint}` : null,
    error.code ? `code=${error.code}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

async function createDiagnosticClient() {
  return createClient({
    debugFetch: {
      label: "jira-flow-events",
      match: (url) =>
        url.includes("/rest/v1/jira_issue_status_events") ||
        url.includes("/rest/v1/jira_issue_assignee_events"),
    },
  });
}

/**
 * Read normalized status events directly from Supabase/PostgREST.
 *
 * IDs are chunked because `.in(issue_id, [...])` is encoded in the GET URL;
 * sending every issue UUID at once can exceed HTTP/proxy URL limits and fail
 * in undici before a response exists.
 */
export async function listFlowStatusEvents(input: {
  integrationId: string;
  issueIds: string[];
}): Promise<FlowStatusEventRow[]> {
  const supabase = await createDiagnosticClient();
  const rows: FlowStatusEventRow[] = [];

  for (const issueIds of chunks(input.issueIds, ISSUE_ID_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("jira_issue_status_events")
      .select("issue_id, from_status, to_status, changed_at")
      .eq("integration_id", input.integrationId)
      .in("issue_id", issueIds)
      .order("changed_at", { ascending: true });

    if (error) {
      throw new Error(
        `Falha ao carregar status events: ${describePostgrestError(error)}`,
        { cause: error },
      );
    }

    for (const row of data ?? []) {
      rows.push({
        issue_id: String(row.issue_id),
        from_status: (row.from_status as string | null) ?? null,
        to_status: (row.to_status as string | null) ?? null,
        changed_at: String(row.changed_at),
      });
    }
  }

  return rows;
}

export async function listFlowAssigneeEvents(input: {
  integrationId: string;
  issueIds: string[];
}): Promise<FlowAssigneeEventRow[]> {
  const supabase = await createDiagnosticClient();
  const rows: FlowAssigneeEventRow[] = [];

  for (const issueIds of chunks(input.issueIds, ISSUE_ID_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("jira_issue_assignee_events")
      .select("issue_id, from_account_id, to_account_id, changed_at")
      .eq("integration_id", input.integrationId)
      .in("issue_id", issueIds)
      .order("changed_at", { ascending: true });

    if (error) {
      throw new Error(
        `Falha ao carregar assignee events: ${describePostgrestError(error)}`,
        { cause: error },
      );
    }

    for (const row of data ?? []) {
      rows.push({
        issue_id: String(row.issue_id),
        from_account_id:
          (row.from_account_id as string | null) ?? null,
        to_account_id: (row.to_account_id as string | null) ?? null,
        changed_at: String(row.changed_at),
      });
    }
  }

  return rows;
}
