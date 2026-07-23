import { requireUser } from "@/lib/auth/session";
import { getDeveloperByProfileId } from "@/services/developers";
import { ensureProfile } from "@/services/profiles";
import type { Developer } from "@/types/developer";
import type { Profile } from "@/types/profile";
import type { User } from "@supabase/supabase-js";

export type AppContext = {
  user: User;
  profile: Profile;
  developer: Developer | null;
};

export async function getAppContext(): Promise<AppContext> {
  const user = await requireUser();
  const profile = await ensureProfile(user);
  const developer = await getDeveloperByProfileId(profile.id);

  return { user, profile, developer };
}
