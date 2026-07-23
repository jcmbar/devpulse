import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Keep the N newest completed non-failed imports visible per team. */
export const ACTIVE_IMPORTS_PER_TEAM = 2;

/**
 * Soft-archive older completed imports for a team, keeping the newest N.
 * Does not delete rows (audit/traceability).
 */
export async function archiveOlderImportsForTeam(input: {
  teamId: string;
  keep?: number;
}): Promise<number> {
  const keep = input.keep ?? ACTIVE_IMPORTS_PER_TEAM;
  const supabase = await createClient();

  const { data: recent, error: listError } = await supabase
    .from("imports")
    .select("id")
    .eq("team_id", input.teamId)
    .eq("status", "completed")
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (listError) {
    throw new Error(`Failed to list imports for archive: ${listError.message}`);
  }

  const toArchive = (recent ?? []).slice(keep).map((row) => row.id);
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
