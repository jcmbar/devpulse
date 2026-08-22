"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/permissions";
import { formatDateTimeBrazil } from "@/lib/datetime/format-brazil";
import { sanitizeSmtpErrorMessage } from "@/lib/email/zeptomail-smtp";
import { ZEPTOMAIL_SMTP_PASSWORD_HINT } from "@/lib/email/zeptomail-smtp-config";
import { enforceSensitiveRateLimit } from "@/lib/security/enforce-sensitive-rate-limit";
import {
  addEmailTypeRecipient,
  deleteEmailTypeRecipient,
  getEmailSendTypeByCode,
  listEmailDispatchesForClosings,
  sendOperationalClosingEmail,
  upsertEmailTemplate,
} from "@/services/operational-emails";
import {
  buildEmailAttachmentBackupZip,
  createEmailAttachmentBackupSignedUrl,
  listEmailAttachmentBackupMonths,
  listEmailAttachmentBackups,
} from "@/services/operational-emails/attachment-backups";
import type {
  EmailBackupAudience,
  EmailDispatchAttachmentBackupListItem,
} from "@/lib/email/attachment-backup-path";
import {
  isValidTestEmailAddress,
  sendOperationalTestEmail,
} from "@/services/operational-emails/send-test";
import { recordSensitiveAccessAudit } from "@/services/security/sensitive-access-audit";
import {
  getMonthlyClosingById,
  listMonthlyClosingAttachments,
  listMonthlyClosingEvents,
} from "@/services/monthly-closings";
import { isEmailSendTypeCode } from "@/types/operational-email";
import type { EmailDispatch } from "@/types/operational-email";
import type {
  MonthlyClosing,
  MonthlyClosingAttachment,
  MonthlyClosingEvent,
} from "@/types/monthly-closing";

export type OperationalEmailActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type SendOperationalEmailTestActionResult =
  | {
      ok: true;
      to: string;
      sentAt: string;
      sentAtLabel: string;
    }
  | { ok: false; error: string };

function revalidateEmailPaths(closingId?: string) {
  revalidatePath("/app/gestor/config/emails");
  revalidatePath("/app/gestor/fechamentos");
  revalidatePath("/app/gestor");
  if (closingId) {
    revalidatePath(`/app/gestor/fechamentos/${closingId}`);
  }
  revalidatePath("/app");
}

export async function upsertEmailTemplateAction(
  formData: FormData,
): Promise<OperationalEmailActionResult> {
  try {
    await requirePermission("emails", "edit");
    const id = String(formData.get("id") ?? "").trim() || undefined;
    const sendTypeId = String(formData.get("sendTypeId") ?? "").trim();
    if (!sendTypeId) {
      return { ok: false, error: "Tipo de envio inválido." };
    }

    await upsertEmailTemplate({
      id,
      sendTypeId,
      internalName: String(formData.get("internalName") ?? ""),
      fromName: String(formData.get("fromName") ?? ""),
      fromEmail: String(formData.get("fromEmail") ?? ""),
      replyTo: String(formData.get("replyTo") ?? "") || null,
      defaultTo: String(formData.get("defaultTo") ?? "") || null,
      defaultCc: String(formData.get("defaultCc") ?? "") || null,
      subjectTemplate: String(formData.get("subjectTemplate") ?? ""),
      bodyHtml: String(formData.get("bodyHtml") ?? ""),
      signatureHtml: String(formData.get("signatureHtml") ?? "") || null,
      logoUrl: String(formData.get("logoUrl") ?? "") || null,
      bannerUrl: String(formData.get("bannerUrl") ?? "") || null,
      isActive: String(formData.get("isActive") ?? "") === "true",
    });

    revalidateEmailPaths();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o template.",
    };
  }
}

export async function addEmailTypeRecipientAction(
  formData: FormData,
): Promise<OperationalEmailActionResult> {
  try {
    await requirePermission("emails", "edit");
    const sendTypeId = String(formData.get("sendTypeId") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const roleRaw = String(formData.get("role") ?? "to").trim();
    const role = roleRaw === "cc" ? "cc" : "to";
    if (!sendTypeId || !email) {
      return { ok: false, error: "Destinatário inválido." };
    }
    await addEmailTypeRecipient({
      sendTypeId,
      email,
      displayName: String(formData.get("displayName") ?? "") || null,
      role,
    });
    revalidateEmailPaths();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível adicionar o destinatário.",
    };
  }
}

