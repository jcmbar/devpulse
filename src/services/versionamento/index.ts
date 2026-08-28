import "server-only";

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
