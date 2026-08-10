import {
  EMAIL_PREVIEW_SAMPLE_VARS,
  renderEmailTemplate,
} from "@/lib/email/render-template";
import type { EmailTemplate } from "@/types/operational-email";

/** Sample preview for admin UI — safe for client and server. */
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
