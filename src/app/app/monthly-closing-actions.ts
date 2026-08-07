"use server";

import { revalidatePath } from "next/cache";
import { getAppContext } from "@/lib/auth/app-context";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { enforceSensitiveRateLimit } from "@/lib/security/enforce-sensitive-rate-limit";
import { getCurrentDeveloperCompensation } from "@/services/developers/compensation";
import { assertClosingValuesMatchFolha } from "@/services/closing-folha-compare";
import { getInvoiceIssuer } from "@/services/invoice-issuers";
import { listApplicableHolidayDatesForDeveloperMonth } from "@/services/holidays";
import { recordSensitiveAccessAudit } from "@/services/security/sensitive-access-audit";
import {
  approveMonthlyClosing,
  createMonthlyClosingAttachmentSignedUrl,
  finalizeMonthlyClosing,
  getMealPixClosingBlockReason,
  getMonthlyClosingForDeveloperMonth,
  listMonthlyClosingAttachments,
  listMonthlyClosingItems,
  loadMonthlyClosingAuditForDeveloper,
  rejectMonthlyClosing,
  restoreMonthlyClosingToInReview,
  revertMonthlyClosingStatus,
  reviewMealPixReceipt,
  startMonthlyClosing,
  submitMonthlyClosingForReview,
  uploadMonthlyClosingAttachment,
} from "@/services/monthly-closings";
import type { DeveloperCompensation } from "@/types/developer-compensation";
import type { InvoiceIssuer } from "@/types/invoice-issuer";
import type {
  MonthlyClosing,
  MonthlyClosingAttachment,
  MonthlyClosingAttachmentType,
  MonthlyClosingCardAuditRow,
} from "@/types/monthly-closing";

export type MonthlyClosingActionResult =
  | { ok: true; closingId: string }
  | { ok: false; error: string };

export async function startMonthlyClosingAction(input: {
  yearMonth: string;
  importId: string | null;
  sourceMode?: string | null;
}): Promise<MonthlyClosingActionResult> {
  try {
    const { profile, developer } = await getAppContext();
    if (!developer) {
      return { ok: false, error: "Developer não vinculado ao perfil." };
    }
    if (!input.yearMonth.trim()) {
      return {
        ok: false,
        error: "Selecione um mês/ano para iniciar o fechamento.",
      };
    }

    const closing = await startMonthlyClosing({
      developerId: developer.id,
      teamId: developer.team_id,
      yearMonth: input.yearMonth.trim(),
      importId: input.importId,
      sourceMode: input.sourceMode ?? "auto",
      actorUserId: profile.id,
    });

    revalidatePath("/app");
    revalidatePath("/app/gestor");
    return { ok: true, closingId: closing.id };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível iniciar o fechamento.",
    };
  }
}

export async function submitMonthlyClosingAction(input: {
  closingId: string;
  importId: string;
  sourceMode?: string | null;
  developerResubmissionNotes?: string | null;
  travelDays: string[];
  mealDays: string[];
  valuesNotes?: string | null;
  workedHours: number;
}): Promise<MonthlyClosingActionResult> {
  try {
    const { profile, developer } = await getAppContext();
    if (!developer) {
      return { ok: false, error: "Developer não vinculado ao perfil." };
    }
    if (!input.closingId.trim() || !input.importId.trim()) {
      return { ok: false, error: "Fechamento ou lote inválido." };
    }

    const compensation = await getCurrentDeveloperCompensation(developer.id);
    if (!compensation) {
      return {
        ok: false,
        error:
          "Cadastro de valores (compensação) não encontrado. Peça ao gestor para configurar em Developers.",
      };
    }

    const closing = await submitMonthlyClosingForReview({
      closingId: input.closingId,
      developerId: developer.id,
      importId: input.importId,
      sourceMode: input.sourceMode ?? "auto",
      actorUserId: profile.id,
      developerResubmissionNotes: input.developerResubmissionNotes,
      values: {
        travelDays: input.travelDays,
        mealDays: input.mealDays,
        valuesNotes: input.valuesNotes,
        workedHours: input.workedHours,
        compensation: {
          baseAmount: compensation.base_amount,
          baseType: compensation.base_type,
          hourlyRate: compensation.hourly_rate,
          dailyTravelAmount: compensation.daily_travel_amount,
          dailyMealAmount: compensation.daily_meal_amount,
        },
      },
    });

    revalidatePath("/app");
    revalidatePath("/app/gestor");
    revalidatePath(`/app/gestor/fechamentos/${closing.id}`);
    return { ok: true, closingId: closing.id };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível enviar o fechamento.",
    };
  }
}

