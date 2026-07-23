export type ImportStatus = "pending" | "processing" | "completed" | "failed";

export type ImportRecord = {
  id: string;
  imported_by: string | null;
  team_id: string | null;
  archived_at: string | null;
  /** Detected min delivery date (or legacy manual start). */
  period_start: string | null;
  /** Detected max delivery date (or legacy manual end). */
  period_end: string | null;
  source: string;
  status: ImportStatus;
  source_label: string | null;
  records_count: number;
  cards_with_delivery_count: number;
  notes: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
