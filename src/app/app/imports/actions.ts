"use server";

import { revalidatePath } from "next/cache";
import { requireImportAccess } from "@/lib/auth/permissions";
import { runSpreadsheetImport } from "@/lib/imports/run-spreadsheet-import";

export type ImportActionState = {
  ok: boolean;
  error: string | null;
  importId: string | null;
  insertedCount: number | null;
  skippedRows: number | null;
  developersLinked: number | null;
  snapshotsCreated: number | null;
  deliveryMin: string | null;
  deliveryMax: string | null;
  rowsWithDelivery: number | null;
  warnings: string[];
  sheetName: string | null;
  teamName: string | null;
  jiraKeyPrefix: string | null;
  archivedOlderCount: number | null;
};

const initialFields = {
  importId: null,
  insertedCount: null,
  skippedRows: null,
  developersLinked: null,
  snapshotsCreated: null,
  deliveryMin: null,
  deliveryMax: null,
  rowsWithDelivery: null,
  warnings: [] as string[],
  sheetName: null,
  teamName: null,
  jiraKeyPrefix: null,
  archivedOlderCount: null,
};

export async function importSpreadsheetAction(
  _prevState: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      error: "Selecione um arquivo XLSX ou CSV para importar.",
      ...initialFields,
    };
  }

  const fileName = file.name.toLowerCase();
  if (
    !fileName.endsWith(".xlsx") &&
    !fileName.endsWith(".xls") &&
    !fileName.endsWith(".csv")
  ) {
    return {
      ok: false,
      error: "Formato inválido. Use .xlsx, .xls ou .csv.",
      ...initialFields,
    };
  }

  try {
    const { profile } = await requireImportAccess();
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const result = await runSpreadsheetImport({
      importedBy: profile.id,
      fileName: file.name,
      fileBuffer,
    });

    revalidatePath("/app/imports");
    revalidatePath("/app");
    revalidatePath("/app/gestor");
    revalidatePath("/app/teams");

    return {
      ok: true,
      error: null,
      importId: result.importRecord.id,
      insertedCount: result.insertedCount,
      skippedRows: result.parseResult.skippedRows,
      developersLinked: result.developersLinked,
      snapshotsCreated: result.snapshotsCreated,
      deliveryMin: result.deliveryMin,
      deliveryMax: result.deliveryMax,
      rowsWithDelivery: result.rowsWithDelivery,
      warnings: result.parseResult.warnings,
      sheetName: result.parseResult.sheetName,
      teamName: result.team.name,
      jiraKeyPrefix: result.jiraKeyPrefix,
      archivedOlderCount: result.archivedOlderCount,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao importar a planilha.";

    return {
      ok: false,
      error: message,
      ...initialFields,
    };
  }
}
