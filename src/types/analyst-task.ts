export type AnalystTaskStatus = "running" | "completed";

export type AnalystTask = {
  id: string;
  developer_id: string;
  developer_name: string | null;
  description: string;
  started_at: string;
  ended_at: string | null;
  status: AnalystTaskStatus;
  is_urgent: boolean;
  source: "devpulse";
  duration_hours: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AnalystTaskDay = {
  date: string;
  hours: number;
  task_count: number;
  urgent_hours: number;
  contracted_hours: number;
  delta_hours: number;
  is_holiday: boolean;
};

export type AnalystTaskMetrics = {
  total_tasks: number;
  total_hours: number;
  average_hours: number | null;
  urgent_hours: number;
  contracted_hours: number;
  delta_hours: number;
  daily: AnalystTaskDay[];
};
