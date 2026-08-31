import { requireUser } from "@/lib/auth/session";
import {
  emptyModuleGrants,
  presetGrantsForRole,
  type ModuleGrantsMap,
} from "@/lib/auth/capabilities";
import { canManageTeam } from "@/lib/auth/roles";
import { getDeveloperByProfileId } from "@/services/developers";
import { listModuleGrantsForProfile } from "@/services/profiles/module-grants";
import { ensureProfile } from "@/services/profiles";
import type { Developer } from "@/types/developer";
import type { Profile } from "@/types/profile";
import type { User } from "@supabase/supabase-js";
import { cache } from "react";

export type AppContext = {
  user: User;
  profile: Profile;
  developer: Developer | null;
  grants: ModuleGrantsMap;
};

/**
 * Deduped per request so layout + page (requirePermission / getAppContext)
 * share one auth/profile/developer/grants round-trip.
 */
export const getAppContext = cache(async (): Promise<AppContext> => {
  const user = await requireUser();
  const profile = await ensureProfile(user);
  const [developer, grantsLoaded] = await Promise.all([
    getDeveloperByProfileId(profile.id),
    listModuleGrantsForProfile(profile.id).catch(() => null),
  ]);

  let grants = grantsLoaded ?? emptyModuleGrants();
  // Fall back only when the grants table cannot be loaded. An empty matrix is
  // a valid, intentional state and must not silently restore every module.
  if (grantsLoaded == null && canManageTeam(profile.role)) {
    grants = presetGrantsForRole(profile.role);
  }

  return { user, profile, developer, grants };
});
