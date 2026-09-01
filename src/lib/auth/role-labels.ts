import type { DeveloperJobTitle } from "@/types/developer-compensation";
import { getJobTitleLabel } from "@/types/developer-compensation";
import type { UserRole } from "@/types/profile";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  dev: "Desenvolvedor",
};

export function getRoleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}

/**
 * User-facing label for headers and profile screens.
 * When the RLS role is `dev`, prefer the professional job title (Analista, etc.).
 */
export function getProfileDisplayLabel(input: {
  role: UserRole;
  jobTitle?: DeveloperJobTitle | null;
}): string {
  if (input.role === "dev" && input.jobTitle) {
    return getJobTitleLabel(input.jobTitle);
  }
  return getRoleLabel(input.role);
}
