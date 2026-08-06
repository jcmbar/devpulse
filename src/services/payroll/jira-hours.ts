import "server-only";

import { endOfMonth, startOfMonth } from "@/lib/metrics/date-range";
import { createClient } from "@/lib/supabase/server";

export { computeContractedHoursDelta } from "@/lib/metrics/payroll-calc";

/**
 * Sum Jira worklog hours in the calendar month, keyed by developer id.
 * Matches worklogs by author_account_id ↔ developers.jira_account_id.
 */
export async function mapJiraWorklogHoursByDeveloperForMonth(input: {
  yearMonth: string;
  developerIds: string[];
}): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (input.developerIds.length === 0) {
    return result;
  }

  const supabase = await createClient();
  const { data: developers, error: developersError } = await supabase
    .from("developers")
    .select("id, jira_account_id")
    .in("id", input.developerIds);

  if (developersError) {
    throw new Error(
      `Falha ao carregar pessoas para horas Jira: ${developersError.message}`,
    );
  }

  const accountToDeveloper = new Map<string, string>();
  for (const row of developers ?? []) {
    const accountId =
      typeof row.jira_account_id === "string"
        ? row.jira_account_id.trim()
        : "";
    if (!accountId) {
      continue;
    }
    accountToDeveloper.set(accountId, String(row.id));
  }

  if (accountToDeveloper.size === 0) {
    return result;
  }

  const rangeStart = `${startOfMonth(input.yearMonth)}T00:00:00.000Z`;
  const rangeEndExclusive = (() => {
    const end = endOfMonth(input.yearMonth);
    const next = new Date(`${end}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString();
  })();

  const accountIds = [...accountToDeveloper.keys()];
  const { data: worklogs, error: worklogsError } = await supabase
    .from("jira_worklogs")
    .select("author_account_id, time_spent_seconds")
    .in("author_account_id", accountIds)
    .gte("started_at", rangeStart)
    .lt("started_at", rangeEndExclusive);

  if (worklogsError) {
    throw new Error(
      `Falha ao carregar worklogs Jira: ${worklogsError.message}`,
    );
  }

  const secondsByDeveloper = new Map<string, number>();
  for (const row of worklogs ?? []) {
    const accountId =
      typeof row.author_account_id === "string"
        ? row.author_account_id.trim()
        : "";
    const developerId = accountToDeveloper.get(accountId);
    if (!developerId) {
      continue;
    }
    const seconds = Number(row.time_spent_seconds ?? 0);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      continue;
    }
    secondsByDeveloper.set(
      developerId,
      (secondsByDeveloper.get(developerId) ?? 0) + seconds,
    );
  }

  for (const [developerId, seconds] of secondsByDeveloper) {
    result.set(developerId, Math.round((seconds / 3600) * 100) / 100);
  }

  return result;
}
