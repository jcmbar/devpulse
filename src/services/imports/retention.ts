import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Keep the N newest completed imports visible per team **and source**. */
export const ACTIVE_IMPORTS_PER_TEAM = 2;

/**
 * Soft-archive older completed imports for a team, keeping the newest N
 * **per `imports.source`** so Manual and Jira Compilado snapshots can coexist
 * for auto-resolution.
 */
export async function archiveOlderImportsForTeam(input: {
  teamId: string;
  keep?: number;
  /** When set, only consider this source (e.g. after a spreadsheet import). */
  source?: string;
}): Promise<number> {
  const keep = input.keep ?? ACTIVE_IMPORTS_PER_TEAM;
  const supabase = await createClient();

  let query = supabase
    .from("imports")
    .select("id, source, created_at")
    .eq("team_id", input.teamId)
    .eq("status", "completed")
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (input.source) {
    query = query.eq("source", input.source);
  }

  const { data: recent, error: listError } = await query;

  if (listError) {
    throw new Error(`Failed to list imports for archive: ${listError.message}`);
  }

  const bySource = new Map<string, string[]>();
  for (const row of recent ?? []) {
    const source = String(row.source ?? "");
    const list = bySource.get(source) ?? [];
    list.push(row.id);
    bySource.set(source, list);
  }

  const toArchive: string[] = [];
  for (const ids of bySource.values()) {
    toArchive.push(...ids.slice(keep));
  }

  if (toArchive.length === 0) {
    return 0;
  }

  const { error } = await supabase
    .from("imports")
    .update({ archived_at: new Date().toISOString() })
    .in("id", toArchive);

  if (error) {
    throw new Error(`Failed to archive imports: ${error.message}`);
  }

  return toArchive.length;
}
