export type EmailSendTypeCode = "financeiro" | "rh" | "colaborador";

export type EmailTriggerMode = "manual" | "automatic";

export type EmailTriggerEvent = "meal_pix_uploaded" | "closing_finalized";

export type EmailRecipientMode = "fixed_list" | "context_developer";

export type EmailDispatchStatus =
  | "unavailable"
  | "ready"
  | "sent"
  | "error";

export type EmailDispatchTriggeredBy = "manual" | "system";

export type EmailRecipientRole = "to" | "cc";

export type EmailSendType = {
  id: string;
  code: EmailSendTypeCode;
  label: string;
  description: string | null;
  trigger_mode: EmailTriggerMode;
  trigger_event: EmailTriggerEvent | null;
  recipient_mode: EmailRecipientMode;
  required_attachments: string[];
  optional_attachments: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type EmailTemplate = {
  id: string;
  send_type_id: string;
  internal_name: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  default_to: string | null;
  default_cc: string | null;
  subject_template: string;
  body_html: string;
  signature_html: string | null;
  logo_url: string | null;
  banner_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type EmailTypeRecipient = {
  id: string;
  send_type_id: string;
  email: string;
  display_name: string | null;
  role: EmailRecipientRole;
  developer_id: string | null;
  profile_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type EmailDispatch = {
  id: string;
  send_type_id: string;
  monthly_closing_id: string;
  developer_id: string;
  year_month: string;
  status: EmailDispatchStatus;
  triggered_by: EmailDispatchTriggeredBy;
  actor_user_id: string | null;
  template_id: string | null;
  to_emails: string[];
  cc_emails: string[];
  subject_rendered: string | null;
  body_html_rendered: string | null;
  attachment_types: string[];
  provider_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailTemplateVariables = Record<string, string>;

export const EMAIL_SEND_TYPE_LABELS: Record<EmailSendTypeCode, string> = {
  financeiro: "Financeiro",
  rh: "RH",
  colaborador: "Colaborador (recibo)",
};

export const EMAIL_DISPATCH_STATUS_LABELS: Record<EmailDispatchStatus, string> =
  {
    unavailable: "Não disponível",
    ready: "Pronto para envio",
    sent: "Enviado",
    error: "Erro no envio",
  };

export function isEmailSendTypeCode(value: string): value is EmailSendTypeCode {
  return (
    value === "financeiro" || value === "rh" || value === "colaborador"
  );
}