export async function deleteEmailTypeRecipientAction(
  id: string,
): Promise<OperationalEmailActionResult> {
  try {
    await requirePermission("emails", "edit");
    if (!id.trim()) {
      return { ok: false, error: "Destinatário inválido." };
    }
    await deleteEmailTypeRecipient(id.trim());
    revalidateEmailPaths();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível remover o destinatário.",
    };
  }
}

export async function sendFinanceiroClosingEmailAction(input: {
  closingId: string;
}): Promise<OperationalEmailActionResult> {
  const closingId = input.closingId.trim();
  let actorUserId: string | null = null;
  try {
    const { profile } = await requirePermission("emails", "edit");
    actorUserId = profile.id;
    if (!closingId) {
      return { ok: false, error: "Fechamento inválido." };
    }

    const rate = await enforceSensitiveRateLimit({
      action: "email_send",
      userId: profile.id,
      audit: {
        action: "email_send",
        resourceType: "monthly_closing",
        resourceId: closingId,
        origin: "sendFinanceiroClosingEmailAction",
        metadata: { send_type_code: "financeiro" },
      },
    });
    if (!rate.allowed) {
      return { ok: false, error: rate.message };
    }

    await sendOperationalClosingEmail({
      closingId,
      typeCode: "financeiro",
      actorUserId: profile.id,
      triggeredBy: "manual",
    });

    await recordSensitiveAccessAudit({
      actorUserId: profile.id,
      action: "email_send",
      resourceType: "monthly_closing",
      resourceId: closingId,
      result: "success",
      origin: "sendFinanceiroClosingEmailAction",
      metadata: { send_type_code: "financeiro" },
    });

    revalidateEmailPaths(closingId);
    return { ok: true };
  } catch (error) {
    if (closingId) {
      revalidateEmailPaths(closingId);
    }
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível enviar o e-mail ao Financeiro.";
    await recordSensitiveAccessAudit({
      actorUserId,
      action: "email_send",
      resourceType: "monthly_closing",
      resourceId: closingId || null,
      result: /permissão/i.test(message) ? "denied" : "error",
      errorCode: "email_send_failed",
      origin: "sendFinanceiroClosingEmailAction",
      metadata: { send_type_code: "financeiro" },
    });
    return { ok: false, error: message };
  }
}

export async function sendOperationalEmailByTypeAction(input: {
  closingId: string;
  typeCode: string;
}): Promise<OperationalEmailActionResult> {
  const closingId = input.closingId.trim();
  let actorUserId: string | null = null;
  try {
    const { profile } = await requirePermission("emails", "edit");
    actorUserId = profile.id;
    if (!isEmailSendTypeCode(input.typeCode)) {
      return { ok: false, error: "Tipo de envio inválido." };
    }

    const rate = await enforceSensitiveRateLimit({
      action: "email_send",
      userId: profile.id,
      audit: {
        action: "email_send",
        resourceType: "monthly_closing",
        resourceId: closingId,
        origin: "sendOperationalEmailByTypeAction",
        metadata: { send_type_code: input.typeCode },
      },
    });
    if (!rate.allowed) {
      return { ok: false, error: rate.message };
    }

    await sendOperationalClosingEmail({
      closingId,
      typeCode: input.typeCode,
      actorUserId: profile.id,
      triggeredBy: "manual",
    });

    await recordSensitiveAccessAudit({
      actorUserId: profile.id,
      action: "email_send",
      resourceType: "monthly_closing",
      resourceId: closingId,
      result: "success",
      origin: "sendOperationalEmailByTypeAction",
      metadata: { send_type_code: input.typeCode },
    });

    revalidateEmailPaths(closingId);
    return { ok: true };
  } catch (error) {
    if (closingId) {
      revalidateEmailPaths(closingId);
    }
    const message =
      error instanceof Error ? error.message : "Não foi possível enviar.";
    await recordSensitiveAccessAudit({
      actorUserId,
      action: "email_send",
      resourceType: "monthly_closing",
      resourceId: closingId || null,
      result: /permissão/i.test(message) ? "denied" : "error",
      errorCode: "email_send_failed",
      origin: "sendOperationalEmailByTypeAction",
      metadata: { send_type_code: input.typeCode },
    });
    return { ok: false, error: message };
  }
}

export type ClosingOpsDetailResult =
  | {
      ok: true;
      closing: MonthlyClosing;
      attachments: MonthlyClosingAttachment[];
      events: MonthlyClosingEvent[];
      dispatches: EmailDispatch[];
    }
  | { ok: false; error: string };