export async function approveMonthlyClosingAction(input: {
  closingId: string;
  invoiceIssuerId: string;
  managerInvoiceNotes?: string | null;
}): Promise<MonthlyClosingActionResult> {
  try {
    const { profile } = await requireTeamAccess();
    await assertClosingValuesMatchFolha(input.closingId);
    const closing = await approveMonthlyClosing({
      closingId: input.closingId,
      invoiceIssuerId: input.invoiceIssuerId,
      managerInvoiceNotes: input.managerInvoiceNotes,
      actorUserId: profile.id,
    });
    revalidatePath("/app");
    revalidatePath("/app/gestor");
    revalidatePath(`/app/gestor/fechamentos/${closing.id}`);
    return { ok: true, closingId: closing.id };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível aprovar o fechamento.",
    };
  }
}

export async function rejectMonthlyClosingAction(input: {
  closingId: string;
  managerRejectionNotes: string;
}): Promise<MonthlyClosingActionResult> {
  try {
    const { profile } = await requireTeamAccess();
    const closing = await rejectMonthlyClosing({
      closingId: input.closingId,
      managerRejectionNotes: input.managerRejectionNotes,
      actorUserId: profile.id,
    });
    revalidatePath("/app");
    revalidatePath("/app/gestor");
    revalidatePath(`/app/gestor/fechamentos/${closing.id}`);
    return { ok: true, closingId: closing.id };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível reprovar o fechamento.",
    };
  }
}

export async function restoreMonthlyClosingToInReviewAction(input: {
  closingId: string;
}): Promise<MonthlyClosingActionResult> {
  try {
    const { profile } = await requireTeamAccess();
    if (!input.closingId.trim()) {
      return { ok: false, error: "Fechamento inválido." };
    }
    const closing = await restoreMonthlyClosingToInReview({
      closingId: input.closingId.trim(),
      actorUserId: profile.id,
    });
    revalidatePath("/app");
    revalidatePath("/app/gestor");
    revalidatePath("/app/gestor/fechamentos");
    revalidatePath(`/app/gestor/fechamentos/${closing.id}`);
    return { ok: true, closingId: closing.id };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível recolocar o fechamento em análise.",
    };
  }
}

export async function finalizeMonthlyClosingAction(input: {
  closingId: string;
}): Promise<MonthlyClosingActionResult> {
  try {
    const { profile } = await requireTeamAccess();
    await assertClosingValuesMatchFolha(input.closingId);
    const closing = await finalizeMonthlyClosing({
      closingId: input.closingId,
      actorUserId: profile.id,
    });
    revalidatePath("/app");
    revalidatePath("/app/gestor");
    revalidatePath(`/app/gestor/fechamentos/${closing.id}`);
    return { ok: true, closingId: closing.id };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível finalizar o fechamento.",
    };
  }
}

export async function revertMonthlyClosingStatusAction(input: {
  closingId: string;
}): Promise<MonthlyClosingActionResult> {
  try {
    const { profile } = await requireTeamAccess();
    if (!input.closingId.trim()) {
      return { ok: false, error: "Fechamento inválido." };
    }
    const closing = await revertMonthlyClosingStatus({
      closingId: input.closingId,
      actorUserId: profile.id,
    });
    revalidatePath("/app");
    revalidatePath("/app/gestor");
    revalidatePath("/app/gestor/fechamentos");
    revalidatePath(`/app/gestor/fechamentos/${closing.id}`);
    return { ok: true, closingId: closing.id };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível reabrir/voltar o status do fechamento.",
    };
  }
}

