import * as XLSX from "xlsx";
import {
  cellToString,
  findColumnIndex,
  headerMatchesAlias,
  normalizeHeader,
  parseCategories,
  parseDate,
  parseNumber,
  pickColumn,
} from "@/lib/imports/parse-utils";
import type {
  NormalizedCardRow,
  SpreadsheetParseInput,
  SpreadsheetParseResult,
  SpreadsheetParser,
} from "@/lib/imports/types";

/**
 * Column aliases accepted by spreadsheet-v1.
 * Headers are normalized (lowercase, no accents) before matching.
 * Prefix matches are also accepted (e.g. "CHAVE DO CARD" → jiraKey).
 */
export const SPREADSHEET_V1_COLUMN_MAP = {
  jiraKey: ["chave", "chave do card", "key", "issue key", "card", "issue"],
  parentKey: ["parent", "pai", "parent key", "epic link", "epic"],
  summary: ["resumo", "summary", "titulo", "title", "nome do card"],
  status: ["status", "situacao", "state"],
  categories: ["categorias", "categoria", "category", "categories", "labels"],
  responsibleName: [
    "responsavel",
    "nome",
    "assignee",
    "developer",
    "desenvolvedor",
  ],
  responsibleEmail: ["email", "e mail", "email responsavel", "assignee email"],
  estimateHours: [
    "estimativa original",
    "tempo estimado",
    "estimativa",
    "estimate",
    "estimativa h",
    "original estimate",
    "story points",
  ],
  timeSpentHours: [
    "tempo atuado",
    "tempo gasto",
    "time spent",
    "horas gastas",
    "horas",
    "worklog",
  ],
  differenceHours: ["diferenca", "difference", "delta", "diff"],
  delayDays: ["atraso", "delay", "dias de atraso", "dias atraso"],
  startedOn: [
    "inicio",
    "start date",
    "data inicio",
    "data de inicio",
    "started",
    "start",
  ],
  dueOn: ["data limite", "prazo", "due date", "vencimento", "due"],
  completedOn: [
    "conclusao",
    "resolved",
    "data conclusao",
    "completed",
    "done date",
    "resolution date",
  ],
  unitTestDeliveryOn: [
    "entrega p teste unitario",
    "entrega para teste unitario",
    "entrega teste unitario",
    "entrega p tu",
    "entrega p/ teste unitario",
    "unit test delivery",
  ],
} as const;

const INFORMATIVE_SHEET_NAMES = new Set([
  "about",
  "readme",
  "info",
  "information",
  "instructions",
  "instrucoes",
  "changelog",
  "notes",
  "notas",
  "help",
  "ajuda",
]);

const HEADER_SCAN_ROWS = 5;

type SheetCandidate = {
  sheetName: string;
  headers: string[];
  rows: unknown[][];
  headerRowIndex: number;
  isInformativeName: boolean;
};

function isInformativeSheetName(sheetName: string): boolean {
  return INFORMATIVE_SHEET_NAMES.has(normalizeHeader(sheetName));
}

function hasJiraKeyHeader(headers: string[]): boolean {
  return findColumnIndex(headers, [...SPREADSHEET_V1_COLUMN_MAP.jiraKey]) >= 0;
}

function sheetToMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(
    sheet,
    {
      header: 1,
      defval: null,
      raw: true,
    },
  );
}

function findHeaderRow(matrix: unknown[][]): {
  headers: string[];
  headerRowIndex: number;
} | null {
  const scanLimit = Math.min(HEADER_SCAN_ROWS, matrix.length);

  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const headerRow = matrix[rowIndex] ?? [];
    const headers = headerRow.map((header) => cellToString(header) ?? "");

    if (hasJiraKeyHeader(headers)) {
      return { headers, headerRowIndex: rowIndex };
    }
  }

  return null;
}

