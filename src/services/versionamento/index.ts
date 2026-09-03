import "server-only";

import packageJson from "../../../package.json";
import { getAppBuildInfo } from "@/lib/app-version";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  toPaginatedList,
  type PaginatedList,
} from "@/lib/admin-list-query";

export const RELEASE_TYPES = ["major", "minor", "patch", "hotfix"] as const;
export type ReleaseType = (typeof RELEASE_TYPES)[number];

export type AppRelease = {
  id: string;
  version: string;
  released_at: string;
  release_type: ReleaseType;
  commit_sha: string | null;
  source: string;
  description: string;
  commit_descriptions: string;
  created_by: string | null;
  created_at: string;
  author: {
    full_name: string | null;
    email: string;
  } | null;
};

const RELEASE_SELECT = `
  id,
  version,
  released_at,
  release_type,
  commit_sha,
  source,
  description,
  commit_descriptions,
  created_by,
  created_at,
  author:profiles!created_by (
    full_name,
    email
  )
`;

function isReleaseType(value: unknown): value is ReleaseType {
  return (
    typeof value === "string" &&
    (RELEASE_TYPES as readonly string[]).includes(value)
  );
}

function mapRelease(row: Record<string, unknown>): AppRelease {
  const author = row.author;
  return {
    id: String(row.id),
    version: String(row.version),
    released_at: String(row.released_at),
    release_type: isReleaseType(row.release_type)
      ? row.release_type
      : "patch",
    commit_sha: row.commit_sha ? String(row.commit_sha) : null,
    source: String(row.source ?? "manual"),
    description: String(row.description),
    commit_descriptions: String(row.commit_descriptions),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    author:
      author && typeof author === "object"
        ? {
            full_name:
              typeof (author as Record<string, unknown>).full_name === "string"
                ? ((author as Record<string, unknown>).full_name as string)
                : null,
            email: String((author as Record<string, unknown>).email ?? ""),
          }
        : null,
  };
}

function firstNonEmpty(...values: Array<string | undefined | null>): string | null {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function releaseTypeFromCommits(commits: string): ReleaseType {
  if (/BREAKING CHANGE|!:/i.test(commits)) {
    return "major";
  }
  if (/^feat(?:\(.+\))?:/im.test(commits)) {
    return "minor";
  }
  return "patch";
}

function releaseVersion(baseVersion: string, commitSha: string): string {
  const base = baseVersion.replace(/^v/i, "").replace(/\+.*/, "");
  return `v${base}+${commitSha.slice(0, 7)}`;
}

function githubRepository(): string | null {
  const configured = firstNonEmpty(process.env.APP_GITHUB_REPOSITORY);
  const packageRepository =
    typeof packageJson.repository === "string"
      ? packageJson.repository
      : packageJson.repository?.url;
  const raw = configured ?? packageRepository ?? null;
  const match = raw?.match(/github\.com[/:]([^/]+\/[^/#]+?)(?:\.git)?$/i);
  return match?.[1] ?? null;
}

async function githubRequest(path: string): Promise<unknown | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "devpulse-versionamento",
  };
  const token = firstNonEmpty(process.env.GITHUB_TOKEN);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

function formatGithubCommit(commit: unknown): string | null {
  if (!commit || typeof commit !== "object") {
    return null;
  }
  const row = commit as {
    sha?: string;
    commit?: {
      message?: string;
    };
  };
  const sha = typeof row.sha === "string" ? row.sha : "";
  const message = typeof row.commit?.message === "string"
    ? row.commit.message.trim()
    : "";
  return sha && message ? `${sha.slice(0, 7)} — ${message}` : null;
}

async function githubCommitDescriptions(input: {
  repository: string | null;
  previousSha: string | null;
  commitSha: string;
}): Promise<string | null> {
  if (!input.repository) {
    return null;
  }
  const data =
    input.previousSha && input.previousSha !== input.commitSha
      ? await githubRequest(
          `/repos/${input.repository}/compare/${input.previousSha}...${input.commitSha}`,
        )
      : await githubRequest(`/repos/${input.repository}/commits/${input.commitSha}`);
  if (!data) {
    return null;
  }
  const commits =
    data && typeof data === "object" && Array.isArray((data as { commits?: unknown[] }).commits)
      ? (data as { commits: unknown[] }).commits
      : [data];
  const formatted = commits.map(formatGithubCommit).filter(Boolean);
  return formatted.length > 0 ? formatted.join("\n\n") : null;
}

export async function getAppReleaseByCommitSha(
  commitSha: string,
): Promise<AppRelease | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("app_releases")
    .select(RELEASE_SELECT)
    .eq("commit_sha", commitSha)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao localizar release por commit: ${error.message}`);
  }

  return data ? mapRelease(data as Record<string, unknown>) : null;
}

export async function listAppReleases(): Promise<AppRelease[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("app_releases")
    .select(RELEASE_SELECT)
    .order("released_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao listar versões: ${error.message}`);
  }

  return (data ?? []).map((row) => mapRelease(row as Record<string, unknown>));
}

