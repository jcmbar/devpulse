import type { ModuleGrantsMap } from "@/lib/auth/capabilities";

export type AppHomePath = "/app" | "/app/analistas";

/**
 * The developer home remains the canonical entry point. The analyst workspace
 * is an additional module and must not hide existing developer flows such as
 * closures and self-service views.
 */
export function resolveAppHomePath(grants: ModuleGrantsMap): AppHomePath {
  void grants;
  return "/app";
}
