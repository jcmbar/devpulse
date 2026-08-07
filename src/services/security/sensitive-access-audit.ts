import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type SensitiveAuditResult =
  | "success"
  | "denied"
  | "error"
  | "rate_limited";

export type SensitiveAuditAction =
  | "closing_attachment_signed_url"
  | "closing_attachment_upload"
  | "email_backup_signed_url"
  | "email_backup_zip"
  | "email_send"
  | "email_test"
  | "profile_role_change"
  | "authorization_failure";

export type SensitiveAuditResourceType =
  | "monthly_closing_attachment"
  | "monthly_closing"
  | "email_attachment_backup"
  | "email_attachment_backup_zip"
  | "email_dispatch"
  | "profile"
  | "unknown";

export type SensitiveAccessAuditEvent = {
  actorUserId: string | null;
  action: SensitiveAuditAction | (string & {});
  resourceType: SensitiveAuditResourceType | (string & {});
  resourceId?: string | null;
  yearMonth?: string | null;
  result: SensitiveAuditResult;
  errorCode?: string | null;
  origin?: string | null;
  /** Safe key/values only — stripped of secrets automatically. */
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

const FORBIDDEN_METADATA_KEYS = new Set([
  "storage_path",
  "storagepath",
  "file_storage_key",
  "filestoragekey",
  "signed_url",
  "signedurl",
  "url",
  "token",
  "password",
  "smtp",
  "service_role",
  "servicerole",
  "authorization",
  "cookie",
  "content",
  "html",
  "body",
  "pdf",
  "base64",
]);

function sanitizeErrorCode(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim().slice(0, 120);
  if (!trimmed) {
    return null;
  }
  // Avoid leaking connection strings / keys if someone passes a raw Error.message.
  if (
    /service_role|smtp|password|bearer\s|eyJ|supabase\.co\/storage/i.test(
      trimmed,
    )
  ) {
    return "error";
  }
  return trimmed;
}

function sanitizeMetadata(
  metadata: SensitiveAccessAuditEvent["metadata"],
): Record<string, string | number | boolean | null> {
  if (!metadata) {
    return {};
  }
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const normalized = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!normalized || FORBIDDEN_METADATA_KEYS.has(normalized)) {
      continue;
    }
    if (value === undefined) {
      continue;
    }
    if (typeof value === "string") {
      out[normalized] = value.slice(0, 200);
      continue;
    }
    out[normalized] = value;
  }
  return out;
}

/**
 * Best-effort audit insert. Never throws to callers — logging must not block the main flow.
 */
export async function recordSensitiveAccessAudit(
  event: SensitiveAccessAuditEvent,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("sensitive_access_audit_logs").insert({
      actor_user_id: event.actorUserId,
      action: event.action,
      resource_type: event.resourceType,
      resource_id: event.resourceId?.trim() || null,
      year_month: event.yearMonth?.trim() || null,
      result: event.result,
      error_code: sanitizeErrorCode(event.errorCode),
      origin: event.origin?.trim().slice(0, 120) || null,
      metadata: sanitizeMetadata(event.metadata),
    });
    if (error) {
      console.error("[sensitive-audit] insert failed:", error.message);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown audit failure";
    console.error("[sensitive-audit]", sanitizeErrorCode(message) ?? message);
  }
}
