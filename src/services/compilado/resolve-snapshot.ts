import "server-only";

import type { CompiladoDateRange } from "@/lib/metrics/date-range";
import {
  batchPeriodOverlapsRange,
  importSourcesForCompiladoMode,
  mapImportSourceToResolved,
  snapshotCapturedAt,
  type CompiladoResolvedSource,
  type CompiladoSourceMode,
} from "@/lib/metrics/gestor-data-source";
import { listImportBatches } from "@/services/imports";
import { listJiraIntegrations } from "@/services/integrations/jira";
import type { ImportBatchOption } from "@/types/import-period";

export type CompiladoSnapshotProvenance = {
  resolvedSource: CompiladoResolvedSource;
  resolvedAt: string;
  resolutionReason: string;
  importId: string;
  auditMode: CompiladoSourceMode;
  /** Newest successful Jira Cloud sync for the batch team (informational). */
  jiraCloudSyncAt: string | null;
  /**
   * True when Cloud sync finished after the Compilado snapshot but sync is
   * not yet bridged into Compilado-shaped metrics.
   */
  jiraCloudNewerThanSnapshot: boolean;
};

export type ResolvedCompiladoSnapshot = {
  batches: ImportBatchOption[];
  selectedBatch: ImportBatchOption | null;
  provenance: CompiladoSnapshotProvenance | null;
  /**
   * True when selection came from auto/audit resolution (not an explicit
   * `importId` override in the URL).
   */
  usedAutoResolution: boolean;
};

function compareSnapshotRecency(a: ImportBatchOption, b: ImportBatchOption): number {
  const aAt = snapshotCapturedAt(a) ?? "";
  const bAt = snapshotCapturedAt(b) ?? "";
  if (aAt !== bAt) {
    return bAt.localeCompare(aAt);
  }
  return b.id.localeCompare(a.id);
}

function pickNewestOverlapping(
  batches: ImportBatchOption[],
  dateRange: CompiladoDateRange | null,
): ImportBatchOption | null {
  if (batches.length === 0) {
    return null;
  }

  const overlapping =
    dateRange != null
      ? batches.filter((batch) => batchPeriodOverlapsRange(batch, dateRange))
      : batches;

  const pool = overlapping.length > 0 ? overlapping : batches;
  const sorted = [...pool].sort(compareSnapshotRecency);
  return sorted[0] ?? null;
}

function buildReason(input: {
  mode: CompiladoSourceMode;
  winner: ImportBatchOption;
  usedExplicitImportId: boolean;
  overlappingPreferred: boolean;
}): string {
  const source = mapImportSourceToResolved(input.winner.source);
  const sourceLabel = source === "manual" ? "manual (planilha)" : "Jira (lote Compilado)";
  const when = snapshotCapturedAt(input.winner);

  if (input.usedExplicitImportId) {
    return `Lote escolhido manualmente (${sourceLabel}${when ? `, capturado em ${when}` : ""}).`;
  }

  if (input.mode === "manuais") {
    return `Auditoria: snapshot manual mais recente${when ? ` (${when})` : ""}.`;
  }
  if (input.mode === "jira") {
    return `Auditoria: snapshot Jira Compilado mais recente${when ? ` (${when})` : ""}.`;
  }

  if (input.overlappingPreferred) {
    return `Automático: snapshot Compilado mais recente que cobre o período (${sourceLabel}${when ? `, ${when}` : ""}).`;
  }

  return `Automático: nenhum lote cobre o período; usando o snapshot Compilado mais recente disponível (${sourceLabel}${when ? `, ${when}` : ""}).`;
}

async function latestJiraCloudSyncAt(
  teamId: string | null,
): Promise<string | null> {
  if (!teamId) {
    return null;
  }

  try {
    const integrations = await listJiraIntegrations();
    const forTeam = integrations.filter((row) => row.team_id === teamId);
    let latest: string | null = null;
    for (const row of forTeam) {
      const at = row.last_successful_sync_at;
      if (at && (!latest || at > latest)) {
        latest = at;
      }
    }
    return latest;
  } catch {
    return null;
  }
}

/**
 * Unified Compilado snapshot resolution for Gestor and developer home.
 *
 * - Never mixes cards across imports: one winning `import_id`.
 * - Default (`auto`): newest Compilado batch by `completed_at` (fallback
 *   `updated_at` / `created_at`), preferring period overlap with the filter.
 * - Audit modes force Manual or Jira-labeled Compilado batches only.
 * - Explicit `importId` wins over auto (still reports provenance).
 * - Jira Cloud becomes a candidate after `materializeJiraCompiladoSnapshot`
 *   writes `imports.source=jira` (+ cards); until then only spreadsheet batches
 *   compete (Cloud freshness is informational via provenance).
 */
export async function resolveCompiladoSnapshot(input: {
  mode?: CompiladoSourceMode;
  importId?: string | null;
  dateRange?: CompiladoDateRange | null;
  teamId?: string | null;
}): Promise<ResolvedCompiladoSnapshot> {
  const mode = input.mode ?? "auto";
  const sources = importSourcesForCompiladoMode(mode);

  const batches = await listImportBatches({
    sources,
    teamId: input.teamId,
  });

  const explicit =
    input.importId != null
      ? (batches.find((batch) => batch.id === input.importId) ?? null)
      : null;

  const overlappingPreferred =
    input.dateRange != null &&
    batches.some((batch) => batchPeriodOverlapsRange(batch, input.dateRange!));

  const selectedBatch =
    explicit ?? pickNewestOverlapping(batches, input.dateRange ?? null);

  if (selectedBatch == null) {
    return {
      batches,
      selectedBatch: null,
      provenance: null,
      usedAutoResolution: explicit == null,
    };
  }

  const resolvedAt =
    snapshotCapturedAt(selectedBatch) ?? selectedBatch.created_at ?? new Date(0).toISOString();
  const resolvedSource = mapImportSourceToResolved(selectedBatch.source);
  const jiraCloudSyncAt = await latestJiraCloudSyncAt(
    selectedBatch.team_id ?? input.teamId ?? null,
  );
  const jiraCloudNewerThanSnapshot = Boolean(
    jiraCloudSyncAt && jiraCloudSyncAt > resolvedAt,
  );

  return {
    batches,
    selectedBatch,
    provenance: {
      resolvedSource,
      resolvedAt,
      resolutionReason: buildReason({
        mode,
        winner: selectedBatch,
        usedExplicitImportId: explicit != null,
        overlappingPreferred,
      }),
      importId: selectedBatch.id,
      auditMode: mode,
      jiraCloudSyncAt,
      jiraCloudNewerThanSnapshot,
    },
    usedAutoResolution: explicit == null,
  };
}
