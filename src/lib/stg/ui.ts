import type { StgSessionResult, StgSessionStatus } from "@/types/stg";

export function isStgSchemaMissingError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /relation .* does not exist|table .* does not exist|column .* does not exist|Could not find the table|schema cache/i.test(
    message,
  );
}

export async function loadStgOrMissing<T>(
  loader: () => Promise<T>,
): Promise<{ data: T | null; schemaMissing: boolean; error: string | null }> {
  try {
    const data = await loader();
    return { data, schemaMissing: false, error: null };
  } catch (error) {
    if (isStgSchemaMissingError(error)) {
      return { data: null, schemaMissing: true, error: null };
    }
    return {
      data: null,
      schemaMissing: false,
      error:
        error instanceof Error
          ? error.message
          : "Falha ao carregar dados do STG.",
    };
  }
}

export function stgResultLabel(result: StgSessionResult): string {
  switch (result) {
    case "approved":
      return "STAGING APROVADA";
    case "blocked":
      return "ATENÇÃO — Impedimentos para PRODUÇÃO";
    case "waived":
      return "Liberada com waiver";
    case "pending":
    default:
      return "Aguardando decisão";
  }
}

export function stgResultTone(
  result: StgSessionResult,
): "success" | "danger" | "warning" | "neutral" {
  switch (result) {
    case "approved":
      return "success";
    case "blocked":
      return "danger";
    case "waived":
      return "warning";
    default:
      return "neutral";
  }
}

export function stgStatusLabel(status: StgSessionStatus): string {
  switch (status) {
    case "draft":
      return "Rascunho";
    case "planned":
      return "Planejada";
    case "in_progress":
      return "Em andamento";
    case "reviewing":
      return "Em revisão";
    case "closed":
      return "Fechada";
    default:
      return status;
  }
}

export function formatCoverageRatio(ratio: number | null): string {
  if (ratio == null) {
    return "—";
  }
  return `${Math.round(ratio * 100)}%`;
}
