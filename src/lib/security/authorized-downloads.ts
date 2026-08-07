import "server-only";

import { canManageTeam } from "@/lib/auth/roles";
import type { UserRole } from "@/types/profile";

/**
 * Short-lived signed URLs for sensitive PDFs.
 * Bearer until expiry — keep TTL tight; re-issue via authorized server actions.
 */
export const SENSITIVE_SIGNED_URL_TTL_SECONDS = 60 * 2;

/**
 * Closing attachment: owner developer or admin/gestor only.
 * Re-validate on the server — never trust client-provided storage keys alone.
 */
export function assertCanAccessMonthlyClosingAttachment(input: {
  role: UserRole;
  actorDeveloperId: string | null;
  closingDeveloperId: string;
}): void {
  if (canManageTeam(input.role)) {
    return;
  }
  if (
    input.actorDeveloperId &&
    input.actorDeveloperId === input.closingDeveloperId
  ) {
    return;
  }
  throw new Error("Sem permissão para acessar este anexo.");
}

/**
 * Email attachment backups (Financeiro/RH archives): admin/gestor only.
 */
export function assertCanAccessEmailAttachmentBackup(role: UserRole): void {
  if (!canManageTeam(role)) {
    throw new Error("Sem permissão para acessar backups de e-mail.");
  }
}
