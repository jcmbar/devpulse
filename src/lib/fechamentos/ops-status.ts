import type { MonthlyClosing } from "@/types/monthly-closing";
import type { MonthlyClosingAttachmentPresence } from "@/types/monthly-closing";
import type { EmailDispatchStatus } from "@/types/operational-email";
import { EMAIL_DISPATCH_STATUS_LABELS } from "@/types/operational-email";

export type FechamentoOpsStatus =
  | "erro"
  | "pendente"
  | "em_analise"
  | "pronto"
  | "finalizado";

export const FECHAMENTO_OPS_STATUS_LABELS: Record<FechamentoOpsStatus, string> =
  {
    erro: "Erro",
    pendente: "Pendente",
    em_analise: "Em análise",
    pronto: "Pronto",
    finalizado: "Finalizado",
  };

export const FECHAMENTO_OPS_STATUS_ORDER: FechamentoOpsStatus[] = [
  "erro",
  "pendente",
  "em_analise",
  "pronto",
  "finalizado",
];

export type FechamentoOpsDocState =
  | "na"
  | "ausente"
  | "pendente"
  | "aceito"
  | "recusado"
  | "enviado"
  | "pronto"
  | "erro"
  | "indisponivel";

export function emailDispatchToDocState(
  status: EmailDispatchStatus | null | undefined,
  readyFallback = false,
): FechamentoOpsDocState {
  if (status === "sent") {
    return "enviado";
  }
  if (status === "error") {
    return "erro";
  }
  if (status === "ready" || readyFallback) {
    return "pronto";
  }
  if (status === "unavailable") {
    return "indisponivel";
  }
  return readyFallback ? "pronto" : "indisponivel";
}

export function mealPixToDocState(
  presence: MonthlyClosingAttachmentPresence | null | undefined,
  requireMealPix: boolean,
): FechamentoOpsDocState {
  if (!requireMealPix) {
    return "na";
  }
  if (!presence?.hasMealPixReceipt) {
    return "ausente";
  }
  if (presence.mealPixValid === true) {
    return "aceito";
  }
  if (presence.mealPixValid === false) {
    return "recusado";
  }
  return "pendente";
}

export function deriveFechamentoOpsStatus(input: {
  closing: MonthlyClosing | null;
  presence: MonthlyClosingAttachmentPresence | null;
  financeiro: EmailDispatchStatus | null;
  rh: EmailDispatchStatus | null;
  requireMealPix: boolean;
}): FechamentoOpsStatus {
  const { closing, presence, financeiro, rh, requireMealPix } = input;

  if (financeiro === "error" || rh === "error") {
    return "erro";
  }
  if (requireMealPix && presence?.mealPixValid === false) {
    return "erro";
  }

  if (!closing) {
    return "pendente";
  }

  if (closing.status === "rejected") {
    // Aguardando o developer ajustar e reenviar — não é fila de aprovação.
    return "pendente";
  }

  if (closing.status === "in_review") {
    return "em_analise";
  }

  if (closing.status === "open" || closing.status === "closed") {
    return "pendente";
  }

  // finalized
  const hasDocs =
    Boolean(presence?.hasInvoicePdf) && Boolean(presence?.hasBoletoPdf);
  const pixOk =
    !requireMealPix ||
    (presence?.hasMealPixReceipt === true && presence.mealPixValid === true);
  const rhDone = !requireMealPix || rh === "sent";
  const financeiroDone = financeiro === "sent";

  if (financeiroDone && rhDone) {
    return "finalizado";
  }

  if (hasDocs && pixOk) {
    return "pronto";
  }

  return "pendente";
}

export function opsStatusToneClass(status: FechamentoOpsStatus): string {
  switch (status) {
    case "erro":
      return "border-rose-500/40 bg-rose-500/15 text-rose-900 dark:text-rose-100";
    case "pendente":
      return "border-amber-500/40 bg-amber-500/15 text-amber-950 dark:text-amber-100";
    case "em_analise":
      return "border-sky-500/40 bg-sky-500/15 text-sky-950 dark:text-sky-100";
    case "pronto":
      return "border-teal-500/40 bg-teal-500/15 text-teal-950 dark:text-teal-100";
    case "finalizado":
      return "border-emerald-500/40 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100";
  }
}

export function yearCellTone(
  status: FechamentoOpsStatus | null,
): "green" | "yellow" | "red" | "gray" {
  if (status == null) {
    return "gray";
  }
  switch (status) {
    case "finalizado":
      return "green";
    case "erro":
      return "red";
    case "pendente":
    case "em_analise":
    case "pronto":
      return "yellow";
  }
}

export function docStateLabel(state: FechamentoOpsDocState): string {
  switch (state) {
    case "na":
      return "N/A";
    case "ausente":
      return "Ausente";
    case "pendente":
      return "Pendente";
    case "aceito":
      return "Aceito";
    case "recusado":
      return "Recusado";
    case "enviado":
      return "Enviado";
    case "pronto":
      return "Pronto";
    case "erro":
      return "Erro";
    case "indisponivel":
      return "—";
  }
}

export function emailStatusLabel(
  status: EmailDispatchStatus | null | undefined,
): string {
  if (!status) {
    return "—";
  }
  return EMAIL_DISPATCH_STATUS_LABELS[status];
}

export function lastUpdatedAt(closing: MonthlyClosing | null): string | null {
  if (!closing) {
    return null;
  }
  return (
    closing.finalized_at ??
    closing.closed_at ??
    closing.resubmitted_at ??
    closing.submitted_at ??
    closing.updated_at ??
    closing.started_at
  );
}

export type FechamentoOpsCellData = {
  yearMonth: string;
  closingId: string | null;
  closingStatus: MonthlyClosing["status"] | null;
  lastUpdatedAt: string | null;
  presence: MonthlyClosingAttachmentPresence | null;
  financeiro: EmailDispatchStatus | null;
  rh: EmailDispatchStatus | null;
  colaborador: EmailDispatchStatus | null;
  requireMealPix: boolean;
  opsStatus: FechamentoOpsStatus;
};

export type FechamentoOpsDeveloperData = {
  id: string;
  fullName: string;
  isActive: boolean;
  requireMealPix: boolean;
  /** Present months only (no empty months). */
  cellsByMonth: Record<string, FechamentoOpsCellData>;
};

export function buildFechamentoOpsCell(input: {
  yearMonth: string;
  closing: MonthlyClosing | null;
  presence: MonthlyClosingAttachmentPresence | null;
  financeiro: EmailDispatchStatus | null;
  rh: EmailDispatchStatus | null;
  colaborador: EmailDispatchStatus | null;
  requireMealPix: boolean;
}): FechamentoOpsCellData {
  const opsStatus = deriveFechamentoOpsStatus({
    closing: input.closing,
    presence: input.presence,
    financeiro: input.financeiro,
    rh: input.rh,
    requireMealPix: input.requireMealPix,
  });
  return {
    yearMonth: input.yearMonth,
    closingId: input.closing?.id ?? null,
    closingStatus: input.closing?.status ?? null,
    lastUpdatedAt: lastUpdatedAt(input.closing),
    presence: input.presence,
    financeiro: input.financeiro,
    rh: input.rh,
    colaborador: input.colaborador,
    requireMealPix: input.requireMealPix,
    opsStatus,
  };
}
