import "server-only";

import { createHash } from "crypto";
import {
  JIRA_DEFAULT_PAGE_SIZE,
  JIRA_MAX_SEARCH_PAGES,
  JIRA_MAX_WORKLOGS_PER_ISSUE,
  JIRA_SECONDARY_CONCURRENCY,
} from "@/services/integrations/jira/constants";
import type { JiraClient } from "@/services/integrations/jira/client";
import { collectChangelogForIssue } from "@/services/integrations/jira/collectors/changelog";
import {
  normalizeJiraIssue,
  type NormalizedJiraIssue,
  type RawJiraIssue,
} from "@/services/integrations/jira/normalizers/issue";
import type {
  NormalizedAssigneeEvent,
  NormalizedStatusEvent,
} from "@/services/integrations/jira/normalizers/events";
import {
  normalizeWorklog,
  type NormalizedWorklog,
} from "@/services/integrations/jira/normalizers/worklog";
import {
  createEmptySyncMetrics,
  JiraPaginationError,
  type JiraSyncRunMetrics,
  type JiraSyncStopReason,
} from "@/services/integrations/jira/sync/metrics";
import type { JiraFieldMappings } from "@/types/jira-integration";
import {
  collectSearchJiraFieldIds,
  resolveJiraFieldMappings,
} from "@/lib/jira/field-mappings";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** Resolve project key using integration mapping before full normalize. */
function peekProjectKey(
  raw: RawJiraIssue,
  integrationMappings: JiraFieldMappings,
): string | null {
  const fields = asRecord(raw.fields) ?? {};
  const projectFieldId = integrationMappings.project?.trim() || "project";
  const project =
    projectFieldId === "project"
      ? asRecord(fields.project)
      : asRecord(fields[projectFieldId]);
  const key = project?.key;
  return typeof key === "string" && key.trim() ? key.trim() : null;
}

export type CollectedIssueBundle = {
  issue: NormalizedJiraIssue;
  statusEvents: NormalizedStatusEvent[];
  assigneeEvents: NormalizedAssigneeEvent[];
  worklogs: NormalizedWorklog[];
  rawChangelogHistories: number;
};

export type CollectIssuesResult = {
  bundles: CollectedIssueBundle[];
  pagesFetched: number;
  maxUpdatedAt: string | null;
  metrics: Pick<
    JiraSyncRunMetrics,
    | "stop_reason"
    | "stop_detail"
    | "tokens_seen"
    | "pages_repeated"
    | "worklogs_fetched"
    | "worklog_issue_requests"
    | "changelog_issues_processed"
    | "changelog_histories_fetched"
    | "changelog_issue_requests"
    | "changelog_pages_fetched"
    | "changelog_capped_issues"
    | "unique_issue_keys"
    | "max_updated_at"
  >;
};

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function run() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current]);
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => run(),
  );
  await Promise.all(runners);
  return results;
}

function pageContentFingerprint(issueKeys: string[]): string {
  const normalized = [...issueKeys].sort().join("|");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 24);
}

