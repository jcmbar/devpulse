"use server";

import { revalidatePath } from "next/cache";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { formatDateTimeBrazil } from "@/lib/datetime/format-brazil";
import {
  checkSmtpTestRateLimit,
  markSmtpTestSent,
} from "@/lib/email/smtp-test-rate-limit";
import { sanitizeSmtpErrorMessage } from "@/lib/email/zeptomail-smtp";
import { ZEPTOMAIL_SMTP_PASSWORD_HINT } from "@/lib/email/zeptomail-smtp-config";
import {
  addEmailTypeRecipient,
  deleteEmailTypeRecipient,
  getEmailSendTypeByCode,
  listEmailDispatchesForClosings,
  sendOperationalClosingEmail,
  upsertEmailTemplate,
} from "@/services/operational-emails";
import {
  isValidTestEmailAddress,
  sendOperationalTestEmail,
} from "@/services/operational-emails/send-test";
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
    await requireTeamAccess();
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
    await requireTeamAccess();
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
    await requireTeamAccess();
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
  try {
    const { profile } = await requireTeamAccess();
    if (!closingId) {
      return { ok: false, error: "Fechamento inválido." };
    }

    await sendOperationalClosingEmail({
      closingId,
      typeCode: "financeiro",
      actorUserId: profile.id,
      triggeredBy: "manual",
    });

    revalidateEmailPaths(closingId);
    return { ok: true };
  } catch (error) {
    if (closingId) {
      revalidateEmailPaths(closingId);
    }
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível enviar o e-mail ao Financeiro.",
    };
  }
}

export async function sendOperationalEmailByTypeAction(input: {
  closingId: string;
  typeCode: string;
}): Promise<OperationalEmailActionResult> {
  const closingId = input.closingId.trim();
  try {
    const { profile } = await requireTeamAccess();
    if (!isEmailSendTypeCode(input.typeCode)) {
      return { ok: false, error: "Tipo de envio inválido." };
    }
    await sendOperationalClosingEmail({
      closingId,
      typeCode: input.typeCode,
      actorUserId: profile.id,
      triggeredBy: "manual",
    });
    revalidateEmailPaths(closingId);
    return { ok: true };
  } catch (error) {
    if (closingId) {
      revalidateEmailPaths(closingId);
    }
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Não foi possível enviar.",
    };
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
    await requireTeamAccess();
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
    await requireTeamAccess();
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
  try {
    const context = await requireTeamAccess();
    if (context.profile.role !== "admin") {
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

    const rate = checkSmtpTestRateLimit(context.user.id);
    if (!rate.allowed) {
      return {
        ok: false,
        error: `Aguarde ${rate.retryAfterSeconds}s antes de enviar outro teste.`,
      };
    }

    const result = await sendOperationalTestEmail({ to });
    markSmtpTestSent(context.user.id);

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
    if (/ZEPTOMAIL_SMTP_PASSWORD|Senha SMTP|password/i.test(raw)) {
      return { ok: false, error: ZEPTOMAIL_SMTP_PASSWORD_HINT };
    }
    return { ok: false, error: sanitized };
  }
}