export async function loadClosingOpsDetailAction(input: {
  closingId: string;
}): Promise<ClosingOpsDetailResult> {
  try {
    await requirePermission("emails", "edit");
    const closingId = input.closingId.trim();
    if (!closingId) {
      return { ok: false, error: "Fechamento inválido." };
    }
    const closing = await getMonthlyClosingById(closingId);
    if (!closing) {
      return { ok: false, error: "Fechamento não encontrado." };
    }
    const [attachments, events, dispatches] = await Promise.all([
      listMonthlyClosingAttachments(closingId),
      listMonthlyClosingEvents(closingId),
      listEmailDispatchesForClosings([closingId]),
    ]);
    return { ok: true, closing, attachments, events, dispatches };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os detalhes.",
    };
  }
}

/** Prefetch send type ids once for the ops board (optional helper). */
export async function listOperationalSendTypeIdsAction(): Promise<
  | {
      ok: true;
      financeiroId: string | null;
      rhId: string | null;
      colaboradorId: string | null;
    }
  | { ok: false; error: string }
> {
  try {
    await requirePermission("emails", "edit");
    const [financeiro, rh, colaborador] = await Promise.all([
      getEmailSendTypeByCode("financeiro"),
      getEmailSendTypeByCode("rh"),
      getEmailSendTypeByCode("colaborador"),
    ]);
    return {
      ok: true,
      financeiroId: financeiro?.id ?? null,
      rhId: rh?.id ?? null,
      colaboradorId: colaborador?.id ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Falha ao carregar tipos.",
    };
  }
}

/**
 * One-off SMTP connectivity test for admins.
 * Uses the same ZeptoMail transport as operational emails (single recipient only).
 */
export async function sendOperationalEmailTestAction(
  formData: FormData,
): Promise<SendOperationalEmailTestActionResult> {
  let actorUserId: string | null = null;
  try {
    const context = await requirePermission("emails", "edit");
    actorUserId = context.profile.id;
    if (context.profile.role !== "admin") {
      await recordSensitiveAccessAudit({
        actorUserId,
        action: "authorization_failure",
        resourceType: "email_dispatch",
        result: "denied",
        errorCode: "admin_only",
        origin: "sendOperationalEmailTestAction",
      });
      return {
        ok: false,
        error: "Apenas administradores podem enviar e-mail de teste.",
      };
    }

    const to = String(formData.get("to") ?? "").trim().toLowerCase();
    if (!isValidTestEmailAddress(to)) {
      return {
        ok: false,
        error: "Informe um e-mail de destinatário válido.",
      };
    }

    const rate = await enforceSensitiveRateLimit({
      action: "email_test",
      userId: context.user.id,
      useIpDimension: true,
      audit: {
        action: "email_test",
        resourceType: "email_dispatch",
        origin: "sendOperationalEmailTestAction",
      },
    });
    if (!rate.allowed) {
      return { ok: false, error: rate.message };
    }

    const result = await sendOperationalTestEmail({ to });

    await recordSensitiveAccessAudit({
      actorUserId,
      action: "email_test",
      resourceType: "email_dispatch",
      result: "success",
      origin: "sendOperationalEmailTestAction",
      metadata: { triggered_by: "smtp_test" },
    });

    return {
      ok: true,
      to: result.to,
      sentAt: result.sentAt,
      sentAtLabel: formatDateTimeBrazil(result.sentAt),
    };
  } catch (error) {
    const raw =
      error instanceof Error ? error.message : "Falha ao enviar e-mail de teste.";
    const sanitized = sanitizeSmtpErrorMessage(raw);
    await recordSensitiveAccessAudit({
      actorUserId,
      action: "email_test",
      resourceType: "email_dispatch",
      result: "error",
      errorCode: "email_test_failed",
      origin: "sendOperationalEmailTestAction",
    });
    if (/ZEPTOMAIL_SMTP_PASSWORD|Senha SMTP|password/i.test(raw)) {
      return { ok: false, error: ZEPTOMAIL_SMTP_PASSWORD_HINT };
    }
    return { ok: false, error: sanitized };
  }
}

export async function listEmailAttachmentBackupsAction(input?: {
  yearMonth?: string;
  audience?: EmailBackupAudience | "all";
}): Promise<
  | {
      ok: true;
      rows: EmailDispatchAttachmentBackupListItem[];
      months: string[];
    }
  | { ok: false; error: string }
