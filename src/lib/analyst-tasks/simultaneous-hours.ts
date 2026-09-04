/**
 * Simultaneous-task hour analysis for analyst day summaries.
 *
 * Pause limitation: `analyst_tasks` stores only `total_paused_ms`, not exact pause
 * intervals. The same proportional wall-clock scale used by
 * `computeAnalystTaskMetrics` is applied here so launched / realized / conflict
 * stay consistent: each completed task contributes `netMs / wallMs` density
 * across its wall interval.
 */

/** Keep in sync with `APP_DISPLAY_TIME_ZONE` in format-brazil.ts */
export const ANALYST_TASK_DISPLAY_TIME_ZONE = "America/Sao_Paulo";
const BRAZIL_OFFSET = "-03:00";

/** Near-zero guard for residual float noise (ms). */
export const SIMULTANEITY_MS_EPSILON = 1;

/** Near-zero guard when comparing hour identities after conversion. */
export const SIMULTANEITY_HOURS_EPSILON = 1e-9;

/**
 * Simultaneity % alert bands (exclusive lower bound except none === 0).
 * 0% → none; (0, 15] → low; (15, 35] → attention; (35, 60] → high; >60 → critical.
 */
export const SIMULTANEITY_ALERT_THRESHOLDS = {
  none: 0,
  low: 15,
  attention: 35,
  high: 60,
} as const;

export type SimultaneityAlertLevel =
  | "none"
  | "low"
  | "attention"
  | "high"
  | "critical";

export type TaskIntervalInput = {
  id: string;
  startedAt: string;
  endedAt: string;
  /** Accumulated pause ms across the wall interval (completed pauses only). */
  totalPausedMs?: number;
};

export type WorkInterval = {
  taskId: string;
  /** Inclusive start, exclusive end (UTC ms). */
  startMs: number;
  endMs: number;
  /** Density in [0, 1] — netMs / wallMs when pauses exist. */
  scale: number;
};

export type SimultaneityWindow = {
  /** Minutes from local day start (inclusive). */
  startMinutes: number;
  /** Minutes from local day start (exclusive). */
  endMinutes: number;
  maxConcurrency: number;
  taskIds: string[];
};

export type DaySimultaneitySummary = {
  /** Sum of valid net durations (ms). */
  launchedMs: number;
  /** Union of work occupancy (ms), counting each instant at most once (capped density). */
  realizedMs: number;
  /** launchedMs − realizedMs. */
  conflictMs: number;
  launchedHours: number;
  realizedHours: number;
  conflictHours: number;
  simultaneityPercent: number | null;
  alertLevel: SimultaneityAlertLevel;
  windows: SimultaneityWindow[];
};