function normalizeToken(token: string | null | undefined): string | null {
  if (token == null) {
    return null;
  }
  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Fetch full worklog history via dedicated endpoint:
 * GET /rest/api/3/issue/{id}/worklog
 *
 * Do NOT rely on embedded `fields.worklog` from search — that payload is
 * truncated (typically first few entries) and unsuitable for analytics.
 */
async function collectWorklogsForIssue(
  client: JiraClient,
  issueIdOrKey: string,
): Promise<{ worklogs: NormalizedWorklog[]; requestCount: number }> {
  const worklogs: NormalizedWorklog[] = [];
  let startAt = 0;
  let requestCount = 0;

  for (;;) {
    requestCount += 1;
    const wl = await client.getIssueWorklogs(issueIdOrKey, startAt, 100);
    for (const row of wl.worklogs) {
      const normalized = normalizeWorklog(row);
      if (normalized) {
        worklogs.push(normalized);
      }
    }
    startAt += wl.worklogs.length;
    if (startAt >= wl.total || wl.worklogs.length === 0) {
      break;
    }
    if (startAt >= JIRA_MAX_WORKLOGS_PER_ISSUE) {
      break;
    }
  }

  return { worklogs, requestCount };
}

export async function collectProjects(client: JiraClient) {
  return client.getProjects();
}

/**
 * 1) Search candidates via `/search/jql` (no changelog expand).
 * 2) Enrich with full changelog via GET `/issue/{id}/changelog`.
 * 3) Optionally enrich worklogs via dedicated endpoint.
 *
 * Completeness of status/assignee timeline takes priority over minimizing API calls.
 */
export async function collectIssues(input: {
  client: JiraClient;
  jql: string;
  /** Default integration-level mappings. */
  fieldMappings: JiraFieldMappings;
  /** Optional overrides keyed by project key (uppercase). */
  fieldMappingsByProjectKey?: Record<string, JiraFieldMappings>;
  includeChangelog: boolean;
  includeWorklogs: boolean;
  onPage?: (info: { page: number; fetched: number }) => void;
}): Promise<CollectIssuesResult> {
  const projectMappingsList = Object.values(
    input.fieldMappingsByProjectKey ?? {},
  );
  const uniqueFields = collectSearchJiraFieldIds(
    input.fieldMappings,
    projectMappingsList,
  );
  if (uniqueFields.length === 0) {
    throw new Error(
      "Nenhum campo Jira mapeado para a search. Configure o de/para antes do sync.",
    );
  }

  const bundles: CollectedIssueBundle[] = [];
  const seenTokens = new Set<string>();
  const seenPageFingerprints = new Set<string>();
  const uniqueKeys = new Set<string>();

  let requestToken: string | null = null;
  let pagesFetched = 0;
  let pagesRepeated = 0;
  let maxUpdatedAt: string | null = null;
  let worklogsFetched = 0;
  let worklogIssueRequests = 0;
  let changelogIssuesProcessed = 0;
  let changelogHistoriesFetched = 0;
  let changelogIssueRequests = 0;
  let changelogPagesFetched = 0;
  let changelogCappedIssues = 0;
  let stopReason: JiraSyncStopReason = "completed";
  let stopDetail: string | null = null;

  const buildPartialMetrics = () =>
    createEmptySyncMetrics({
      stop_reason: stopReason,
      stop_detail: stopDetail,
      tokens_seen: seenTokens.size,
      pages_repeated: pagesRepeated,
      worklogs_fetched: worklogsFetched,
      worklog_issue_requests: worklogIssueRequests,
      changelog_issues_processed: changelogIssuesProcessed,
      changelog_histories_fetched: changelogHistoriesFetched,
      changelog_issue_requests: changelogIssueRequests,
      changelog_pages_fetched: changelogPagesFetched,
      changelog_capped_issues: changelogCappedIssues,
      unique_issue_keys: uniqueKeys.size,
      max_updated_at: maxUpdatedAt,
    });

  while (pagesFetched < JIRA_MAX_SEARCH_PAGES) {
    if (requestToken) {
      if (seenTokens.has(requestToken)) {
        throw new JiraPaginationError(
          "repeated_next_page_token",
          `Paginação Jira abortada: nextPageToken repetido na página ${pagesFetched + 1}. Token já visto neste sync run.`,
          buildPartialMetrics(),
        );
      }
      seenTokens.add(requestToken);
    }

    // Intentionally no expand=changelog — truncated expand is not analytics-safe.
    const page = await input.client.searchIssuesJql({
      jql: input.jql,
      fields: uniqueFields,
      maxResults: JIRA_DEFAULT_PAGE_SIZE,
      nextPageToken: requestToken,
    });

    pagesFetched += 1;
    input.onPage?.({ page: pagesFetched, fetched: page.issues.length });

    const pageKeys: string[] = [];
    for (const raw of page.issues) {
      const key =
        raw && typeof raw === "object" && "key" in raw
          ? String((raw as { key?: unknown }).key ?? "")
          : "";
      if (key) {
        pageKeys.push(key);
      }
    }

    const fingerprint = pageContentFingerprint(pageKeys);
    if (seenPageFingerprints.has(fingerprint) && pageKeys.length > 0) {
      pagesRepeated += 1;
      throw new JiraPaginationError(
        "repeated_page_content",
        `Paginação Jira abortada: conteúdo de página repetido (hash ${fingerprint}) na página ${pagesFetched}. Possível loop de nextPageToken.`,
        {
          ...buildPartialMetrics(),
          stop_reason: "repeated_page_content",
          pages_repeated: pagesRepeated,
        },
      );
    }
    if (pageKeys.length > 0) {
      seenPageFingerprints.add(fingerprint);
    }

    if (pagesFetched === 1 && page.issues.length === 0) {
      stopReason = "empty_first_page";
      stopDetail = "Primeira página sem issues para o JQL informado.";
      break;
    }

    const pageBundles: CollectedIssueBundle[] = [];

    for (const raw of page.issues) {
      const issueRaw = raw as RawJiraIssue;
      const projectKeyHint = peekProjectKey(issueRaw, input.fieldMappings);
      const resolved = resolveJiraFieldMappings({
        projectKey: projectKeyHint,
        projectMappings: projectKeyHint
          ? input.fieldMappingsByProjectKey?.[
              projectKeyHint.trim().toUpperCase()
            ]
          : null,
        integrationMappings: input.fieldMappings,
      });
      const issue = normalizeJiraIssue(
        issueRaw,
        resolved.mappings,
        resolved,
      );
      if (!issue) {
        continue;
      }

      uniqueKeys.add(issue.jiraKey);

      if (
        issue.updatedAtJira &&
        (!maxUpdatedAt || issue.updatedAtJira > maxUpdatedAt)
      ) {
        maxUpdatedAt = issue.updatedAtJira;
      }

      pageBundles.push({
        issue,
        statusEvents: [],
        assigneeEvents: [],
        worklogs: [],
        rawChangelogHistories: 0,
      });
    }

    if (input.includeChangelog && pageBundles.length > 0) {
      await mapPool(
        pageBundles,
        JIRA_SECONDARY_CONCURRENCY,
        async (bundle) => {
          const projectKey = bundle.issue.projectKey;
          const resolved = resolveJiraFieldMappings({
            projectKey,
            projectMappings: projectKey
              ? input.fieldMappingsByProjectKey?.[
                  projectKey.trim().toUpperCase()
                ]
              : null,
            integrationMappings: input.fieldMappings,
          });
          const result = await collectChangelogForIssue(
            input.client,
            bundle.issue.jiraId,
            {
              statusFieldId: resolved.mappings.status ?? "status",
              assigneeFieldId: resolved.mappings.assignee ?? "assignee",
            },
          );
          bundle.statusEvents = result.statusEvents;
          bundle.assigneeEvents = result.assigneeEvents;
          bundle.rawChangelogHistories = result.historiesFetched;
          changelogIssuesProcessed += 1;
          changelogHistoriesFetched += result.historiesFetched;
          changelogIssueRequests += result.requestCount;
          changelogPagesFetched += result.pagesFetched;
          if (result.capped) {
            changelogCappedIssues += 1;
          }
          return bundle;
        },
      );
    }

    if (input.includeWorklogs && pageBundles.length > 0) {
      await mapPool(
        pageBundles,
        JIRA_SECONDARY_CONCURRENCY,
        async (bundle) => {
          const result = await collectWorklogsForIssue(
            input.client,
            bundle.issue.jiraId,
          );
          bundle.worklogs = result.worklogs;
          worklogsFetched += result.worklogs.length;
          worklogIssueRequests += result.requestCount;
          return bundle;
        },
      );
    }

    bundles.push(...pageBundles);

    const returnedToken = normalizeToken(page.nextPageToken);

    if (page.isLast) {
      stopReason = "is_last";
      stopDetail = `API sinalizou isLast=true após ${pagesFetched} página(s).`;
      break;
    }

    if (returnedToken == null) {
      stopReason =
        page.nextPageToken === ""
          ? "empty_next_page_token"
          : "missing_next_page_token";
      stopDetail = `nextPageToken ausente/vazio após página ${pagesFetched} (isLast=${String(page.isLast)}). Encerrando com segurança.`;
      break;
    }

    if (requestToken && returnedToken === requestToken) {
      throw new JiraPaginationError(
        "repeated_next_page_token",
        `Paginação Jira abortada: API devolveu o mesmo nextPageToken (${returnedToken.slice(0, 24)}…) sem avançar.`,
        buildPartialMetrics(),
      );
    }

    if (seenTokens.has(returnedToken)) {
      throw new JiraPaginationError(
        "repeated_next_page_token",
        `Paginação Jira abortada: nextPageToken já observado neste run (${returnedToken.slice(0, 24)}…).`,
        buildPartialMetrics(),
      );
    }

    requestToken = returnedToken;
  }

  if (pagesFetched >= JIRA_MAX_SEARCH_PAGES && stopReason === "completed") {
    stopReason = "max_pages";
    stopDetail = `Cap de ${JIRA_MAX_SEARCH_PAGES} páginas atingido antes de isLast/token final. Cursor não deve avançar.`;
  }

  if (stopReason === "completed") {
    stopReason = "is_last";
    stopDetail = "Loop encerrado sem token adicional.";
  }

  return {
    bundles,
    pagesFetched,
    maxUpdatedAt,
    metrics: {
      stop_reason: stopReason,
      stop_detail: stopDetail,
      tokens_seen: seenTokens.size,
      pages_repeated: pagesRepeated,
      worklogs_fetched: worklogsFetched,
      worklog_issue_requests: worklogIssueRequests,
      changelog_issues_processed: changelogIssuesProcessed,
      changelog_histories_fetched: changelogHistoriesFetched,
      changelog_issue_requests: changelogIssueRequests,
      changelog_pages_fetched: changelogPagesFetched,
      changelog_capped_issues: changelogCappedIssues,
      unique_issue_keys: uniqueKeys.size,
      max_updated_at: maxUpdatedAt,
    },
  };
}
