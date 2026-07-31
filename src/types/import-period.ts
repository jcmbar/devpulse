export type ImportBatchOption = {
  id: string;
  period_start: string | null;
  period_end: string | null;
  /** Discriminator on `imports.source` (e.g. spreadsheet | jira). */
  source: string;
  source_label: string | null;
  records_count: number;
  cards_with_delivery_count: number;
  team_id: string | null;
  team_name: string | null;
  team_code: string | null;
  jira_key_prefix: string | null;
  archived_at: string | null;
  /** Prefer for recency: when the Compilado batch finished. */
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

/** @deprecated Prefer ImportBatchOption — kept for gradual migration. */
export type ImportPeriod = ImportBatchOption;