export async function uploadMonthlyClosingAttachmentAction(
  formData: FormData,
): Promise<MonthlyClosingActionResult> {
  try {
    const { profile, developer } = await getAppContext();
    if (!developer) {
      return { ok: false, error: "Developer não vinculado ao perfil." };
    }

    const closingId = String(formData.get("closingId") ?? "").trim();
    const typeRaw = String(formData.get("type") ?? "").trim();
    const type: MonthlyClosingAttachmentType | null =
      typeRaw === "invoice_pdf" ||
      typeRaw === "boleto_pdf" ||
      typeRaw === "meal_pix_receipt"
        ? typeRaw
        : null;
    const file = formData.get("file");

    if (!closingId || !type) {
      return { ok: false, error: "Anexo inválido." };
    }
    if (!(file instanceof File)) {
      return { ok: false, error: "Selecione um arquivo PDF." };
    }

    const rate = await enforceSensitiveRateLimit({
      action: "attachment_upload",
      userId: profile.id,
      audit: {
        action: "closing_attachment_upload",
        resourceType: "monthly_closing",
        resourceId: closingId,
        origin: "uploadMonthlyClosingAttachmentAction",
        metadata: { attachment_type: type },
      },
    });
    if (!rate.allowed) {
      return { ok: false, error: rate.message };
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const saved = await uploadMonthlyClosingAttachment({
      closingId,
      developerId: developer.id,
      type,
      file: {
        bytes,
        originalFilename: file.name || `${type}.pdf`,
        mimeType: file.type || "application/pdf",
      },
      actorUserId: profile.id,
    });

    await recordSensitiveAccessAudit({
      actorUserId: profile.id,
      action: "closing_attachment_upload",
      resourceType: "monthly_closing_attachment",
      resourceId: saved.id,
      result: "success",
      origin: "uploadMonthlyClosingAttachmentAction",
      metadata: {
        attachment_type: type,
        monthly_closing_id: closingId,
      },
    });

    revalidatePath("/app");
    revalidatePath("/app/gestor");
    revalidatePath(`/app/gestor/fechamentos/${closingId}`);
    return { ok: true, closingId };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível enviar o anexo.";
    const denied = /permissão|só pode anexar|próprio fechamento/i.test(message);
    try {
      const { profile } = await getAppContext();
      await recordSensitiveAccessAudit({
        actorUserId: profile.id,
        action: denied ? "authorization_failure" : "closing_attachment_upload",
        resourceType: "monthly_closing",
        resourceId: String(formData.get("closingId") ?? "").trim() || null,
        result: denied ? "denied" : "error",
        errorCode: denied ? "forbidden" : "upload_failed",
        origin: "uploadMonthlyClosingAttachmentAction",
      });
    } catch {
      // ignore audit secondary failure
    }
    return { ok: false, error: message };
  }
}

export async function getMonthlyClosingAttachmentUrlAction(input: {
  attachmentId: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  let actorUserId: string | null = null;
  try {
    const { profile, developer } = await getAppContext();
    actorUserId = profile.id;

    const rate = await enforceSensitiveRateLimit({
      action: "signed_url",
      userId: profile.id,
      useIpDimension: true,
      audit: {
        action: "closing_attachment_signed_url",
        resourceType: "monthly_closing_attachment",
        resourceId: input.attachmentId,
        origin: "getMonthlyClosingAttachmentUrlAction",
      },
    });
    if (!rate.allowed) {
      return { ok: false, error: rate.message };
    }

    const result = await createMonthlyClosingAttachmentSignedUrl({
      attachmentId: input.attachmentId,
      actor: {
        role: profile.role,
        developerId: developer?.id ?? null,
      },
    });

    await recordSensitiveAccessAudit({
      actorUserId: profile.id,
      action: "closing_attachment_signed_url",
      resourceType: "monthly_closing_attachment",
      resourceId: input.attachmentId,
      result: "success",
      origin: "getMonthlyClosingAttachmentUrlAction",
    });

    return { ok: true, url: result.url };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível abrir o anexo.";
    const denied = /permissão|não encontrado|Anexo inválido/i.test(message);
    await recordSensitiveAccessAudit({
      actorUserId,
      action: denied
        ? "authorization_failure"
        : "closing_attachment_signed_url",
      resourceType: "monthly_closing_attachment",
      resourceId: input.attachmentId,
      result: denied ? "denied" : "error",
      errorCode: denied ? "forbidden" : "signed_url_failed",
      origin: "getMonthlyClosingAttachmentUrlAction",
    });
    return { ok: false, error: message };
  }
}

export async function reviewMealPixReceiptAction(input: {
  closingId: string;
  accepted: boolean;
  reviewNotes?: string | null;
}): Promise<MonthlyClosingActionResult> {
  try {
    const { profile } = await requireTeamAccess();

    const closingId = input.closingId.trim();
    if (!closingId) {
      return { ok: false, error: "Fechamento inválido." };
    }

    await reviewMealPixReceipt({
      closingId,
      accepted: input.accepted,
      reviewNotes: input.reviewNotes,
      actorUserId: profile.id,
    });

    revalidatePath("/app");
    revalidatePath("/app/gestor");
    revalidatePath("/app/gestor/fechamentos");
    revalidatePath(`/app/gestor/fechamentos/${closingId}`);
    return { ok: true, closingId };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível revisar o comprovante PIX.",
    };
  }
}

export type DeveloperClosingMonthDetailPayload = {
  yearMonth: string;
  closing: MonthlyClosing | null;
  auditRows: MonthlyClosingCardAuditRow[];
  canSubmit: boolean;
  blockingCount: number;
  attachments: MonthlyClosingAttachment[];
  invoiceIssuer: InvoiceIssuer | null;
  holidays: Array<{ date: string; name: string }>;
  mealPixBlockReason: string | null;
  compensation: DeveloperCompensation | null;
};

export type LoadDeveloperClosingMonthDetailResult =
  | { ok: true; detail: DeveloperClosingMonthDetailPayload }
  | { ok: false; error: string };

/** Loads month detail for the developer drawer without a full page navigation. */
export async function loadDeveloperClosingMonthDetailAction(input: {
  yearMonth: string;
  importId: string | null;
}): Promise<LoadDeveloperClosingMonthDetailResult> {
  try {
    const { developer } = await getAppContext();
    if (!developer) {
      return { ok: false, error: "Developer não vinculado ao perfil." };
    }
    const yearMonth = input.yearMonth.trim();
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return { ok: false, error: "Mês inválido." };
    }

    const monthlyClosing = await getMonthlyClosingForDeveloperMonth({
      developerId: developer.id,
      yearMonth,
    });

    let auditRows: MonthlyClosingCardAuditRow[] = [];
    let canSubmit = false;
    let blockingCount = 0;
    let attachments: MonthlyClosingAttachment[] = [];

    if (
      input.importId != null &&
      monthlyClosing != null &&
      monthlyClosing.started_at != null
    ) {
      if (
        monthlyClosing.status === "in_review" ||
        monthlyClosing.status === "closed" ||
        monthlyClosing.status === "finalized"
      ) {
        const [items, listedAttachments] = await Promise.all([
          listMonthlyClosingItems(monthlyClosing.id),
          listMonthlyClosingAttachments(monthlyClosing.id),
        ]);
        attachments = listedAttachments;
        auditRows = items.map((item) => ({
          cardId: item.jira_card_id ?? item.id,
          jiraKey: item.jira_key,
          summary: item.summary,
          status: item.status_name,
          estimateHours: item.estimate_hours,
          actualHours: item.actual_hours,
          delayDays: item.delay_days,
          isDelayed: item.is_delayed,
          isRework: item.is_rework,
          reworkWeight: item.rework_weight,
          dueOn: item.due_on,
          unitTestDeliveryOn: item.unit_test_delivery_on,
          delayJustification: {
            status: item.delay_justification_status,
            developerNote: item.delay_developer_note,
            managerNote: item.delay_manager_note,
          },
          reworkJustification: {
            status: item.rework_justification_status,
            developerNote: item.rework_developer_note,
            managerNote: item.rework_manager_note,
          },
          blocksSubmit: false,
          blockReasons: [],
        }));
      } else {
        const audit = await loadMonthlyClosingAuditForDeveloper({
          developerId: developer.id,
          importId: input.importId,
          yearMonth,
        });
        auditRows = audit.auditRows;
        canSubmit = audit.canSubmit;
        blockingCount = audit.blockingCount;
      }
    } else if (
      input.importId != null &&
      (monthlyClosing == null || monthlyClosing.started_at == null)
    ) {
      const audit = await loadMonthlyClosingAuditForDeveloper({
        developerId: developer.id,
        importId: input.importId,
        yearMonth,
      });
      auditRows = audit.auditRows;
      canSubmit = audit.canSubmit;
      blockingCount = audit.blockingCount;
    }

    if (
      monthlyClosing != null &&
      attachments.length === 0 &&
      (monthlyClosing.status === "closed" ||
        monthlyClosing.status === "finalized" ||
        monthlyClosing.status === "in_review")
    ) {
      attachments = await listMonthlyClosingAttachments(monthlyClosing.id);
    }

    const [compensation, mealPixBlockReason, invoiceIssuer, holidayMap] =
      await Promise.all([
        getCurrentDeveloperCompensation(developer.id),
        getMealPixClosingBlockReason(developer.id),
        monthlyClosing?.invoice_issuer_id
          ? getInvoiceIssuer(monthlyClosing.invoice_issuer_id)
          : Promise.resolve(null),
        listApplicableHolidayDatesForDeveloperMonth({
          developerId: developer.id,
          yearMonth,
        }),
      ]);

    return {
      ok: true,
      detail: {
        yearMonth,
        closing: monthlyClosing,
        auditRows,
        canSubmit,
        blockingCount,
        attachments,
        invoiceIssuer,
        holidays: Array.from(holidayMap.byDate.entries()).map(
          ([date, name]) => ({ date, name }),
        ),
        mealPixBlockReason,
        compensation,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o detalhe do mês.",
    };
  }
}
