import "server-only";

import { zipSync } from "fflate";
import {
  buildEmailAttachmentBackupStoragePath,
  EMAIL_ATTACHMENT_BACKUP_BUCKET,
  emailBackupAudienceFolder,
  type EmailBackupAudience,
  type EmailDispatchAttachmentBackup,
} from "@/lib/email/attachment-backup-path";
import type { OperationalEmailAttachment } from "@/lib/email/zeptomail-smtp";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { MonthlyClosingAttachmentType } from "@/types/monthly-closing";

function mapBackup(row: Record<string, unknown>): EmailDispatchAttachmentBackup {
  const developer = row.developers as
    | { full_name?: string | null }
    | null
    | undefined;
  return {
    id: String(row.id),
    email_dispatch_id: String(row.email_dispatch_id),
    monthly_closing_id: String(row.monthly_closing_id),
    developer_id: String(row.developer_id),
    send_type_code: row.send_type_code as EmailBackupAudience,
    attachment_type: row.attachment_type as MonthlyClosingAttachmentType,
    year_month: String(row.year_month),
    storage_path: String(row.storage_path),
    filename: String(row.filename),
    mime_type: String(row.mime_type ?? "application/pdf"),
    byte_size:
      row.byte_size == null || row.byte_size === ""
        ? null
        : Number(row.byte_size),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    developer_name: developer?.full_name ?? null,
  };
}

/**
 * Best-effort archive after a successful Financeiro/RH SMTP send.
 * Uses the same in-memory buffers + friendly filenames already sent.
 * Failures are logged and returned — they must not fail the email send.
 */
export async function archiveOperationalEmailAttachments(input: {
  emailDispatchId: string;
  monthlyClosingId: string;
  developerId: string;
  yearMonth: string;
  audience: EmailBackupAudience;
  files: Array<
    OperationalEmailAttachment & { attachmentType: MonthlyClosingAttachmentType }
  >;
}): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (input.files.length === 0) {
    return { ok: true, count: 0 };
  }

  const admin = createAdminClient();
  let saved = 0;

  try {
    for (const file of input.files) {
      const storagePath = buildEmailAttachmentBackupStoragePath({
        yearMonth: input.yearMonth,
        audience: input.audience,
        filename: file.filename,
      });

      const { error: uploadError } = await admin.storage
        .from(EMAIL_ATTACHMENT_BACKUP_BUCKET)
        .upload(storagePath, file.content, {
          contentType: file.contentType ?? "application/pdf",
          upsert: true,
        });
      if (uploadError) {
        throw new Error(
          `Upload backup ${file.filename}: ${uploadError.message}`,
        );
      }

      const { error: upsertError } = await admin
        .from("email_dispatch_attachment_backups")
        .upsert(
          {
            email_dispatch_id: input.emailDispatchId,
            monthly_closing_id: input.monthlyClosingId,
            developer_id: input.developerId,
            send_type_code: input.audience,
            attachment_type: file.attachmentType,
            year_month: input.yearMonth,
            storage_path: storagePath,
            filename: file.filename,
            mime_type: file.contentType ?? "application/pdf",
            byte_size: file.content.byteLength,
          },
          { onConflict: "email_dispatch_id,attachment_type" },
        );
      if (upsertError) {
        throw new Error(`Registrar backup: ${upsertError.message}`);
      }
      saved += 1;
    }
    return { ok: true, count: saved };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao arquivar anexos.";
    console.error("[email-attachment-backup]", message);
    return { ok: false, error: message };
  }
}

export async function listEmailAttachmentBackups(input?: {
  yearMonth?: string;
  audience?: EmailBackupAudience | "all";
  limit?: number;
}): Promise<EmailDispatchAttachmentBackup[]> {
  const supabase = await createClient();
  let query = supabase
    .from("email_dispatch_attachment_backups")
    .select("*, developers(full_name)")
    .order("year_month", { ascending: false })
    .order("send_type_code", { ascending: true })
    .order("filename", { ascending: true })
    .limit(input?.limit ?? 200);

  if (input?.yearMonth) {
    query = query.eq("year_month", input.yearMonth);
  }
  if (input?.audience && input.audience !== "all") {
    query = query.eq("send_type_code", input.audience);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao listar backups: ${error.message}`);
  }
  return (data ?? []).map((row) => mapBackup(row as Record<string, unknown>));
}

export async function listEmailAttachmentBackupMonths(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_dispatch_attachment_backups")
    .select("year_month")
    .order("year_month", { ascending: false });
  if (error) {
    throw new Error(`Falha ao listar competências de backup: ${error.message}`);
  }
  const months = new Set<string>();
  for (const row of data ?? []) {
    months.add(String(row.year_month));
  }
  return [...months];
}

export async function createEmailAttachmentBackupSignedUrl(
  backupId: string,
  expiresInSeconds = 60 * 10,
): Promise<{ url: string; filename: string }> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("email_dispatch_attachment_backups")
    .select("storage_path, filename")
    .eq("id", backupId)
    .maybeSingle();
  if (error || !row) {
    throw new Error(
      `Backup não encontrado: ${error?.message ?? "registro ausente"}`,
    );
  }

  const { data, error: signError } = await supabase.storage
    .from(EMAIL_ATTACHMENT_BACKUP_BUCKET)
    .createSignedUrl(String(row.storage_path), expiresInSeconds, {
      download: String(row.filename),
    });
  if (signError || !data?.signedUrl) {
    throw new Error(
      `Falha ao gerar link do backup: ${signError?.message ?? "URL indisponível"}`,
    );
  }
  return { url: data.signedUrl, filename: String(row.filename) };
}

export async function buildEmailAttachmentBackupZip(input: {
  yearMonth: string;
  audience: EmailBackupAudience;
}): Promise<{ filename: string; bytes: Uint8Array }> {
  const rows = await listEmailAttachmentBackups({
    yearMonth: input.yearMonth,
    audience: input.audience,
    limit: 500,
  });
  if (rows.length === 0) {
    throw new Error("Nenhum arquivo de backup nesta pasta.");
  }

  const admin = createAdminClient();
  const entries: Record<string, Uint8Array> = {};
  const folder = emailBackupAudienceFolder(input.audience);
  const usedNames = new Map<string, number>();

  for (const row of rows) {
    const { data, error } = await admin.storage
      .from(EMAIL_ATTACHMENT_BACKUP_BUCKET)
      .download(row.storage_path);
    if (error || !data) {
      throw new Error(
        `Falha ao baixar ${row.filename}: ${error?.message ?? "indisponível"}`,
      );
    }
    const buffer = new Uint8Array(await data.arrayBuffer());
    let zipName = `${input.yearMonth.slice(0, 4)}/${input.yearMonth}/${folder}/${row.filename}`;
    const count = usedNames.get(zipName) ?? 0;
    if (count > 0) {
      zipName = zipName.replace(/\.pdf$/i, ` (${count + 1}).pdf`);
    }
    usedNames.set(
      `${input.yearMonth.slice(0, 4)}/${input.yearMonth}/${folder}/${row.filename}`,
      count + 1,
    );
    entries[zipName] = buffer;
  }

  const zipped = zipSync(entries, { level: 6 });
  const filename = `DevPulse-backup-${input.yearMonth}-${folder}.zip`;
  return { filename, bytes: zipped };
}
