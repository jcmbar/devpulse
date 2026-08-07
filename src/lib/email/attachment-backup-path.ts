import type { MonthlyClosingAttachmentType } from "@/types/monthly-closing";
import type { EmailSendTypeCode } from "@/types/operational-email";

export const EMAIL_ATTACHMENT_BACKUP_BUCKET = "email-attachment-backups";

export type EmailBackupAudience = Extract<EmailSendTypeCode, "financeiro" | "rh">;

export function emailBackupAudienceFolder(
  audience: EmailBackupAudience,
): "Financeiro" | "RH" {
  return audience === "financeiro" ? "Financeiro" : "RH";
}

/**
 * Cloud archive path (not a Mac folder):
 *   YYYY/YYYY-MM/Financeiro|RH/<friendly-filename>.pdf
 *
 * Access decision (documented, do not change without product alignment):
 * Any admin/gestor may list and download all Financeiro/RH backups for the
 * tenant. Backups are operational archives, not scoped per team in v1.
 */
export function buildEmailAttachmentBackupStoragePath(input: {
  yearMonth: string;
  audience: EmailBackupAudience;
  filename: string;
}): string {
  const yearMonth = input.yearMonth.trim();
  const year = yearMonth.slice(0, 4) || "0000";
  const folder = emailBackupAudienceFolder(input.audience);
  const leaf = input.filename.trim().replace(/^\/+/, "");
  return `${year}/${yearMonth}/${folder}/${leaf}`;
}

export type EmailDispatchAttachmentBackup = {
  id: string;
  email_dispatch_id: string;
  monthly_closing_id: string;
  developer_id: string;
  send_type_code: EmailBackupAudience;
  attachment_type: MonthlyClosingAttachmentType;
  year_month: string;
  /** Server-only path. Never send to the browser. */
  storage_path: string;
  filename: string;
  mime_type: string;
  byte_size: number | null;
  created_at: string;
  updated_at: string;
  developer_name?: string | null;
};

/** Client-safe backup row (no storage path). */
export type EmailDispatchAttachmentBackupListItem = Omit<
  EmailDispatchAttachmentBackup,
  "storage_path"
>;

export function toEmailAttachmentBackupListItem(
  row: EmailDispatchAttachmentBackup,
): EmailDispatchAttachmentBackupListItem {
  const { storage_path: _storagePath, ...rest } = row;
  return rest;
}
