export type SpreadsheetParserVersion = "spreadsheet-v1";

export type NormalizedCardRow = {
  jiraKey: string;
  parentKey: string | null;
  summary: string | null;
  status: string | null;
  categories: string[];
  responsibleName: string | null;
  responsibleEmail: string | null;
  estimateHours: number | null;
  timeSpentHours: number | null;
  differenceHours: number | null;
  delayDays: number | null;
  startedOn: string | null;
  dueOn: string | null;
  completedOn: string | null;
  /** Entrega p/ Teste Unitário */
  unitTestDeliveryOn: string | null;
  rawPayload: Record<string, unknown>;
};

export type SpreadsheetParseResult = {
  parserVersion: SpreadsheetParserVersion;
  sheetName: string;
  headers: string[];
  rows: NormalizedCardRow[];
  skippedRows: number;
  warnings: string[];
};

export type SpreadsheetParseInput = {
  buffer: Buffer;
  fileName: string;
};

export type SpreadsheetParser = {
  version: SpreadsheetParserVersion;
  label: string;
  parse: (input: SpreadsheetParseInput) => SpreadsheetParseResult;
};
