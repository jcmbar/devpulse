import "server-only";

import { formatYearMonthLabel } from "@/lib/metrics/date-range";
import { formatClosingMoney } from "@/lib/metrics/closing-submit-values";
import {
  EMAIL_PREVIEW_SAMPLE_VARS,
  renderEmailTemplate,
} from "@/lib/email/render-template";
import { buildOperationalEmailAttachmentFilename } from "@/lib/email/attachment-filename";
import { resolveOperationalEmailEnvelope } from "@/lib/email/defaults";
import {
  sendViaZeptoMail,
  type OperationalEmailAttachment,
} from "@/lib/email/zeptomail-send";
import { archiveOperationalEmailAttachments } from "@/services/operational-emails/attachment-backups";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getDeveloperAdmin } from "@/services/developers/admin";
import {
  listMonthlyClosingAttachments,
  getMonthlyClosingById,
  MONTHLY_CLOSING_STORAGE_BUCKET,
} from "@/services/monthly-closings";
import type {
  EmailDispatch,
  EmailDispatchStatus,
  EmailDispatchTriggeredBy,
  EmailSendType,
  EmailSendTypeCode,
  EmailTemplate,
  EmailTypeRecipient,
} from "@/types/operational-email";
import type { MonthlyClosing } from "@/types/monthly-closing";
import type { MonthlyClosingAttachmentType } from "@/types/monthly-closing";