function sanitizeSearchTerm(value: string): string {
  return value
    .trim()
    .replace(/[%_,()"\\]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

// Supabase's filtered builder type is not exported in a reusable form.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyReleaseSearch(query: any, rawSearch: string): any {
  const search = sanitizeSearchTerm(rawSearch);
  if (!search) {
    return query;
  }
  const pattern = `%${search}%`;
  return query.or(
    `version.ilike."${pattern}",commit_sha.ilike."${pattern}",description.ilike."${pattern}",commit_descriptions.ilike."${pattern}"`,
  );
}

export async function listAppReleasesPaged(input: {
  q?: string | null;
  page: number;
  pageSize: number;
}): Promise<PaginatedList<AppRelease>> {
  const admin = createAdminClient();
  const pageSize = Math.max(1, input.pageSize);
  const requestedPage = Math.max(1, Math.floor(input.page));

  let countQuery = admin
    .from("app_releases")
    .select("id", { count: "exact", head: true });
  countQuery = applyReleaseSearch(countQuery, input.q ?? "");
  const { count, error: countError } = await countQuery;
  if (countError) {
    throw new Error(`Falha ao contar versões: ${countError.message}`);
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const page = Math.min(requestedPage, totalPages);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin
    .from("app_releases")
    .select(RELEASE_SELECT)
    .order("released_at", { ascending: false })
    .range(from, to);
  query = applyReleaseSearch(query, input.q ?? "");
  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao listar versões: ${error.message}`);
  }

  return toPaginatedList({
    items: (data ?? []).map((row) =>
      mapRelease(row as Record<string, unknown>),
    ),
    total,
    page,
    pageSize,
  });
}

export async function registerCurrentBuildRelease(input: {
  actorUserId: string;
}): Promise<{ status: "created" | "existing" | "skipped"; release: AppRelease | null }> {
  const build = getAppBuildInfo();
  const commitSha = build.commitSha;
  if (!commitSha) {
    return { status: "skipped", release: null };
  }

  const existing = await getAppReleaseByCommitSha(commitSha);
  if (existing) {
    return { status: "existing", release: existing };
  }

  const admin = createAdminClient();
  const { data: latestRows, error: latestError } = await admin
    .from("app_releases")
    .select("commit_sha")
    .not("commit_sha", "is", null)
    .order("released_at", { ascending: false })
    .limit(1);

  if (latestError) {
    throw new Error(`Falha ao carregar último release registrado: ${latestError.message}`);
  }

  const previousSha =
    typeof latestRows?.[0]?.commit_sha === "string"
      ? latestRows[0].commit_sha
      : null;
  const commitDescriptions =
    (await githubCommitDescriptions({
      repository: githubRepository(),
      previousSha,
      commitSha,
    })) ??
    `${commitSha.slice(0, 7)} — Build atual registrado manualmente em Versionamento`;
  const firstCommitLine =
    commitDescriptions.split("\n").find((line) => line.trim()) ??
    `Commit ${commitSha.slice(0, 7)}`;

  const { data, error } = await admin
    .from("app_releases")
    .insert({
      version: releaseVersion(build.version, commitSha),
      released_at: new Date().toISOString(),
      release_type: releaseTypeFromCommits(commitDescriptions),
      description: firstCommitLine,
      commit_descriptions: commitDescriptions,
      commit_sha: commitSha,
      source: "manual",
      created_by: input.actorUserId,
    })
    .select(RELEASE_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      const concurrent = await getAppReleaseByCommitSha(commitSha);
      if (concurrent) {
        return { status: "existing", release: concurrent };
      }
    }
    throw new Error(`Falha ao registrar release atual: ${error.message}`);
  }

  return {
    status: "created",
    release: mapRelease(data as Record<string, unknown>),
  };
}