function collectSheetCandidates(
  workbook: XLSX.WorkBook,
): SheetCandidate[] {
  const candidates: SheetCandidate[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    const matrix = sheetToMatrix(sheet);
    if (matrix.length === 0) {
      continue;
    }

    const headerMatch = findHeaderRow(matrix);
    if (!headerMatch) {
      continue;
    }

    candidates.push({
      sheetName,
      headers: headerMatch.headers,
      rows: matrix.slice(headerMatch.headerRowIndex + 1),
      headerRowIndex: headerMatch.headerRowIndex,
      isInformativeName: isInformativeSheetName(sheetName),
    });
  }

  return candidates;
}

function selectBestSheet(candidates: SheetCandidate[]): SheetCandidate {
  const ranked = [...candidates].sort((left, right) => {
    if (left.isInformativeName !== right.isInformativeName) {
      return left.isInformativeName ? 1 : -1;
    }

    return 0;
  });

  return ranked[0]!;
}

function readWorkbookRows(input: SpreadsheetParseInput): {
  sheetName: string;
  headers: string[];
  rows: unknown[][];
  warnings: string[];
} {
  const workbook = XLSX.read(input.buffer, {
    type: "buffer",
    cellDates: true,
  });

  if (workbook.SheetNames.length === 0) {
    throw new Error("A planilha não contém nenhuma aba.");
  }

  const candidates = collectSheetCandidates(workbook);
  const warnings: string[] = [];

  if (candidates.length === 0) {
    const inspected = workbook.SheetNames.join(", ");
    throw new Error(
      `Nenhuma aba com coluna de chave do card foi encontrada. Abas inspecionadas: ${inspected}. ` +
        `Esperado um cabeçalho compatível com CHAVE / Chave / Key / Issue key.`,
    );
  }

  const selected = selectBestSheet(candidates);

  if (candidates.length > 1) {
    const skipped = candidates
      .filter((candidate) => candidate.sheetName !== selected.sheetName)
      .map((candidate) => candidate.sheetName);

    if (skipped.length > 0) {
      warnings.push(
        `Aba selecionada: "${selected.sheetName}". Outras abas com coluna de chave ignoradas: ${skipped.join(", ")}.`,
      );
    }
  }

  if (selected.isInformativeName) {
    warnings.push(
      `A aba escolhida ("${selected.sheetName}") tem nome informativo, mas contém a coluna de chave.`,
    );
  }

  if (selected.headerRowIndex > 0) {
    warnings.push(
      `Cabeçalhos encontrados na linha ${selected.headerRowIndex + 1} da aba "${selected.sheetName}".`,
    );
  }

  const ignoredInformative = workbook.SheetNames.filter(
    (name) =>
      isInformativeSheetName(name) &&
      !candidates.some((candidate) => candidate.sheetName === name),
  );

  if (ignoredInformative.length > 0) {
    warnings.push(
      `Abas informativas ignoradas (sem coluna de chave): ${ignoredInformative.join(", ")}.`,
    );
  }

  return {
    sheetName: selected.sheetName,
    headers: selected.headers,
    rows: selected.rows,
    warnings,
  };
}

