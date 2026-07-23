import { createClient } from "@/lib/supabase/server";
import {
  toPaginatedList,
  type PaginatedList,
} from "@/lib/admin-list-query";
import { getTeamLabelMap } from "@/services/teams/labels";
import type { ImportRecord, ImportStatus } from "@/types/import";
import type { ImportBatchOption } from "@/types/import-period";

export type CreateImportInput = {
  importedBy: string;
  teamId: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  cardsWithDeliveryCount?: number;
  sourceLabel: string;
  source?: string;
  notes?: string;
};

function mapImport(row: Record<string, unknown>): ImportRecord {
  return {
    id: String(row.id),
    imported_by: (row.imported_by as string | null) ?? null,
    team_id: (row.team_id as string | null) ?? null,
    archived_at: (row.archived_at as string | null) ?? null,
    period_start: (row.period_start as string | null) ?? null,
    period_end: (row.period_end as string | null) ?? null,
    source: String(row.source),
    status: row.status as ImportStatus,
    source_label: (row.source_label as string | null) ?? null,
    records_count: Number(row.records_count ?? 0),
    cards_with_delivery_count: Number(row.cards_with_delivery_count ?? 0),
    notes: (row.notes as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    started_at: (row.started_at as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function createImport(
  input: CreateImportInput,
): Promise<ImportRecord> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("imports")
    .insert({
      imported_by: input.importedBy,
      team_id: input.teamId,
      period_start: input.periodStart ?? null,
      period_end: input.periodEnd ?? null,
      cards_with_delivery_count: input.cardsWithDeliveryCount ?? 0,
      source: input.source ?? "spreadsheet",
      source_label: input.sourceLabel,
      status: "pending" satisfies ImportStatus,
      notes: input.notes ?? null,
      records_count: 0,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create import: ${error.message}`);
  }

  return mapImport(data);
}

export async function updateImportStatus(input: {
  importId: string;
  status: ImportStatus;
  recordsCount?: number;
  cardsWithDeliveryCount?: number;
  periodStart?: string | null;
  periodEnd?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}): Promise<ImportRecord> {
  const supabase = await createClient();

  const payload: Record<string, unknown> = {
    status: input.status,
  };

  if (input.recordsCount !== undefined) {
    payload.records_count = input.recordsCount;
  }
  if (input.cardsWithDeliveryCount !== undefined) {
    payload.cards_with_delivery_count = input.cardsWithDeliveryCount;
  }
  if (input.periodStart !== undefined) {
    payload.period_start = input.periodStart;
  }
  if (input.periodEnd !== undefined) {
    payload.period_end = input.periodEnd;
  }
  if (input.errorMessage !== undefined) {
    payload.error_message = input.errorMessage;
  }
  if (input.startedAt !== undefined) {
    payload.started_at = input.startedAt;
  }
  if (input.completedAt !== undefined) {
    payload.completed_at = input.completedAt;
  }

  const { data, error } = await supabase
    .from("imports")
    .update(payload)
    .eq("id", input.importId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update import: ${error.message}`);
  }

  const record = mapImport(data);
  return record;
}

async function loadTeamsById(
  teamIds: string[],
): Promise<
  Map<string, { name: string; code: string; jira_key_prefix: string }>
> {
  const map = new Map<
    string,
    { name: string; code: string; jira_key_prefix: string }
  >();
  const unique = Array.from(new Set(teamIds.filter(Boolean)));
  if (unique.length === 0) {
    return map;
  }

  const labels = await getTeamLabelMap(unique);
  for (const [id, label] of labels) {
    map.set(id, {
      name: label.name,
      code: label.code,
      jira_key_prefix: label.jiraKeyPrefix,
    });
  }

  return map;
}

export type ListRecentImportsInput = {
  limit?: number;
  teamId?: string | null;
  unassignedOnly?: boolean;
  q?: string | null;
};

export type ListImportsAdminPagedInput = {
  teamId?: string | null;
  unassignedOnly?: boolean;
  q?: string | null;
  page: number;
  pageSize: number;
};

export type ImportListItem = ImportRecord & {
  team_name: string | null;
  team_code: string | null;
  jira_key_prefix: string | null;
};

function sanitizeSearchTerm(value: string): string {
  return value
    .trim()
    .replace(/[%_,.()"\\]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function applyImportFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  input?: {
    teamId?: string | null;
    unassignedOnly?: boolean;
    q?: string | null;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  let next = query;

  if (input?.unassignedOnly) {
    next = next.is("team_id", null);
  } else if (input?.teamId) {
    next = next.eq("team_id", input.teamId);
  }

  const q = sanitizeSearchTerm(input?.q ?? "");
  if (q) {
    const pattern = `%${q}%`;
    next = next.or(
      `source_label.ilike."${pattern}",status.ilike."${pattern}",notes.ilike."${pattern}"`,
    );
  }

  return next;
}

async function attachTeamLabels(
  rows: ImportRecord[],
): Promise<ImportListItem[]> {
  const teams = await loadTeamsById(
    rows.map((row) => row.team_id).filter((id): id is string => Boolean(id)),
  );

  return rows.map((row) => {
    const team = row.team_id ? teams.get(row.team_id) : undefined;
    return {
      ...row,
      team_name: team?.name ?? null,
      team_code: team?.code ?? null,
      jira_key_prefix: team?.jira_key_prefix ?? null,
    };
  });
}

export async function listRecentImports(
  input: number | ListRecentImportsInput = 10,
): Promise<ImportListItem[]> {
  const options: ListRecentImportsInput =
    typeof input === "number" ? { limit: input } : input;
  const limit = options.limit ?? 10;

  const supabase = await createClient();

  let query = supabase
    .from("imports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  query = applyImportFilters(query, options);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list imports: ${error.message}`);
  }

  return attachTeamLabels((data ?? []).map((row) => mapImport(row)));
}

/** Paginated imports admin list. Filters only by team_id (+ optional q). */
export async function listImportsAdminPaged(
  input: ListImportsAdminPagedInput,
): Promise<PaginatedList<ImportListItem>> {
  const supabase = await createClient();
  const pageSize = Math.max(1, input.pageSize);
  const requestedPage = Math.max(1, Math.floor(input.page));

  let countQuery = supabase
    .from("imports")
    .select("id", { count: "exact", head: true });
  countQuery = applyImportFilters(countQuery, input);

  const { count, error: countError } = await countQuery;
  if (countError) {
    throw new Error(`Failed to count imports: ${countError.message}`);
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const page = Math.min(requestedPage, totalPages);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("imports")
    .select("*")
    .order("created_at", { ascending: false })
    .range(from, to);

  query = applyImportFilters(query, input);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list imports: ${error.message}`);
  }

  const items = await attachTeamLabels(
    (data ?? []).map((row) => mapImport(row)),
  );

  return toPaginatedList({ items, total, page, pageSize });
}

/**
 * Active (non-archived) completed batches for selectors.
 * Legacy imports without team_id remain visible.
 */
export async function listImportBatches(input?: {
  includeArchived?: boolean;
  teamId?: string | null;
}): Promise<ImportBatchOption[]> {
  const supabase = await createClient();

  let query = supabase
    .from("imports")
    .select(
      `
      id,
      period_start,
      period_end,
      source_label,
      records_count,
      cards_with_delivery_count,
      team_id,
      archived_at
    `,
    )
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  if (!input?.includeArchived) {
    query = query.is("archived_at", null);
  }

  if (input?.teamId) {
    query = query.eq("team_id", input.teamId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list import batches: ${error.message}`);
  }

  const rows = data ?? [];
  const teams = await loadTeamsById(
    rows
      .map((row) => row.team_id as string | null)
      .filter((id): id is string => Boolean(id)),
  );

  return rows.map((row) => {
    const team = row.team_id ? teams.get(row.team_id) : undefined;
    return {
      id: row.id,
      period_start: row.period_start,
      period_end: row.period_end,
      source_label: row.source_label,
      records_count: row.records_count,
      cards_with_delivery_count: row.cards_with_delivery_count ?? 0,
      team_id: row.team_id,
      team_name: team?.name ?? null,
      team_code: team?.code ?? null,
      jira_key_prefix: team?.jira_key_prefix ?? null,
      archived_at: row.archived_at,
    };
  });
}

/** @deprecated Prefer listImportBatches */
export async function listImportPeriods(): Promise<ImportBatchOption[]> {
  return listImportBatches();
}
