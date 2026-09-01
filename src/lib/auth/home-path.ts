import {
  hasPermission,
  type ModuleGrantsMap,
} from "@/lib/auth/capabilities";
import { APP_MODULE_KEYS } from "@/lib/auth/modules";

export type AppHomePath = "/app" | "/app/analistas";

/**
 * Users with access only to the analyst module should land on /app/analistas
 * instead of the developer home (/app).
 */
export function usesAnalystHome(grants: ModuleGrantsMap): boolean {
  if (!hasPermission(grants, "analistas", "access")) {
    return false;
  }

  return !APP_MODULE_KEYS.some(
    (key) => key !== "analistas" && hasPermission(grants, key, "access"),
  );
}

export function resolveAppHomePath(grants: ModuleGrantsMap): AppHomePath {
  return usesAnalystHome(grants) ? "/app/analistas" : "/app";
}
