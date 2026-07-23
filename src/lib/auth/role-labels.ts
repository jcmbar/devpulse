import type { UserRole } from "@/types/profile";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  dev: "Desenvolvedor",
};

export function getRoleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}
