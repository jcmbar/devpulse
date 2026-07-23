import type { NormalizedCardRow } from "@/lib/imports/types";

export type ImportDeliveryStats = {
  totalRows: number;
  rowsWithDelivery: number;
  deliveryMin: string | null;
  deliveryMax: string | null;
};

function deliveryDateForRow(row: NormalizedCardRow): string | null {
  return row.unitTestDeliveryOn ?? row.completedOn ?? null;
}

/**
 * Scans parsed rows for Compilado delivery dates (no user period required).
 */
export function analyzeImportDeliveryStats(
  rows: NormalizedCardRow[],
): ImportDeliveryStats {
  let rowsWithDelivery = 0;
  let deliveryMin: string | null = null;
  let deliveryMax: string | null = null;

  for (const row of rows) {
    const delivery = deliveryDateForRow(row);
    if (!delivery) {
      continue;
    }

    rowsWithDelivery += 1;
    if (deliveryMin == null || delivery < deliveryMin) {
      deliveryMin = delivery;
    }
    if (deliveryMax == null || delivery > deliveryMax) {
      deliveryMax = delivery;
    }
  }

  return {
    totalRows: rows.length,
    rowsWithDelivery,
    deliveryMin,
    deliveryMax,
  };
}

export function assertImportHasDeliveryDates(stats: ImportDeliveryStats): void {
  if (stats.totalRows === 0) {
    throw new Error(
      "A planilha não gerou nenhuma linha válida com chave de card.",
    );
  }

  if (stats.rowsWithDelivery === 0 || !stats.deliveryMin || !stats.deliveryMax) {
    throw new Error(
      "Nenhuma data válida de “Entrega p/ Teste Unitário” (nem fallback de conclusão) foi encontrada. " +
        "Sem essa data o Compilado não consegue filtrar cards na AppHome/Gestor.",
    );
  }
}

export function buildImportDeliveryWarnings(stats: ImportDeliveryStats): string[] {
  const warnings: string[] = [];
  const coverage =
    stats.totalRows > 0
      ? Math.round((stats.rowsWithDelivery / stats.totalRows) * 100)
      : 0;

  if (stats.deliveryMin && stats.deliveryMax) {
    warnings.push(
      `Faixa de entregas detectada: ${stats.deliveryMin} → ${stats.deliveryMax}.`,
    );
  }

  warnings.push(
    `Cards com data de entrega: ${stats.rowsWithDelivery}/${stats.totalRows} (${coverage}%).`,
  );

  if (coverage < 30) {
    warnings.push(
      `Poucas linhas têm “Entrega p/ Teste Unitário” (${coverage}%). ` +
        "Cards sem essa data não entram no Compilado filtrado por período.",
    );
  }

  return warnings;
}