function localDateFromInstant(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ANALYST_TASK_DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function localDateStartMs(dateIso: string): number {
  return Date.parse(`${dateIso}T00:00:00${BRAZIL_OFFSET}`);
}

function nextLocalDate(dateIso: string): string {
  const value = new Date(`${dateIso}T12:00:00${BRAZIL_OFFSET}`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export function normalizeNearZeroMs(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.abs(value) < SIMULTANEITY_MS_EPSILON ? 0 : value;
}

export function msToHours(ms: number): number {
  return normalizeNearZeroMs(ms) / 3_600_000;
}

export function resolveSimultaneityAlertLevel(
  percent: number | null,
): SimultaneityAlertLevel {
  if (percent == null || !Number.isFinite(percent) || percent <= 0) {
    return "none";
  }
  if (percent <= SIMULTANEITY_ALERT_THRESHOLDS.low) {
    return "low";
  }
  if (percent <= SIMULTANEITY_ALERT_THRESHOLDS.attention) {
    return "attention";
  }
  if (percent <= SIMULTANEITY_ALERT_THRESHOLDS.high) {
    return "high";
  }
  return "critical";
}

/**
 * Build per-day wall intervals with proportional pause density.
 * Invalid or zero-net tasks are skipped.
 */
export function buildWorkIntervalsForDay(
  tasks: TaskIntervalInput[],
  dateIso: string,
): WorkInterval[] {
  const dayStart = localDateStartMs(dateIso);
  const dayEnd = localDateStartMs(nextLocalDate(dateIso));
  const intervals: WorkInterval[] = [];

  for (const task of tasks) {
    const startMs = new Date(task.startedAt).getTime();
    const endMs = new Date(task.endedAt).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      continue;
    }

    const wallMs = endMs - startMs;
    const pausedMs = Math.max(0, Number(task.totalPausedMs) || 0);
    const netMs = Math.max(0, wallMs - pausedMs);
    if (netMs <= 0 || wallMs <= 0) {
      continue;
    }
    const scale = netMs / wallMs;

    const sliceStart = Math.max(startMs, dayStart);
    const sliceEnd = Math.min(endMs, dayEnd);
    if (sliceEnd <= sliceStart) {
      continue;
    }

    intervals.push({
      taskId: task.id,
      startMs: sliceStart,
      endMs: sliceEnd,
      scale,
    });
  }

  return intervals;
}

/**
 * Dates (local SP) touched by a task wall interval, for midnight splits.
 */
export function localDatesSpannedByInterval(
  startedAt: string,
  endedAt: string,
): string[] {
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(endedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [];
  }
  const dates: string[] = [];
  let date = localDateFromInstant(startedAt);
  const endDate = localDateFromInstant(endedAt);
  while (date <= endDate) {
    dates.push(date);
    if (date === endDate) {
      break;
    }
    date = nextLocalDate(date);
  }
  return dates;
}

type SweepEvent = {
  ms: number;
  kind: "start" | "end";
  taskId: string;
  scale: number;
};

function sortedUniqueTaskIds(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort();
}

function sameTaskIdList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

/**
 * Sweep-line over work intervals for one local day.
 *
 * At each instant with active scales sᵢ:
 * - launched density = Σ sᵢ
 * - realized density = min(1, Σ sᵢ)
 * so pauses shrink density proportionally and
 * conflictMs = launchedMs − realizedMs always holds (within epsilon).
 *
 * UI windows use task count ≥ 2 (adjacency with end === start is not a conflict).
 */
export function summarizeDaySimultaneity(
  intervals: WorkInterval[],
  dateIso: string,
): DaySimultaneitySummary {
  const dayStart = localDateStartMs(dateIso);
  const events: SweepEvent[] = [];

  for (const interval of intervals) {
    if (interval.endMs <= interval.startMs || interval.scale <= 0) {
      continue;
    }
    events.push({
      ms: interval.startMs,
      kind: "start",
      taskId: interval.taskId,
      scale: interval.scale,
    });
    events.push({
      ms: interval.endMs,
      kind: "end",
      taskId: interval.taskId,
      scale: interval.scale,
    });
  }

  events.sort((a, b) => {
    if (a.ms !== b.ms) {
      return a.ms - b.ms;
    }
    // Process ends before starts at the same instant so adjacent tasks never overlap.
    if (a.kind !== b.kind) {
      return a.kind === "end" ? -1 : 1;
    }
    return a.taskId.localeCompare(b.taskId);
  });

  const active = new Map<string, number>();
  let launchedMs = 0;
  let realizedMs = 0;
  let cursor: number | null = null;

  type OpenWindow = {
    startMs: number;
    taskIds: string[];
    maxConcurrency: number;
  };
  const windowState: { open: OpenWindow | null } = { open: null };
  const rawWindows: Array<{
    startMs: number;
    endMs: number;
    taskIds: string[];
    maxConcurrency: number;
  }> = [];

  function activeSnapshot(): { sumScale: number; taskIds: string[]; count: number } {
    let sumScale = 0;
    const taskIds: string[] = [];
    for (const [taskId, scale] of active) {
      sumScale += scale;
      taskIds.push(taskId);
    }
    taskIds.sort();
    return { sumScale, taskIds, count: taskIds.length };
  }

  function flushSegment(untilMs: number) {
    if (cursor == null || untilMs <= cursor) {
      return;
    }
    const duration = untilMs - cursor;
    const snapshot = activeSnapshot();
    if (snapshot.count > 0 && snapshot.sumScale > 0) {
      launchedMs += duration * snapshot.sumScale;
      realizedMs += duration * Math.min(1, snapshot.sumScale);
    }

    if (snapshot.count >= 2) {
      if (
        windowState.open &&
        windowState.open.taskIds.length === snapshot.taskIds.length &&
        sameTaskIdList(windowState.open.taskIds, snapshot.taskIds)
      ) {
        windowState.open.maxConcurrency = Math.max(
          windowState.open.maxConcurrency,
          snapshot.count,
        );
      } else {
        if (windowState.open) {
          rawWindows.push({
            startMs: windowState.open.startMs,
            endMs: cursor,
            taskIds: windowState.open.taskIds,
            maxConcurrency: windowState.open.maxConcurrency,
          });
        }
        windowState.open = {
          startMs: cursor,
          taskIds: snapshot.taskIds,
          maxConcurrency: snapshot.count,
        };
      }
    } else if (windowState.open) {
      rawWindows.push({
        startMs: windowState.open.startMs,
        endMs: cursor,
        taskIds: windowState.open.taskIds,
        maxConcurrency: windowState.open.maxConcurrency,
      });
      windowState.open = null;
    }

    cursor = untilMs;
  }

  for (const event of events) {
    flushSegment(event.ms);
    if (cursor == null) {
      cursor = event.ms;
    }
    if (event.kind === "start") {
      active.set(event.taskId, event.scale);
    } else {
      active.delete(event.taskId);
    }
  }

  if (windowState.open && cursor != null) {
    rawWindows.push({
      startMs: windowState.open.startMs,
      endMs: cursor,
      taskIds: windowState.open.taskIds,
      maxConcurrency: windowState.open.maxConcurrency,
    });
  }

  launchedMs = normalizeNearZeroMs(launchedMs);
  realizedMs = normalizeNearZeroMs(realizedMs);
  let conflictMs = normalizeNearZeroMs(launchedMs - realizedMs);
  if (conflictMs < 0) {
    conflictMs = 0;
  }

  // Merge neighboring windows that share the same active set (and keep max concurrency).
  const merged: typeof rawWindows = [];
  for (const window of rawWindows) {
    if (window.endMs <= window.startMs) {
      continue;
    }
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.endMs === window.startMs &&
      sameTaskIdList(previous.taskIds, window.taskIds)
    ) {
      previous.endMs = window.endMs;
      previous.maxConcurrency = Math.max(
        previous.maxConcurrency,
        window.maxConcurrency,
      );
      continue;
    }
    merged.push({ ...window });
  }

  const windows: SimultaneityWindow[] = merged.map((window) => ({
    startMinutes: (window.startMs - dayStart) / 60_000,
    endMinutes: (window.endMs - dayStart) / 60_000,
    maxConcurrency: window.maxConcurrency,
    taskIds: sortedUniqueTaskIds(window.taskIds),
  }));

  const launchedHours = msToHours(launchedMs);
  const realizedHours = msToHours(realizedMs);
  const conflictHours = msToHours(conflictMs);

  const simultaneityPercent =
    realizedMs <= 0
      ? null
      : (conflictMs / realizedMs) * 100;

  return {
    launchedMs,
    realizedMs,
    conflictMs,
    launchedHours,
    realizedHours,
    conflictHours,
    simultaneityPercent,
    alertLevel: resolveSimultaneityAlertLevel(simultaneityPercent),
    windows,
  };
}

export function summarizeTasksForDay(
  tasks: TaskIntervalInput[],
  dateIso: string,
): DaySimultaneitySummary {
  return summarizeDaySimultaneity(
    buildWorkIntervalsForDay(tasks, dateIso),
    dateIso,
  );
}

/** Assert launched ≈ realized + conflict within tolerance. */
export function assertLaunchedIdentity(
  summary: Pick<
    DaySimultaneitySummary,
    "launchedHours" | "realizedHours" | "conflictHours"
  >,
): boolean {
  const delta = Math.abs(
    summary.launchedHours - (summary.realizedHours + summary.conflictHours),
  );
  return delta <= SIMULTANEITY_HOURS_EPSILON;
}