function rowToObject(headers: string[], row: unknown[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  headers.forEach((header, index) => {
    const key = header || `column_${index + 1}`;
    payload[key] = row[index] ?? null;
  });

  return payload;
}

function mapRow(
  headers: string[],
  row: unknown[],
): NormalizedCardRow | null {
  const jiraKey = cellToString(
    pickColumn(row, headers, [...SPREADSHEET_V1_COLUMN_MAP.jiraKey]),
  );

  if (!jiraKey) {
    return null;
  }

  return {
    jiraKey,
    parentKey: cellToString(
      pickColumn(row, headers, [...SPREADSHEET_V1_COLUMN_MAP.parentKey]),
    ),
    summary: cellToString(
      pickColumn(row, headers, [...SPREADSHEET_V1_COLUMN_MAP.summary]),
    ),
    status: cellToString(
      pickColumn(row, headers, [...SPREADSHEET_V1_COLUMN_MAP.status]),
    ),
    categories: parseCategories(
      pickColumn(row, headers, [...SPREADSHEET_V1_COLUMN_MAP.categories]),
    ),
    responsibleName: cellToString(
      pickColumn(row, headers, [...SPREADSHEET_V1_COLUMN_MAP.responsibleName]),
    ),
    responsibleEmail: cellToString(
      pickColumn(row, headers, [...SPREADSHEET_V1_COLUMN_MAP.responsibleEmail]),
    ),
    estimateHours: parseNumber(
      pickColumn(row, headers, [...SPREADSHEET_V1_COLUMN_MAP.estimateHours]),
    ),
    timeSpentHours: parseNumber(
      pickColumn(row, headers, [...SPREADSHEET_V1_COLUMN_MAP.timeSpentHours]),
    ),
    differenceHours: parseNumber(
      pickColumn(row, headers, [...SPREADSHEET_V1_COLUMN_MAP.differenceHours]),
    ),
    delayDays: parseNumber(
      pickColumn(row, headers, [...SPREADSHEET_V1_COLUMN_MAP.delayDays]),
    ),
    startedOn: parseDate(
      pickColumn(row, headers, [...SPREADSHEET_V1_COLUMN_MAP.startedOn]),
    ),
    dueOn: parseDate(
      pickColumn(row, headers, [...SPREADSHEET_V1_COLUMN_MAP.dueOn]),
    ),
    completedOn: parseDate(
      pickColumn(row, headers, [...SPREADSHEET_V1_COLUMN_MAP.completedOn]),
    ),
    unitTestDeliveryOn: parseDate(
      pickColumn(row, headers, [...SPREADSHEET_V1_COLUMN_MAP.unitTestDeliveryOn]),
    ),
    rawPayload: rowToObject(headers, row),
  };
}

function buildWarnings(headers: string[]): string[] {
  const warnings: string[] = [];
  const required = ["jiraKey"] as const;
  const critical = ["unitTestDeliveryOn", "responsibleName"] as const;

  for (const field of required) {
    const index = findColumnIndex(headers, [...SPREADSHEET_V1_COLUMN_MAP[field]]);
    if (index < 0) {
      warnings.push(
        `Coluna obrigatória não encontrada para "${field}". Linhas sem chave serão ignoradas.`,
      );
    }
  }

  for (const field of critical) {
    const index = findColumnIndex(headers, [...SPREADSHEET_V1_COLUMN_MAP[field]]);
    if (index < 0) {
      warnings.push(
        `Coluna crítica ausente para "${field}". Sem ela o Compilado pode ficar zerado ou sem vínculo de developer.`,
      );
    }
  }

  const knownAliases = Object.values(SPREADSHEET_V1_COLUMN_MAP).flat();

  const unmapped = headers
    .filter((header) => header.trim().length > 0)
    .filter(
      (header) =>
        !knownAliases.some((alias) => headerMatchesAlias(header, alias)),
    );

  if (unmapped.length > 0) {
    warnings.push(
      `Colunas não mapeadas (preservadas em raw_payload): ${unmapped.join(", ")}.`,
    );
  }

  return warnings;
}

export const spreadsheetV1Parser: SpreadsheetParser = {
  version: "spreadsheet-v1",
  label: "Planilha local v1",
  parse(input) {
    const {
      sheetName,
      headers,
      rows,
      warnings: selectionWarnings,
    } = readWorkbookRows(input);

    const warnings = [...selectionWarnings, ...buildWarnings(headers)];
    warnings.unshift(`Aba utilizada na importação: "${sheetName}".`);

    const normalizedRows: NormalizedCardRow[] = [];
    let skippedRows = 0;

    for (const row of rows) {
      const isEmpty = row.every((cell) => cell == null || cell === "");
      if (isEmpty) {
        skippedRows += 1;
        continue;
      }

      const mapped = mapRow(headers, row);
      if (!mapped) {
        skippedRows += 1;
        continue;
      }

      normalizedRows.push(mapped);
    }

    // Keep last occurrence when the same key appears more than once.
    const deduped = new Map<string, NormalizedCardRow>();
    for (const row of normalizedRows) {
      deduped.set(row.jiraKey, row);
    }

    const result: SpreadsheetParseResult = {
      parserVersion: "spreadsheet-v1",
      sheetName,
      headers,
      rows: [...deduped.values()],
      skippedRows:
        skippedRows + Math.max(normalizedRows.length - deduped.size, 0),
      warnings,
    };

    return result;
  },
};
