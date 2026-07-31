import "server-only";

import {
  JIRA_MAX_RETRIES,
  JIRA_RETRY_BASE_MS,
  JIRA_RETRY_MAX_MS,
} from "@/services/integrations/jira/constants";

export class JiraApiError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;
  readonly body: string;

  constructor(input: {
    message: string;
    status: number;
    retryAfterMs?: number | null;
    body?: string;
  }) {
    super(input.message);
    this.name = "JiraApiError";
    this.status = input.status;
    this.retryAfterMs = input.retryAfterMs ?? null;
    this.body = input.body ?? "";
  }
}

export type JiraClientOptions = {
  baseUrl: string;
  email: string;
  apiToken: string;
  /** Optional hook for sync run request counting. */
  onRequest?: () => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) {
    return null;
  }
  const asInt = Number(header);
  if (Number.isFinite(asInt) && asInt >= 0) {
    return asInt * 1000;
  }
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return null;
}

function backoffMs(attempt: number, retryAfterMs: number | null): number {
  if (retryAfterMs != null && retryAfterMs > 0) {
    return Math.min(retryAfterMs, JIRA_RETRY_MAX_MS);
  }
  const exp = Math.min(
    JIRA_RETRY_MAX_MS,
    JIRA_RETRY_BASE_MS * 2 ** attempt,
  );
  const jitter = Math.floor(Math.random() * JIRA_RETRY_BASE_MS);
  return exp + jitter;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

/**
 * Minimal Jira Cloud REST client (read-only usage).
 * Handles 429/5xx with Retry-After + exponential backoff + jitter.
 */
export class JiraClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly onRequest?: () => void;
  private requestCount = 0;

  constructor(options: JiraClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    const token = Buffer.from(
      `${options.email}:${options.apiToken}`,
      "utf8",
    ).toString("base64");
    this.authHeader = `Basic ${token}`;
    this.onRequest = options.onRequest;
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  async getMyself(): Promise<{
    accountId: string;
    displayName: string;
    emailAddress?: string;
    /** IANA timezone of the authenticated user (JQL datetime zone). */
    timeZone?: string;
  }> {
    return this.requestJson("GET", "/rest/api/3/myself");
  }

  /**
   * User search (Cloud). Query matches display name / email.
   * `emailAddress` may be omitted under privacy settings.
   * @see https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-users/#api-rest-api-3-user-search-get
   */
  async searchUsers(input: {
    query: string;
    maxResults?: number;
  }): Promise<
    Array<{
      accountId: string;
      displayName?: string;
      emailAddress?: string;
      active?: boolean;
    }>
  > {
    const query = input.query.trim();
    if (!query) {
      return [];
    }
    const maxResults = Math.min(50, Math.max(1, input.maxResults ?? 20));
    const path = `/rest/api/3/user/search?query=${encodeURIComponent(query)}&maxResults=${maxResults}`;
    const data = await this.requestJson<
      Array<{
        accountId?: string;
        displayName?: string;
        emailAddress?: string;
        active?: boolean;
      }>
    >("GET", path);

    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .filter((row) => typeof row.accountId === "string" && row.accountId)
      .map((row) => ({
        accountId: String(row.accountId),
        displayName:
          typeof row.displayName === "string" ? row.displayName : undefined,
        emailAddress:
          typeof row.emailAddress === "string" ? row.emailAddress : undefined,
        active: row.active,
      }));
  }

  async getProjects(): Promise<
    Array<{ id: string; key: string; name: string; style?: string }>
  > {
    // Paginated project search (Cloud).
    const projects: Array<{
      id: string;
      key: string;
      name: string;
      style?: string;
    }> = [];
    let startAt = 0;
    const maxResults = 50;

    for (;;) {
      const page = await this.requestJson<{
        values?: Array<{
          id: string;
          key: string;
          name: string;
          style?: string;
        }>;
        isLast?: boolean;
        startAt?: number;
        maxResults?: number;
        total?: number;
      }>(
        "GET",
        `/rest/api/3/project/search?startAt=${startAt}&maxResults=${maxResults}`,
      );

      for (const row of page.values ?? []) {
        projects.push({
          id: String(row.id),
          key: String(row.key),
          name: String(row.name),
          style: row.style,
        });
      }

      if (page.isLast || !(page.values?.length)) {
        break;
      }
      startAt += page.values?.length ?? maxResults;
    }

    return projects;
  }

  /**
   * System + custom fields available to the authenticated user.
   * @see https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-fields/#api-rest-api-3-field-get
   */
  async getFields(): Promise<
    Array<{
      id: string;
      name: string;
      custom: boolean;
      schemaType: string | null;
    }>
  > {
    const data = await this.requestJson<
      Array<{
        id?: string;
        name?: string;
        custom?: boolean;
        schema?: { type?: string };
      }>
    >("GET", "/rest/api/3/field");

    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .filter((row) => typeof row.id === "string" && row.id)
      .map((row) => ({
        id: String(row.id),
        name: typeof row.name === "string" ? row.name : String(row.id),
        custom: Boolean(row.custom),
        schemaType:
          typeof row.schema?.type === "string" ? row.schema.type : null,
      }));
  }

  /**
   * Enhanced JQL search (Cloud). Uses nextPageToken pagination.
   * @see https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/
   */
  async searchIssuesJql(input: {
    jql: string;
    fields: string[];
    expand?: string[];
    maxResults?: number;
    nextPageToken?: string | null;
  }): Promise<{
    issues: unknown[];
    nextPageToken: string | null;
    isLast: boolean;
  }> {
    const body: Record<string, unknown> = {
      jql: input.jql,
      fields: input.fields,
      maxResults: input.maxResults ?? 50,
    };
    if (input.expand?.length) {
      body.expand = input.expand.join(",");
    }
    if (input.nextPageToken) {
      body.nextPageToken = input.nextPageToken;
    }

    // Temporary diagnostic for validating the exact query sent to Jira.
    // JQL contains no credentials; remove after field validation is complete.
    console.info(`[jira.search] final JQL: ${input.jql}`);

    const data = await this.requestJson<{
      issues?: unknown[];
      nextPageToken?: string;
      isLast?: boolean;
    }>("POST", "/rest/api/3/search/jql", body);

    return {
      issues: data.issues ?? [],
      nextPageToken: data.nextPageToken ?? null,
      isLast: Boolean(data.isLast ?? !data.nextPageToken),
    };
  }

  /**
   * Full issue changelog (paginated). Primary source for status/assignee timeline.
   * Prefer this over search expand=changelog (which truncates long histories).
   */
  async getIssueChangelog(
    issueIdOrKey: string,
    startAt = 0,
    maxResults = 100,
  ): Promise<{
    values: unknown[];
    startAt: number;
    maxResults: number;
    total: number;
    isLast: boolean;
  }> {
    const data = await this.requestJson<{
      values?: unknown[];
      startAt?: number;
      maxResults?: number;
      total?: number;
      isLast?: boolean;
    }>(
      "GET",
      `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/changelog?startAt=${startAt}&maxResults=${maxResults}`,
    );

    const values = data.values ?? [];
    const total = data.total ?? values.length;
    const pageStart = data.startAt ?? startAt;
    const pageSize = data.maxResults ?? maxResults;

    return {
      values,
      startAt: pageStart,
      maxResults: pageSize,
      total,
      isLast: Boolean(data.isLast ?? pageStart + values.length >= total),
    };
  }

  async getIssueWorklogs(
    issueIdOrKey: string,
    startAt = 0,
    maxResults = 100,
  ): Promise<{
    worklogs: unknown[];
    startAt: number;
    maxResults: number;
    total: number;
  }> {
    const data = await this.requestJson<{
      worklogs?: unknown[];
      startAt?: number;
      maxResults?: number;
      total?: number;
    }>(
      "GET",
      `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/worklog?startAt=${startAt}&maxResults=${maxResults}`,
    );

    return {
      worklogs: data.worklogs ?? [],
      startAt: data.startAt ?? startAt,
      maxResults: data.maxResults ?? maxResults,
      total: data.total ?? (data.worklogs?.length ?? 0),
    };
  }

  private async requestJson<T>(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    let attempt = 0;

    for (;;) {
      this.requestCount += 1;
      this.onRequest?.();

      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });

      if (response.ok) {
        if (response.status === 204) {
          return {} as T;
        }
        return (await response.json()) as T;
      }

      const text = await response.text().catch(() => "");
      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      const retriable =
        response.status === 429 ||
        response.status === 503 ||
        response.status === 502 ||
        response.status === 504;

      if (!retriable || attempt >= JIRA_MAX_RETRIES) {
        throw new JiraApiError({
          message: `Jira API ${method} ${path} failed (${response.status})`,
          status: response.status,
          retryAfterMs,
          body: text.slice(0, 2000),
        });
      }

      const wait = backoffMs(attempt, retryAfterMs);
      attempt += 1;
      await sleep(wait);
    }
  }
}
