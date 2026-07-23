import type { UserRole } from "@/types/profile";

const TEAM_ROLES: UserRole[] = ["admin", "gestor"];

export function canManageTeam(role: UserRole): boolean {
  return TEAM_ROLES.includes(role);
}

/** @deprecated Prefer canManageTeam */
export function canManageImports(role: UserRole): boolean {
  return canManageTeam(role);
}
