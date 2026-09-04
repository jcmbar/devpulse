import "server-only";

import {
  localDatesSpannedByInterval,
  msToHours,
  summarizeTasksForDay,
} from "@/lib/analyst-tasks/simultaneous-hours";
import { listDatesInMonth } from "@/lib/metrics/business-days";
import { createClient } from "@/lib/supabase/server";
import type {
  AnalystTask,
  AnalystTaskDay,
  AnalystTaskMetrics,
  AnalystTaskStatus,
} from "@/types/analyst-task";
import { analystTaskElapsedMs } from "@/types/analyst-task";

const BRAZIL_OFFSET = "-03:00";

function roundHours(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function monthBounds(yearMonth: string): { start: string; end: string } {
  const [year, month] = yearMonth.split("-").map(Number);
  const start = `${yearMonth}-01`;
  const nextMonth =
    month === 12
      ? `${year + 1}-01`
      : `${year}-${String(month + 1).padStart(2, "0")}`;
  return {
    start: `${start}T00:00:00${BRAZIL_OFFSET}`,
    end: `${nextMonth}-01T00:00:00${BRAZIL_OFFSET}`,
  };
}

function mapTask(row: Record<string, unknown>): AnalystTask {
  const startedAt = String(row.started_at);
  const endedAt = (row.ended_at as string | null) ?? null;
  const pausedAt = (row.paused_at as string | null) ?? null;
  const totalPausedMs = Math.max(0, Number(row.total_paused_ms) || 0);
  const status = String(row.status) as AnalystTaskStatus;
  const durationHours =
    endedAt == null
      ? null
      : roundHours(
          analystTaskElapsedMs(
            {
              started_at: startedAt,
              ended_at: endedAt,
              paused_at: null,
              total_paused_ms: totalPausedMs,
              status: "completed",
            },
            new Date(endedAt).getTime(),
          ) / 3_600_000,
        );

  return {
    id: String(row.id),
    developer_id: String(row.developer_id),
    developer_name: (row.developer_name as string | null) ?? null,
    description: String(row.description),
    details: (row.details as string | null) ?? null,
    started_at: startedAt,
    ended_at: endedAt,
    paused_at: pausedAt,
    total_paused_ms: totalPausedMs,
    status,
    is_urgent: Boolean(row.is_urgent),
    source: "devpulse",
    duration_hours: durationHours,
    deleted_at: (row.deleted_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listAnalystTasksForMonth(input: {
  developerId: string;
  yearMonth: string;
}): Promise<AnalystTask[]> {
  const bounds = monthBounds(input.yearMonth);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("analyst_tasks")
    .select("*")
    .eq("developer_id", input.developerId)
    .is("deleted_at", null)
    .gte("started_at", bounds.start)
    .lt("started_at", bounds.end)
    .order("started_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao carregar tarefas de analista: ${error.message}`);
  }

  return (data ?? []).map((row) => mapTask(row as Record<string, unknown>));
}

export async function listActiveAnalystTasks(
  developerId: string,
): Promise<AnalystTask[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("analyst_tasks")
    .select("*")
    .eq("developer_id", developerId)
    .in("status", ["running", "paused"])
    .is("deleted_at", null)
    .order("started_at", { ascending: false });

  if (error) {
    throw new Error(`Falha ao carregar tarefas ativas: ${error.message}`);
  }

  return (data ?? []).map((row) => mapTask(row as Record<string, unknown>));
}

export function computeAnalystTaskMetrics(input: {
  tasks: AnalystTask[];
  yearMonth: string;
  contractedHoursPerDay: number;
  contractedHoursPerMonth: number;
  holidayDates?: Set<string>;
}): AnalystTaskMetrics {
  const dates = listDatesInMonth(
    Number(input.yearMonth.slice(0, 4)),
    Number(input.yearMonth.slice(5, 7)),
  );
  const holidayDates = input.holidayDates ?? new Set<string>();
  const daily = new Map<string, AnalystTaskDay>(
    dates.map((date) => {
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const isHoliday = holidayDates.has(date);
      const contractedHours =
        weekday === 0 || weekday === 6 || isHoliday
          ? 0
          : Math.max(0, input.contractedHoursPerDay);
      return [
        date,
        {
          date,
          hours: 0,
          launched_hours: 0,
          conflict_hours: 0,
          simultaneity_percent: null,
          task_count: 0,
          urgent_hours: 0,
          contracted_hours: contractedHours,
          delta_hours: -contractedHours,
          is_holiday: isHoliday,
        },
      ];
    }),
  );

  const completed = input.tasks.filter(
    (task) =>
      task.status === "completed" &&
      task.ended_at != null &&
      task.duration_hours != null,
  );

  let totalTasks = 0;
  let urgentHours = 0;
  let sumDurationHours = 0;
  const tasksByDay = new Map<
    string,
    Array<{
      id: string;
      startedAt: string;
      endedAt: string;
      totalPausedMs: number;
      isUrgent: boolean;
    }>
  >();

  for (const task of completed) {
    totalTasks += 1;
    sumDurationHours += task.duration_hours ?? 0;
    if (task.is_urgent) {
      urgentHours += task.duration_hours ?? 0;
    }

    const interval = {
      id: task.id,
      startedAt: task.started_at,
      endedAt: task.ended_at!,
      totalPausedMs: Math.max(0, Number(task.total_paused_ms) || 0),
      isUrgent: task.is_urgent,
    };

    for (const date of localDatesSpannedByInterval(
      interval.startedAt,
      interval.endedAt,
    )) {
      if (!daily.has(date)) {
        continue;
      }
      const bucket = tasksByDay.get(date) ?? [];
      bucket.push(interval);
      tasksByDay.set(date, bucket);
    }
  }

  let totalRealizedMs = 0;
  let totalLaunchedMs = 0;
  let totalConflictMs = 0;

  for (const date of dates) {
    const day = daily.get(date);
    if (!day) {
      continue;
    }
    const dayTasks = tasksByDay.get(date) ?? [];
    day.task_count = dayTasks.length;

    if (dayTasks.length === 0) {
      day.delta_hours = -day.contracted_hours;
      continue;
    }

    const summary = summarizeTasksForDay(dayTasks, date);
    day.hours = summary.realizedHours;
    day.launched_hours = summary.launchedHours;
    day.conflict_hours = summary.conflictHours;
    day.simultaneity_percent = summary.simultaneityPercent;
    day.delta_hours = summary.realizedHours - day.contracted_hours;

    totalRealizedMs += summary.realizedMs;
    totalLaunchedMs += summary.launchedMs;
    totalConflictMs += summary.conflictMs;

    let urgentMs = 0;
    for (const task of dayTasks) {
      if (!task.isUrgent) {
        continue;
      }
      urgentMs += summarizeTasksForDay([task], date).launchedMs;
    }
    day.urgent_hours = msToHours(urgentMs);
  }

  const contractedHours = Math.max(0, input.contractedHoursPerMonth);
  const totalHours = msToHours(totalRealizedMs);
  const totalLaunchedHours = msToHours(totalLaunchedMs);
  const totalConflictHours = msToHours(totalConflictMs);

  return {
    total_tasks: totalTasks,
    total_hours: totalHours,
    total_launched_hours: totalLaunchedHours,
    total_conflict_hours: totalConflictHours,
    average_hours:
      totalTasks > 0 ? roundHours(sumDurationHours / totalTasks) : null,
    urgent_hours: roundHours(urgentHours),
    contracted_hours: contractedHours,
    delta_hours: totalHours - contractedHours,
    daily: [...daily.values()],
  };
}

export function validateAnalystTaskStatus(status: string): AnalystTaskStatus {
  if (status === "running" || status === "paused" || status === "completed") {
    return status;
  }
  throw new Error("Status de tarefa inválido.");
}

export async function pauseAnalystTask(taskId: string): Promise<void> {
  const supabase = await createClient();
  const { data, error: loadError } = await supabase
    .from("analyst_tasks")
    .select("id, status")
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();
  if (loadError) {
    throw new Error(`Falha ao carregar tarefa: ${loadError.message}`);
  }
  if (!data) {
    throw new Error("Tarefa não encontrada.");
  }
  if (data.status !== "running") {
    throw new Error("Só é possível pausar uma tarefa em andamento.");
  }

  const { error } = await supabase
    .from("analyst_tasks")
    .update({
      status: "paused",
      paused_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .eq("status", "running")
    .is("deleted_at", null);
  if (error) {
    throw new Error(`Não foi possível pausar a tarefa: ${error.message}`);
  }
}

export async function resumeAnalystTask(taskId: string): Promise<void> {
  const supabase = await createClient();
  const { data, error: loadError } = await supabase
    .from("analyst_tasks")
    .select("id, status, paused_at, total_paused_ms")
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();
  if (loadError) {
    throw new Error(`Falha ao carregar tarefa: ${loadError.message}`);
  }
  if (!data) {
    throw new Error("Tarefa não encontrada.");
  }
  if (data.status !== "paused" || !data.paused_at) {
    throw new Error("Só é possível continuar uma tarefa pausada.");
  }

  const pausedAtMs = new Date(String(data.paused_at)).getTime();
  const added = Math.max(0, Date.now() - pausedAtMs);
  const totalPausedMs = Math.max(0, Number(data.total_paused_ms) || 0) + added;

  const { error } = await supabase
    .from("analyst_tasks")
    .update({
      status: "running",
      paused_at: null,
      total_paused_ms: totalPausedMs,
    })
    .eq("id", taskId)
    .eq("status", "paused")
    .is("deleted_at", null);
  if (error) {
    throw new Error(`Não foi possível continuar a tarefa: ${error.message}`);
  }
}
