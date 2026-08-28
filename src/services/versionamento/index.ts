import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const RELEASE_TYPES = ["major", "minor", "patch", "hotfix"] as const;
export type ReleaseType = (typeof RELEASE_TYPES)[number];

export type AppRelease = {
  id: string;
  version: string;
  released_at: string;
  release_type: ReleaseType;
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

export async function createAppRelease(input: {
  version: string;
  releasedAt: string;
  releaseType: ReleaseType;
  description: string;
  commitDescriptions: string;
  createdBy: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("app_releases").insert({
    version: input.version,
    released_at: input.releasedAt,
    release_type: input.releaseType,
    description: input.description,
    commit_descriptions: input.commitDescriptions,
    created_by: input.createdBy,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("Esta versão já está cadastrada.");
    }
    throw new Error(`Falha ao cadastrar versão: ${error.message}`);
  }
}

export async function deleteAppRelease(releaseId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("app_releases")
    .delete()
    .eq("id", releaseId);

  if (error) {
    throw new Error(`Falha ao excluir versão: ${error.message}`);
  }
}
