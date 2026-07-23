import { spreadsheetV1Parser } from "@/lib/imports/parsers/spreadsheet-v1";
import type {
  SpreadsheetParseInput,
  SpreadsheetParseResult,
  SpreadsheetParser,
  SpreadsheetParserVersion,
} from "@/lib/imports/types";

const parsers: Record<SpreadsheetParserVersion, SpreadsheetParser> = {
  "spreadsheet-v1": spreadsheetV1Parser,
};

export const DEFAULT_SPREADSHEET_PARSER: SpreadsheetParserVersion =
  "spreadsheet-v1";

export function getSpreadsheetParser(
  version: SpreadsheetParserVersion = DEFAULT_SPREADSHEET_PARSER,
): SpreadsheetParser {
  const parser = parsers[version];

  if (!parser) {
    throw new Error(`Parser de planilha não encontrado: ${version}`);
  }

  return parser;
}

export function listSpreadsheetParsers(): SpreadsheetParser[] {
  return Object.values(parsers);
}

export function parseSpreadsheet(
  input: SpreadsheetParseInput,
  version: SpreadsheetParserVersion = DEFAULT_SPREADSHEET_PARSER,
): SpreadsheetParseResult {
  return getSpreadsheetParser(version).parse(input);
}