> {
  try {
    await requirePermission("emails", "edit");
    const [rows, months] = await Promise.all([
      listEmailAttachmentBackups({
        yearMonth: input?.yearMonth,
        audience: input?.audience ?? "all",
        limit: 300,
      }),
      listEmailAttachmentBackupMonths(),
    ]);
    return { ok: true, rows, months };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Falha ao listar backups de anexos.",
    };
  }
}

export async function downloadEmailAttachmentBackupAction(input: {
  backupId: string;
}): Promise<
  { ok: true; url: string; filename: string } | { ok: false; error: string }
> {
  let actorUserId: string | null = null;
  try {
    const { profile } = await requirePermission("emails", "edit");
    actorUserId = profile.id;

    const rate = await enforceSensitiveRateLimit({
      action: "signed_url",
      userId: profile.id,
      useIpDimension: true,
      audit: {
        action: "email_backup_signed_url",
        resourceType: "email_attachment_backup",
        resourceId: input.backupId,
        origin: "downloadEmailAttachmentBackupAction",
      },
    });
    if (!rate.allowed) {
      return { ok: false, error: rate.message };
    }

    const result = await createEmailAttachmentBackupSignedUrl({
      backupId: input.backupId.trim(),
      actorRole: profile.role,
    });

    await recordSensitiveAccessAudit({
      actorUserId: profile.id,
      action: "email_backup_signed_url",
      resourceType: "email_attachment_backup",
      resourceId: input.backupId.trim(),
      result: "success",
      origin: "downloadEmailAttachmentBackupAction",
    });

    return { ok: true, url: result.url, filename: result.filename };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao gerar download do backup.";
    const denied = /permissão|não encontrado|Backup inválido/i.test(message);
    await recordSensitiveAccessAudit({
      actorUserId,
      action: denied ? "authorization_failure" : "email_backup_signed_url",
      resourceType: "email_attachment_backup",
      resourceId: input.backupId,
      result: denied ? "denied" : "error",
      errorCode: denied ? "forbidden" : "backup_signed_url_failed",
      origin: "downloadEmailAttachmentBackupAction",
    });
    return { ok: false, error: message };
  }
}

export async function downloadEmailAttachmentBackupZipAction(input: {
  yearMonth: string;
  audience: EmailBackupAudience;
}): Promise<
  | { ok: true; filename: string; base64: string }
  | { ok: false; error: string }
> {
  let actorUserId: string | null = null;
  try {
    const { profile } = await requirePermission("emails", "edit");
    actorUserId = profile.id;
    const yearMonth = input.yearMonth.trim();
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return { ok: false, error: "Competência inválida." };
    }
    if (input.audience !== "financeiro" && input.audience !== "rh") {
      return { ok: false, error: "Destinatário de backup inválido." };
    }

    const rate = await enforceSensitiveRateLimit({
      action: "backup_zip",
      userId: profile.id,
      audit: {
        action: "email_backup_zip",
        resourceType: "email_attachment_backup_zip",
        resourceId: `${yearMonth}:${input.audience}`,
        yearMonth,
        origin: "downloadEmailAttachmentBackupZipAction",
        metadata: { send_type_code: input.audience },
      },
    });
    if (!rate.allowed) {
      return { ok: false, error: rate.message };
    }

    const zip = await buildEmailAttachmentBackupZip({
      yearMonth,
      audience: input.audience,
      actorRole: profile.role,
    });

    await recordSensitiveAccessAudit({
      actorUserId: profile.id,
      action: "email_backup_zip",
      resourceType: "email_attachment_backup_zip",
      resourceId: `${yearMonth}:${input.audience}`,
      yearMonth,
      result: "success",
      origin: "downloadEmailAttachmentBackupZipAction",
      metadata: { send_type_code: input.audience },
    });

    return {
      ok: true,
      filename: zip.filename,
      base64: Buffer.from(zip.bytes).toString("base64"),
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao gerar ZIP de backup.";
    const denied = /permissão/i.test(message);
    await recordSensitiveAccessAudit({
      actorUserId,
      action: denied ? "authorization_failure" : "email_backup_zip",
      resourceType: "email_attachment_backup_zip",
      resourceId: `${input.yearMonth}:${input.audience}`,
      yearMonth: input.yearMonth,
      result: denied ? "denied" : "error",
      errorCode: denied ? "forbidden" : "backup_zip_failed",
      origin: "downloadEmailAttachmentBackupZipAction",
      metadata: { send_type_code: input.audience },
    });
    return { ok: false, error: message };
  }
}