function mapSendType(row: Record<string, unknown>): EmailSendType {
  return {
    id: String(row.id),
    code: row.code as EmailSendTypeCode,
    label: String(row.label),
    description: (row.description as string | null) ?? null,
    trigger_mode: row.trigger_mode as EmailSendType["trigger_mode"],
    trigger_event: (row.trigger_event as EmailSendType["trigger_event"]) ?? null,
    recipient_mode: row.recipient_mode as EmailSendType["recipient_mode"],
    required_attachments: Array.isArray(row.required_attachments)
      ? (row.required_attachments as string[])
      : [],
    optional_attachments: Array.isArray(row.optional_attachments)
      ? (row.optional_attachments as string[])
      : [],
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapTemplate(row: Record<string, unknown>): EmailTemplate {
  return {
    id: String(row.id),
    send_type_id: String(row.send_type_id),
    internal_name: String(row.internal_name),
    from_name: String(row.from_name),
    from_email: String(row.from_email),
    reply_to: (row.reply_to as string | null) ?? null,
    default_to: (row.default_to as string | null) ?? null,
    default_cc: (row.default_cc as string | null) ?? null,
    subject_template: String(row.subject_template),
    body_html: String(row.body_html),
    signature_html: (row.signature_html as string | null) ?? null,
    logo_url: (row.logo_url as string | null) ?? null,
    banner_url: (row.banner_url as string | null) ?? null,
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapRecipient(row: Record<string, unknown>): EmailTypeRecipient {
  return {
    id: String(row.id),
    send_type_id: String(row.send_type_id),
    email: String(row.email),
    display_name: (row.display_name as string | null) ?? null,
    role: row.role as EmailTypeRecipient["role"],
    developer_id: (row.developer_id as string | null) ?? null,
    profile_id: (row.profile_id as string | null) ?? null,
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapDispatch(row: Record<string, unknown>): EmailDispatch {
  return {
    id: String(row.id),
    send_type_id: String(row.send_type_id),
    monthly_closing_id: String(row.monthly_closing_id),
    developer_id: String(row.developer_id),
    year_month: String(row.year_month),
    status: row.status as EmailDispatchStatus,
    triggered_by: row.triggered_by as EmailDispatchTriggeredBy,
    actor_user_id: (row.actor_user_id as string | null) ?? null,
    template_id: (row.template_id as string | null) ?? null,
    to_emails: Array.isArray(row.to_emails) ? (row.to_emails as string[]) : [],
    cc_emails: Array.isArray(row.cc_emails) ? (row.cc_emails as string[]) : [],
    subject_rendered: (row.subject_rendered as string | null) ?? null,
    body_html_rendered: (row.body_html_rendered as string | null) ?? null,
    attachment_types: Array.isArray(row.attachment_types)
      ? (row.attachment_types as string[])
      : [],
    provider_message_id: (row.provider_message_id as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    sent_at: (row.sent_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function splitEmails(raw: string | null | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(/[,;]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.includes("@"));
}

export async function listEmailSendTypes(): Promise<EmailSendType[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_send_types")
    .select("*")
    .order("label");
  if (error) {
    throw new Error(`Falha ao listar tipos de e-mail: ${error.message}`);
  }
  return (data ?? []).map((row) => mapSendType(row as Record<string, unknown>));
}

export async function getEmailSendTypeByCode(
  code: EmailSendTypeCode,
): Promise<EmailSendType | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_send_types")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao carregar tipo de e-mail: ${error.message}`);
  }
  return data ? mapSendType(data as Record<string, unknown>) : null;
}

export async function listEmailTemplates(
  sendTypeId?: string,
): Promise<EmailTemplate[]> {
  const supabase = await createClient();
  let query = supabase.from("email_templates").select("*").order("internal_name");
  if (sendTypeId) {
    query = query.eq("send_type_id", sendTypeId);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao listar templates: ${error.message}`);
  }
  return (data ?? []).map((row) => mapTemplate(row as Record<string, unknown>));
}

export async function getActiveEmailTemplate(
  sendTypeId: string,
): Promise<EmailTemplate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_templates")
    .select("*")
    .eq("send_type_id", sendTypeId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao carregar template ativo: ${error.message}`);
  }
  return data ? mapTemplate(data as Record<string, unknown>) : null;
}

export async function getEmailTemplateById(
  id: string,
): Promise<EmailTemplate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao carregar template: ${error.message}`);
  }
  return data ? mapTemplate(data as Record<string, unknown>) : null;
}

export type UpsertEmailTemplateInput = {
  id?: string;
  sendTypeId: string;
  internalName: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  defaultTo?: string | null;
  defaultCc?: string | null;
  subjectTemplate: string;
  bodyHtml: string;
  signatureHtml?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  isActive: boolean;
};

export async function upsertEmailTemplate(
  input: UpsertEmailTemplateInput,
): Promise<EmailTemplate> {
  const supabase = await createClient();

  if (input.isActive) {
    const { error: clearError } = await supabase
      .from("email_templates")
      .update({ is_active: false })
      .eq("send_type_id", input.sendTypeId)
      .eq("is_active", true);
    if (clearError) {
      throw new Error(`Falha ao desativar templates: ${clearError.message}`);
    }
  }

  const payload = {
    send_type_id: input.sendTypeId,
    internal_name: input.internalName.trim(),
    from_name: input.fromName.trim(),
    from_email: input.fromEmail.trim().toLowerCase(),
    reply_to: input.replyTo?.trim() || null,
    default_to: input.defaultTo?.trim() || null,
    default_cc: input.defaultCc?.trim() || null,
    subject_template: input.subjectTemplate,
    body_html: input.bodyHtml,
    signature_html: input.signatureHtml?.trim() || null,
    logo_url: input.logoUrl?.trim() || null,
    banner_url: input.bannerUrl?.trim() || null,
    is_active: input.isActive,
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("email_templates")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) {
      throw new Error(`Falha ao atualizar template: ${error.message}`);
    }
    return mapTemplate(data as Record<string, unknown>);
  }

  const { data, error } = await supabase
    .from("email_templates")
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    throw new Error(`Falha ao criar template: ${error.message}`);
  }
  return mapTemplate(data as Record<string, unknown>);
}

export async function listEmailTypeRecipients(
  sendTypeId: string,
): Promise<EmailTypeRecipient[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_type_recipients")
    .select("*")
    .eq("send_type_id", sendTypeId)
    .order("role")
    .order("email");
  if (error) {
    throw new Error(`Falha ao listar destinatários: ${error.message}`);
  }
  return (data ?? []).map((row) =>
    mapRecipient(row as Record<string, unknown>),
  );
}

export async function addEmailTypeRecipient(input: {
  sendTypeId: string;
  email: string;
  displayName?: string | null;
  role: "to" | "cc";
}): Promise<EmailTypeRecipient> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_type_recipients")
    .insert({
      send_type_id: input.sendTypeId,
      email: input.email.trim().toLowerCase(),
      display_name: input.displayName?.trim() || null,
      role: input.role,
      is_active: true,
    })
    .select("*")
    .single();
  if (error) {
    throw new Error(`Falha ao adicionar destinatário: ${error.message}`);
  }
  return mapRecipient(data as Record<string, unknown>);
}

export async function deleteEmailTypeRecipient(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_type_recipients")
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error(`Falha ao remover destinatário: ${error.message}`);
  }
}

export async function listEmailDispatchesForClosings(
  closingIds: string[],
): Promise<EmailDispatch[]> {
  if (closingIds.length === 0) {
    return [];
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_dispatches")
    .select("*")
    .in("monthly_closing_id", closingIds);
  if (error) {
    throw new Error(`Falha ao listar envios: ${error.message}`);
  }
  return (data ?? []).map((row) => mapDispatch(row as Record<string, unknown>));
}

export async function getEmailDispatchForClosingType(input: {
  closingId: string;
  sendTypeId: string;
}): Promise<EmailDispatch | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_dispatches")
    .select("*")
    .eq("monthly_closing_id", input.closingId)
    .eq("send_type_id", input.sendTypeId)
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao carregar envio: ${error.message}`);
  }
  return data ? mapDispatch(data as Record<string, unknown>) : null;
}

export function previewEmailTemplate(template: EmailTemplate): {
  subject: string;
  html: string;
} {
  const vars = {
    ...EMAIL_PREVIEW_SAMPLE_VARS,
    logo_url: template.logo_url ?? "",
    banner_url: template.banner_url ?? "",
    signature_html: template.signature_html ?? "",
  };
  return {
    subject: renderEmailTemplate(template.subject_template, vars),
    html: renderEmailTemplate(template.body_html, vars),
  };
}

function buildClosingVariables(input: {
  closing: MonthlyClosing;
  developerName: string;
  developerEmail: string;
  template: EmailTemplate;
}): Record<string, string> {
  const { closing, developerName, developerEmail, template } = input;
  return {
    developer_name: developerName,
    developer_email: developerEmail,
    year_month: closing.year_month,
    year_month_label: formatYearMonthLabel(closing.year_month),
    base_amount: formatClosingMoney(closing.compensation_base_amount),
    differential_amount: formatClosingMoney(closing.differential_amount),
    travel_amount: formatClosingMoney(closing.travel_amount),
    meal_amount: formatClosingMoney(closing.meal_amount),
    invoice_amount: formatClosingMoney(closing.invoice_amount),
    worked_hours:
      closing.worked_hours_snapshot == null
        ? "—"
        : `${closing.worked_hours_snapshot.toLocaleString("pt-BR", {
            maximumFractionDigits: 1,
          })} h`,
    travel_days: String(closing.travel_presencial_days ?? 0),
    meal_days: String(closing.meal_presencial_days ?? 0),
    logo_url: template.logo_url ?? "",
    banner_url: template.banner_url ?? "",
    signature_html: template.signature_html ?? "",
  };
}

export function computeFinanceiroEligibility(input: {
  closing: MonthlyClosing;
  hasInvoicePdf: boolean;
  hasBoletoPdf: boolean;
}): EmailDispatchStatus {
  if (input.closing.status !== "finalized") {
    return "unavailable";
  }
  if (!input.hasInvoicePdf || !input.hasBoletoPdf) {
    return "unavailable";
  }
  return "ready";
}

async function listEmailTypeRecipientsAdmin(
  sendTypeId: string,
): Promise<EmailTypeRecipient[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("email_type_recipients")
    .select("*")
    .eq("send_type_id", sendTypeId)
    .eq("is_active", true)
    .order("role")
    .order("email");
  if (error) {
    throw new Error(`Falha ao listar destinatários: ${error.message}`);
  }
  return (data ?? []).map((row) =>
    mapRecipient(row as Record<string, unknown>),
  );
}

async function resolveRecipients(input: {
  sendType: EmailSendType;
  template: EmailTemplate;
  developerEmail: string | null;
}): Promise<{ to: string[]; cc: string[] }> {
  if (input.sendType.recipient_mode === "context_developer") {
    const email = input.developerEmail?.trim().toLowerCase() ?? "";
    if (!email.includes("@")) {
      throw new Error(
        "Colaborador sem e-mail cadastrado para receber o recibo.",
      );
    }
    return { to: [email], cc: [] };
  }

  const recipients = await listEmailTypeRecipientsAdmin(input.sendType.id);
  let to = recipients.filter((row) => row.role === "to").map((row) => row.email);
  let cc = recipients.filter((row) => row.role === "cc").map((row) => row.email);

  if (to.length === 0) {
    to = splitEmails(input.template.default_to);
  }
  if (cc.length === 0) {
    cc = splitEmails(input.template.default_cc);
  }

  if (to.length === 0) {
    throw new Error(
      `Nenhum destinatário configurado para ${input.sendType.label}. Cadastre em Configuração de E-mails.`,
    );
  }

  return { to, cc };
}

async function downloadClosingAttachments(
  types: MonthlyClosingAttachmentType[],
  closingId: string,
  naming?: {
    developerName: string;
    yearMonth: string;
    audience: EmailSendTypeCode | null;
  },
): Promise<{
  files: OperationalEmailAttachment[];
  attachedTypes: string[];
}> {
  if (types.length === 0) {
    return { files: [], attachedTypes: [] };
  }

  const attachments = await listMonthlyClosingAttachments(closingId);
  const admin = createAdminClient();
  const files: OperationalEmailAttachment[] = [];
  const attachedTypes: string[] = [];

  for (const type of types) {
    const row = attachments.find((item) => item.type === type);
    if (!row) {
      continue;
    }
    const { data, error } = await admin.storage
      .from(MONTHLY_CLOSING_STORAGE_BUCKET)
      .download(row.file_storage_key);
    if (error || !data) {
      throw new Error(
        `Falha ao baixar anexo ${type}: ${error?.message ?? "arquivo indisponível"}`,
      );
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    const useFriendlyName =
      naming != null &&
      (naming.audience === "financeiro" || naming.audience === "rh");
    const filename = useFriendlyName
      ? buildOperationalEmailAttachmentFilename({
          attachmentType: type,
          originalFilename: row.original_filename,
          developerName: naming.developerName,
          yearMonth: naming.yearMonth,
          audience: naming.audience,
        })
      : row.original_filename?.toLowerCase().endsWith(".pdf")
        ? row.original_filename
        : row.original_filename
          ? `${row.original_filename}.pdf`
          : `${type}.pdf`;
    files.push({
      filename,
      content: buffer,
      contentType: row.mime_type || "application/pdf",
    });
    attachedTypes.push(type);
  }

  return { files, attachedTypes };
}

async function upsertDispatchRecord(input: {
  sendTypeId: string;
  closing: MonthlyClosing;
  status: EmailDispatchStatus;
  triggeredBy: EmailDispatchTriggeredBy;
  actorUserId: string | null;
  templateId: string | null;
  to: string[];
  cc: string[];
  subject: string | null;
  bodyHtml: string | null;
  attachmentTypes: string[];
  providerMessageId: string | null;
  errorMessage: string | null;
  sentAt: string | null;
}): Promise<EmailDispatch> {
  // Admin client: auto RH dispara no upload do developer (sem RLS de gestor).
  const supabase = createAdminClient();
  const payload = {
    send_type_id: input.sendTypeId,
    monthly_closing_id: input.closing.id,
    developer_id: input.closing.developer_id,
    year_month: input.closing.year_month,
    status: input.status,
    triggered_by: input.triggeredBy,
    actor_user_id: input.actorUserId,
    template_id: input.templateId,
    to_emails: input.to,
    cc_emails: input.cc,
    subject_rendered: input.subject,
    body_html_rendered: input.bodyHtml,
    attachment_types: input.attachmentTypes,
    provider_message_id: input.providerMessageId,
    error_message: input.errorMessage,
    sent_at: input.sentAt,
  };

  const { data, error } = await supabase
    .from("email_dispatches")
    .upsert(payload, { onConflict: "monthly_closing_id,send_type_id" })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Falha ao gravar status do envio: ${error.message}`);
  }
  return mapDispatch(data as Record<string, unknown>);
}

export async function sendOperationalClosingEmail(input: {
  closingId: string;
  typeCode: EmailSendTypeCode;
  actorUserId: string | null;
  triggeredBy: EmailDispatchTriggeredBy;
}): Promise<EmailDispatch> {
  const sendType = await getEmailSendTypeByCode(input.typeCode);
  if (!sendType || !sendType.is_active) {
    throw new Error(`Tipo de envio "${input.typeCode}" indisponível.`);
  }

  const closing = await getMonthlyClosingById(input.closingId);
  if (!closing) {
    throw new Error("Fechamento não encontrado.");
  }

  const template = await getActiveEmailTemplate(sendType.id);
  if (!template) {
    throw new Error(
      `Nenhum template ativo para ${sendType.label}. Configure em E-mails.`,
    );
  }

  const developer = await getDeveloperAdmin(closing.developer_id);
  if (!developer) {
    throw new Error("Colaborador do fechamento não encontrado.");
  }

  const attachments = await listMonthlyClosingAttachments(closing.id);
  const hasInvoice = attachments.some((row) => row.type === "invoice_pdf");
  const hasBoleto = attachments.some((row) => row.type === "boleto_pdf");
  const hasMealPix = attachments.some((row) => row.type === "meal_pix_receipt");

  if (input.typeCode === "financeiro") {
    const eligibility = computeFinanceiroEligibility({
      closing,
      hasInvoicePdf: hasInvoice,
      hasBoletoPdf: hasBoleto,
    });
    if (eligibility !== "ready") {
      throw new Error(
        "Envio Financeiro só é permitido com fechamento finalizado e NF + boleto anexados.",
      );
    }
  }

  if (input.typeCode === "rh" && !hasMealPix) {
    throw new Error("Comprovante PIX de refeição não encontrado.");
  }

  if (input.typeCode === "colaborador" && closing.status !== "finalized") {
    throw new Error(
      "Recibo do colaborador só é enviado após a finalização do fechamento.",
    );
  }

  for (const required of sendType.required_attachments) {
    const present = attachments.some((row) => row.type === required);
    if (!present) {
      throw new Error(`Anexo obrigatório ausente: ${required}`);
    }
  }

  const developerEmail =
    developer.email?.trim() ||
    developer.profile?.email?.trim() ||
    null;
  const recipients = await resolveRecipients({
    sendType,
    template,
    developerEmail,
  });

  const vars = buildClosingVariables({
    closing,
    developerName: developer.full_name,
    developerEmail: developerEmail ?? "",
    template,
  });

  const subject = renderEmailTemplate(template.subject_template, vars);
  const html = renderEmailTemplate(template.body_html, vars);

  const attachmentTypesToFetch = [
    ...sendType.required_attachments,
    ...sendType.optional_attachments,
  ] as MonthlyClosingAttachmentType[];

  let files: OperationalEmailAttachment[] = [];
  let attachedTypes: string[] = [];
  try {
    const downloaded = await downloadClosingAttachments(
      attachmentTypesToFetch,
      closing.id,
      input.typeCode === "financeiro" || input.typeCode === "rh"
        ? {
            developerName: developer.full_name,
            yearMonth: closing.year_month,
            audience: input.typeCode,
          }
        : undefined,
    );
    files = downloaded.files;
    attachedTypes = downloaded.attachedTypes;

    for (const required of sendType.required_attachments) {
      if (!attachedTypes.includes(required)) {
        throw new Error(`Não foi possível anexar o arquivo obrigatório ${required}.`);
      }
    }

    const envelope = resolveOperationalEmailEnvelope();
    const result = await sendViaZeptoMail({
      from: envelope.from,
      to: recipients.to,
      cc: recipients.cc,
      replyTo: envelope.replyTo,
      subject,
      html,
      attachments: files,
    });

    const dispatch = await upsertDispatchRecord({
      sendTypeId: sendType.id,
      closing,
      status: "sent",
      triggeredBy: input.triggeredBy,
      actorUserId: input.actorUserId,
      templateId: template.id,
      to: recipients.to,
      cc: recipients.cc,
      subject,
      bodyHtml: html,
      attachmentTypes: attachedTypes,
      providerMessageId: result.messageId,
      errorMessage: null,
      sentAt: new Date().toISOString(),
    });

    if (input.typeCode === "financeiro" || input.typeCode === "rh") {
      const archiveFiles = files.map((file, index) => ({
        ...file,
        attachmentType: attachedTypes[index] as MonthlyClosingAttachmentType,
      }));
      await archiveOperationalEmailAttachments({
        emailDispatchId: dispatch.id,
        monthlyClosingId: closing.id,
        developerId: closing.developer_id,
        yearMonth: closing.year_month,
        audience: input.typeCode,
        files: archiveFiles,
      });
    }

    return dispatch;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha desconhecida no envio.";
    const dispatch = await upsertDispatchRecord({
      sendTypeId: sendType.id,
      closing,
      status: "error",
      triggeredBy: input.triggeredBy,
      actorUserId: input.actorUserId,
      templateId: template.id,
      to: recipients.to,
      cc: recipients.cc,
      subject,
      bodyHtml: html,
      attachmentTypes: attachedTypes,
      providerMessageId: null,
      errorMessage: message,
      sentAt: null,
    });
    if (input.triggeredBy === "manual") {
      throw new Error(message);
    }
    return dispatch;
  }
}

/** Fire-and-forget safe wrappers for automatic triggers. */
export async function trySendRhEmailOnMealPixUpload(input: {
  closingId: string;
  actorUserId: string | null;
}): Promise<void> {
  try {
    await sendOperationalClosingEmail({
      closingId: input.closingId,
      typeCode: "rh",
      actorUserId: input.actorUserId,
      triggeredBy: "system",
    });
  } catch (error) {
    console.error("[operational-email] RH auto-send failed", error);
  }
}

export async function trySendColaboradorEmailOnFinalize(input: {
  closingId: string;
  actorUserId: string | null;
}): Promise<void> {
  try {
    await sendOperationalClosingEmail({
      closingId: input.closingId,
      typeCode: "colaborador",
      actorUserId: input.actorUserId,
      triggeredBy: "system",
    });
  } catch (error) {
    console.error("[operational-email] Colaborador auto-send failed", error);
  }
}
