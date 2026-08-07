import type { MonthlyClosingAttachmentType } from "@/types/monthly-closing";
import type { EmailSendTypeCode } from "@/types/operational-email";

const MONTH_SHORT_PT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

const AUDIENCE_LABEL: Partial<Record<EmailSendTypeCode, string>> = {
  financeiro: "Financeiro",
  rh: "RH",
};

/** Competence label used in attachment filenames, e.g. "Jul 2026". */
export function formatAttachmentCompetence(yearMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth.trim());
  if (!match) {
    return yearMonth.trim();
  }
  const year = match[1]!;
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) {
    return yearMonth.trim();
  }
  return `${MONTH_SHORT_PT[monthIndex]} ${year}`;
}

function stripPdfExtension(filename: string): string {
  return filename.replace(/\.pdf$/i, "").trim();
}

export function ensurePdfExtension(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) {
    return "documento.pdf";
  }
  return /\.pdf$/i.test(trimmed) ? trimmed : `${trimmed}.pdf`;
}

/** Keep Windows/macOS-safe names without altering the human-readable pattern. */
export function sanitizeAttachmentFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts the NF reference token as typed by the user (e.g. "04", "4", "012").
 * Looks for "NF 04" / "NF04" in the original filename.
 */
export function extractNfReference(originalFilename: string): string | null {
  const stem = stripPdfExtension(originalFilename);
  const match = /\bNF\s*([0-9]+)\b/i.exec(stem);
  return match?.[1] ?? null;
}

function cleanDeveloperName(name: string): string {
  return name.replace(/\s+/g, " ").trim() || "Colaborador";
}

function buildDocumentLabel(
  type: MonthlyClosingAttachmentType,
  nfReference: string | null,
): string {
  const ref = nfReference?.trim() || null;
  switch (type) {
    case "invoice_pdf":
      return ref ? `NF ${ref}` : "NF";
    case "boleto_pdf":
      return ref ? `Boleto NF ${ref}` : "Boleto NF";
    case "meal_pix_receipt":
      return "Comprovante PIX";
    default:
      return "Documento";
  }
}

export type BuildOperationalEmailAttachmentFilenameInput = {
  attachmentType: MonthlyClosingAttachmentType;
  originalFilename: string | null | undefined;
  developerName: string;
  yearMonth: string;
  /** When set for Financeiro/RH, appends " - Financeiro" / " - RH". */
  audience?: EmailSendTypeCode | null;
};

/**
 * Friendly PDF filename for operational email attachments only.
 * Does not rename storage objects — used solely as the MIME attachment name.
 *
 * Pattern:
 *   [tipo(+ref)] - [nome do colaborador] - [competência][- audience].pdf
 * e.g. "NF 04 - Bruno Leonardo - Jul 2026 - Financeiro.pdf"
 */
export function buildOperationalEmailAttachmentFilename(
  input: BuildOperationalEmailAttachmentFilenameInput,
): string {
  const developerName = cleanDeveloperName(input.developerName);
  const competence = formatAttachmentCompetence(input.yearMonth);
  const original = (input.originalFilename ?? "").trim();
  const nfReference = extractNfReference(original);
  const documentLabel = buildDocumentLabel(input.attachmentType, nfReference);

  const parts = [documentLabel, developerName, competence];

  const audienceLabel =
    input.audience != null ? AUDIENCE_LABEL[input.audience] : undefined;
  if (audienceLabel) {
    parts.push(audienceLabel);
  }

  const filename = ensurePdfExtension(
    sanitizeAttachmentFilename(parts.join(" - ")),
  );
  return filename;
}
