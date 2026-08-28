import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

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
