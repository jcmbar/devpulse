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

/**
 * Dashboard resolution that may merge one winning Compilado batch per team
 * when viewing all teams (same rule as Folha Jira hours).
 */
export type ResolvedCompiladoDashboardSnapshot = ResolvedCompiladoSnapshot & {
  /** Import ids whose cards must be loaded (deduped). */
  winningImportIds: string[];
  /** True when metrics come from multiple per-team snapshots. */
  mergedAcrossTeams: boolean;
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

function buildMergedReason(input: {
  mode: CompiladoSourceMode;
  winners: ImportBatchOption[];
  reference: ImportBatchOption;
}): string {
  const n = input.winners.length;
  const when = snapshotCapturedAt(input.reference);
  const refLabel =
    input.reference.team_name?.trim() ||
    mapImportSourceToResolved(input.reference.source);

  if (input.mode === "manuais") {
    return `Auditoria: métricas mescladas de ${n} snapshots manuais (um por time). Referência na UI: ${refLabel}${when ? ` (${when})` : ""}.`;
  }
  if (input.mode === "jira") {
    return `Auditoria: métricas mescladas de ${n} snapshots Jira Compilado (um por time). Referência na UI: ${refLabel}${when ? ` (${when})` : ""}.`;
  }

  return `Automático: métricas mescladas de ${n} snapshots Compilado (um por time). Referência na UI: ${refLabel}${when ? ` (${when})` : ""}.`;
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

function toSingleDashboardSnapshot(
  resolved: ResolvedCompiladoSnapshot,
): ResolvedCompiladoDashboardSnapshot {
  return {
    ...resolved,
    winningImportIds: resolved.selectedBatch ? [resolved.selectedBatch.id] : [],
    mergedAcrossTeams: false,
  };
}

/**
 * Resolve Compilado for the Gestor dashboard.
 *
 * Batches are per team. When viewing all teams without an explicit `importId`,
 * picks one winning snapshot per team and merges card loads — a single global
 * winner would zero out people from other teams (same rule as Folha).
 */
export async function resolveCompiladoSnapshotsForDashboard(input: {
  mode?: CompiladoSourceMode;
  importId?: string | null;
  dateRange?: CompiladoDateRange | null;
  teamId?: string | null;
  /** Distinct team ids among developers in scope (include `null` for unassigned). */
  teamIds: Array<string | null>;
}): Promise<ResolvedCompiladoDashboardSnapshot> {
  const mode = input.mode ?? "auto";
  const scopedTeamId = input.teamId?.trim() || null;
  const explicitImportId = input.importId?.trim() || null;

  if (scopedTeamId || explicitImportId) {
    return toSingleDashboardSnapshot(
      await resolveCompiladoSnapshot({
        mode,
        importId: explicitImportId,
        dateRange: input.dateRange,
        teamId: scopedTeamId,
      }),
    );
  }

  const uniqueTeamIds = [...new Set(input.teamIds)];
  if (uniqueTeamIds.length <= 1) {
    return toSingleDashboardSnapshot(
      await resolveCompiladoSnapshot({
        mode,
        importId: null,
        dateRange: input.dateRange,
        teamId: uniqueTeamIds[0] ?? null,
      }),
    );
  }

  const sources = importSourcesForCompiladoMode(mode);
  const [batches, perTeam] = await Promise.all([
    listImportBatches({ sources, teamId: null }),
    Promise.all(
      uniqueTeamIds.map(async (teamId) => {
        const resolved = await resolveCompiladoSnapshot({
          mode,
          importId: null,
          dateRange: input.dateRange,
          teamId,
        });
        return { teamId, selectedBatch: resolved.selectedBatch };
      }),
    ),
  ]);

  const winnersById = new Map<string, ImportBatchOption>();
  for (const entry of perTeam) {
    if (entry.selectedBatch) {
      winnersById.set(entry.selectedBatch.id, entry.selectedBatch);
    }
  }

  const winners = [...winnersById.values()].sort(compareSnapshotRecency);
  const selectedBatch = winners[0] ?? null;
  const winningImportIds = winners.map((batch) => batch.id);

  if (selectedBatch == null) {
    return {
      batches,
      selectedBatch: null,
      provenance: null,
      usedAutoResolution: true,
      winningImportIds: [],
      mergedAcrossTeams: false,
    };
  }

  const mergedAcrossTeams = winners.length > 1;
  const resolvedAt =
    snapshotCapturedAt(selectedBatch) ??
    selectedBatch.created_at ??
    new Date(0).toISOString();
  const resolvedSource = mapImportSourceToResolved(selectedBatch.source);

  const cloudSyncAts = await Promise.all(
    winners.map((batch) => latestJiraCloudSyncAt(batch.team_id ?? null)),
  );
  let jiraCloudSyncAt: string | null = null;
  for (const at of cloudSyncAts) {
    if (at && (!jiraCloudSyncAt || at > jiraCloudSyncAt)) {
      jiraCloudSyncAt = at;
    }
  }
  const jiraCloudNewerThanSnapshot = Boolean(
    jiraCloudSyncAt && jiraCloudSyncAt > resolvedAt,
  );

  return {
    batches,
    selectedBatch,
    provenance: {
      resolvedSource,
      resolvedAt,
      resolutionReason: mergedAcrossTeams
        ? buildMergedReason({ mode, winners, reference: selectedBatch })
        : buildReason({
            mode,
            winner: selectedBatch,
            usedExplicitImportId: false,
            overlappingPreferred:
              input.dateRange != null &&
              batchPeriodOverlapsRange(selectedBatch, input.dateRange),
          }),
      importId: selectedBatch.id,
      auditMode: mode,
      jiraCloudSyncAt,
      jiraCloudNewerThanSnapshot,
    },
    usedAutoResolution: true,
    winningImportIds,
    mergedAcrossTeams,
  };
}
