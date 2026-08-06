/**
 * Minimal Mustache-like renderer for operational email templates.
 * Supports {{var}} and {{#if var}}...{{/if}} (truthy if non-empty after trim).
 */

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const RAW_HTML_KEYS = new Set([
  "signature_html",
  "body_html",
  "logo_img",
  "banner_img",
]);

export function renderEmailTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  let output = template;

  output = output.replace(
    /\{\{#if\s+([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, key: string, inner: string) => {
      const value = variables[key] ?? "";
      return value.trim() ? inner : "";
    },
  );

  output = output.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = variables[key] ?? "";
    if (RAW_HTML_KEYS.has(key)) {
      return value;
    }
    return escapeHtml(value);
  });

  return output;
}

export const EMAIL_PREVIEW_SAMPLE_VARS: Record<string, string> = {
  developer_name: "Ana Silva",
  developer_email: "ana.silva@example.com",
  year_month: "2026-03",
  year_month_label: "março de 2026",
  base_amount: "R$ 3.120,00",
  differential_amount: "R$ 0,00",
  travel_amount: "R$ 120,00",
  meal_amount: "R$ 80,00",
  invoice_amount: "R$ 3.320,00",
  worked_hours: "120 h",
  travel_days: "3",
  meal_days: "4",
  logo_url: "",
  banner_url: "",
  signature_html: "<p style=\"margin:0;\">Equipe DevPulse</p>",
};
