export type AnalystTaskStatus = "running" | "paused" | "completed";

export type AnalystTask = {
  id: string;
  developer_id: string;
  developer_name: string | null;
  description: string;
  details: string | null;
  started_at: string;
  ended_at: string | null;
  /** Set while status is paused; cleared on resume/complete. */
  paused_at: string | null;
  /** Accumulated paused milliseconds across prior pause intervals. */
  total_paused_ms: number;
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
  /**
   * Horas realizadas: união líquida dos intervalos do dia (sem duplicar
   * simultaneidade). Mantido em `hours` por compatibilidade com o calendário.
   */
  hours: number;
  /** Soma simples das durações líquidas lançadas no dia. */
  launched_hours: number;
  /** Excesso lançado por simultaneidade: launched − realized. */
  conflict_hours: number;
  /**
   * (conflict / realized) * 100, ou null quando não há horas realizadas.
   */
  simultaneity_percent: number | null;
  task_count: number;
  urgent_hours: number;
  contracted_hours: number;
  /** Saldo do dia: horas realizadas − jornada contratada. */
  delta_hours: number;
  is_holiday: boolean;
};

export type AnalystTaskMetrics = {
  total_tasks: number;
  /** Soma mensal das horas realizadas (uniões diárias), em bruto antes do format. */
  total_hours: number;
  /** Soma mensal das horas lançadas. */
  total_launched_hours: number;
  /** Soma mensal das horas conflitantes. */
  total_conflict_hours: number;
  average_hours: number | null;
  urgent_hours: number;
  contracted_hours: number;
  /** Saldo mensal: horas realizadas − jornada mensal contratada. */
  delta_hours: number;
  daily: AnalystTaskDay[];
};

/** Net elapsed ms excluding completed pauses (and the open pause if currently paused). */
export function analystTaskElapsedMs(
  task: Pick<
    AnalystTask,
    "started_at" | "ended_at" | "paused_at" | "total_paused_ms" | "status"
  >,
  nowMs: number = Date.now(),
): number {
  const startedMs = new Date(task.started_at).getTime();
  const endMs =
    task.ended_at != null ? new Date(task.ended_at).getTime() : nowMs;
  let pausedMs = Math.max(0, Number(task.total_paused_ms) || 0);
  if (task.status === "paused" && task.paused_at) {
    pausedMs += Math.max(0, nowMs - new Date(task.paused_at).getTime());
  }
  return Math.max(0, endMs - startedMs - pausedMs);
}
