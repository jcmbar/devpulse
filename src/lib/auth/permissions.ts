import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/auth/app-context";
import type { AppContext } from "@/lib/auth/app-context";
import {
  canManageImports,
  canManageTeam,
} from "@/lib/auth/roles";

export { canManageImports, canManageTeam };

export async function requireTeamAccess(): Promise<AppContext> {
  const context = await getAppContext();

  if (!canManageTeam(context.profile.role)) {
    redirect("/app");
  }

  return context;
}

/** @deprecated Prefer requireTeamAccess */
export async function requireImportAccess(): Promise<AppContext> {
  return requireTeamAccess();
}
