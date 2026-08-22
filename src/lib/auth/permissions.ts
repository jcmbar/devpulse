import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/auth/app-context";
import type { AppContext } from "@/lib/auth/app-context";
import {
  hasAnyTeamModuleAccess,
  hasPermission,
} from "@/lib/auth/capabilities";
import type { AppModuleKey, PermissionAction } from "@/lib/auth/modules";
import {
  canManageImports,
  canManageTeam,
} from "@/lib/auth/roles";

export { canManageImports, canManageTeam };

export type AppContextWithGrants = AppContext & {
  grants: Awaited<ReturnType<typeof getAppContext>>["grants"];
};

export async function requirePermission(
  module: AppModuleKey,
  action: PermissionAction = "access",
): Promise<AppContextWithGrants> {
  const context = await getAppContext();
  if (!hasPermission(context.grants, module, action)) {
    redirect("/app");
  }
  return context;
}

/**
 * @deprecated Prefer requirePermission(module, action).
 * Allows entry when the user has access to any team module (or legacy role).
 */
export async function requireTeamAccess(): Promise<AppContextWithGrants> {
  const context = await getAppContext();
  if (
    !hasAnyTeamModuleAccess(context.grants) &&
    !canManageTeam(context.profile.role)
  ) {
    redirect("/app");
  }
  return context;
}

/** @deprecated Prefer requirePermission */
export async function requireImportAccess(): Promise<AppContextWithGrants> {
  return requirePermission("imports", "access");
}
