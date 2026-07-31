/**
 * Compilado snapshot source modes and provenance helpers.
 *
 * Compilado-shaped data lives in `imports` + `jira_cards`.
 * Jira Cloud sync is bridged via `materializeJiraCompiladoSnapshot`
 * (`imports.source = "jira"`). Manual uploads use `source = "spreadsheet"`.
 */

export const COMPILADO_SOURCE_MODES = ["auto", "manuais", "jira"] as const;

export type CompiladoSourceMode = (typeof COMPILADO_SOURCE_MODES)[number];

/** Provenance label for the winning Compilado snapshot. */
export type CompiladoResolvedSource = "manual" | "jira";

/** Values stored on `imports.source`. */
export type ImportBatchSource = "spreadsheet" | "jira" | string;

/** @deprecated Prefer CompiladoSourceMode — kept for gradual rename. */
export type GestorDataSource = CompiladoSourceMode;

export const GESTOR_DATA_SOURCES = COMPILADO_SOURCE_MODES;

export function parseCompiladoSourceMode(
  value: string | null | undefined,
): CompiladoSourceMode {
  if (value === "manuais" || value === "jira" || value === "auto") {
    return value;
  }
  // Legacy bookmark: "ambos" meant consider all sources → auto resolution.
  if (value === "ambos") {
    return "auto";
  }
  return "auto";
}

/** @deprecated Prefer parseCompiladoSourceMode */
export function parseGestorDataSource(
  value: string | null | undefined,
): CompiladoSourceMode {
  return parseCompiladoSourceMode(value);
}

export function compiladoSourceModeLabel(mode: CompiladoSourceMode): string {
  switch (mode) {
    case "auto":
      return "Automático (mais recente)";
    case "manuais":
      return "Auditoria · Manuais";
    case "jira":
      return "Auditoria · Integração Jira";
  }
}

/** @deprecated Prefer compiladoSourceModeLabel */
export function gestorDataSourceLabel(mode: CompiladoSourceMode): string {
  return compiladoSourceModeLabel(mode);
}

export function resolvedSourceLabel(source: CompiladoResolvedSource): string {
  switch (source) {
    case "manual":
      return "Manual";
    case "jira":
      return "Jira Integração";
  }
}

/**
 * Maps audit mode → `imports.source` filter.
 * `auto` considers every Compilado batch (no SQL filter).
 */
export function importSourcesForCompiladoMode(
  mode: CompiladoSourceMode,
): ImportBatchSource[] | null {
  switch (mode) {
    case "auto":
      return null;
    case "manuais":
      return ["spreadsheet"];
    case "jira":
      return ["jira"];
  }
}

/** @deprecated Prefer importSourcesForCompiladoMode */
export function importSourcesForGestorFilter(
  filter: CompiladoSourceMode,
): ImportBatchSource[] | null {
  return importSourcesForCompiladoMode(filter);
}

export function mapImportSourceToResolved(
  importSource: string | null | undefined,
): CompiladoResolvedSource {
  if (importSource === "jira" || importSource === "jira_sync") {
    return "jira";
  }
  return "manual";
}

export function snapshotCapturedAt(input: {
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}): string | null {
  return input.completed_at ?? input.updated_at ?? input.created_at ?? null;
}

export function batchPeriodOverlapsRange(
  batch: { period_start: string | null; period_end: string | null },
  range: { start: string; end: string },
): boolean {
  if (!batch.period_start || !batch.period_end) {
    return true;
  }
  return batch.period_start <= range.end && batch.period_end >= range.start;
}
