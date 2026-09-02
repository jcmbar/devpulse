import type { AnalystTask } from "@/types/analyst-task";

const SAO_PAULO = "America/Sao_Paulo";

export type TimelineSegment = {
  task: AnalystTask;
  startMinutes: number;
  endMinutes: number;
  hasOverlap: boolean;
};

export type TimelineOverlap = {
  startMinutes: number;
  endMinutes: number;
  taskIds: string[];
};

export type DayTimeline = {
  segments: TimelineSegment[];
  overlaps: TimelineOverlap[];
  rangeStartMinutes: number;
  rangeEndMinutes: number;
  hourLabels: string[];
};

function formatParts(instant: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: SAO_PAULO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(instant));
}

function partValue(parts: Intl.DateTimeFormatPart[], type: string): string {
  return parts.find((item) => item.type === type)?.value ?? "00";
}

export function isoDateFromInstant(instant: string): string {
  const parts = formatParts(instant);
  return `${partValue(parts, "year")}-${partValue(parts, "month")}-${partValue(parts, "day")}`;
}

function dayBoundsMinutes(dateIso: string): { start: number; end: number } {
  void dateIso;
  return { start: 0, end: 24 * 60 };
}

function clipSegmentToDay(input: {
  startedAt: string;
  endedAt: string;
  dateIso: string;
}): { startMinutes: number; endMinutes: number } | null {
  const dayStartMs = new Date(`${input.dateIso}T00:00:00-03:00`).getTime();
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
  const startMs = new Date(input.startedAt).getTime();
  const endMs = new Date(input.endedAt).getTime();
  if (endMs <= dayStartMs || startMs >= dayEndMs) {
    return null;
  }
  const clippedStart = Math.max(startMs, dayStartMs);
  const clippedEnd = Math.min(endMs, dayEndMs);
  return {
    startMinutes: (clippedStart - dayStartMs) / 60_000,
    endMinutes: (clippedEnd - dayStartMs) / 60_000,
  };
}

export function tasksOverlappingDay(
  tasks: AnalystTask[],
  activeTasks: AnalystTask[],
  dateIso: string,
  nowIso: string,
): AnalystTask[] {
  const merged = new Map<string, AnalystTask>();
  for (const task of tasks) {
    merged.set(task.id, task);
  }
  for (const task of activeTasks) {
    merged.set(task.id, task);
  }

  const isToday = isoDateFromInstant(nowIso) === dateIso;
  const nowEnd = isToday ? nowIso : `${dateIso}T23:59:59-03:00`;

  return [...merged.values()].filter((task) => {
    const endAt =
      task.status === "running"
        ? nowEnd
        : task.ended_at ?? task.started_at;
    return clipSegmentToDay({
      startedAt: task.started_at,
      endedAt: endAt,
      dateIso,
    });
  });
}

function intersection(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): { start: number; end: number } | null {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  if (end <= start) {
    return null;
  }
  return { start, end };
}

export function computeOverlaps(
  segments: Array<{ taskId: string; startMinutes: number; endMinutes: number }>,
): TimelineOverlap[] {
  const overlaps: TimelineOverlap[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    for (let other = index + 1; other < segments.length; other += 1) {
      const left = segments[index];
      const right = segments[other];
      const hit = intersection(
        left.startMinutes,
        left.endMinutes,
        right.startMinutes,
        right.endMinutes,
      );
      if (!hit) {
        continue;
      }
      const existing = overlaps.find(
        (row) =>
          row.startMinutes === hit.start &&
          row.endMinutes === hit.end &&
          row.taskIds.includes(left.taskId) &&
          row.taskIds.includes(right.taskId),
      );
      if (existing) {
        continue;
      }
      overlaps.push({
        startMinutes: hit.start,
        endMinutes: hit.end,
        taskIds: [left.taskId, right.taskId],
      });
    }
  }
  return overlaps.sort((a, b) => a.startMinutes - b.startMinutes);
}

function formatHourLabel(totalMinutes: number): string {
  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function buildHourLabels(startMinutes: number, endMinutes: number): string[] {
  const startHour = Math.floor(startMinutes / 60);
  const endHour = Math.ceil(endMinutes / 60);
  const labels: string[] = [];
  for (let hour = startHour; hour <= endHour; hour += 1) {
    labels.push(`${String(hour).padStart(2, "0")}:00`);
  }
  return labels;
}

export function buildDayTimeline(input: {
  tasks: AnalystTask[];
  activeTasks: AnalystTask[];
  dateIso: string;
  nowIso: string;
  defaultStartHour?: number;
  defaultEndHour?: number;
}): DayTimeline {
  const dayTasks = tasksOverlappingDay(
    input.tasks,
    input.activeTasks,
    input.dateIso,
    input.nowIso,
  );
  const isToday = isoDateFromInstant(input.nowIso) === input.dateIso;
  const nowEnd = isToday ? input.nowIso : `${input.dateIso}T23:59:59-03:00`;

  const rawSegments = dayTasks
    .map((task) => {
      const endAt =
        task.status === "running" ? nowEnd : task.ended_at ?? task.started_at;
      const clip = clipSegmentToDay({
        startedAt: task.started_at,
        endedAt: endAt,
        dateIso: input.dateIso,
      });
      if (!clip) {
        return null;
      }
      return {
        task,
        startMinutes: clip.startMinutes,
        endMinutes: clip.endMinutes,
      };
    })
    .filter((row): row is Omit<TimelineSegment, "hasOverlap"> => row != null)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  const overlapInput = rawSegments.map((row) => ({
    taskId: row.task.id,
    startMinutes: row.startMinutes,
    endMinutes: row.endMinutes,
  }));
  const overlaps = computeOverlaps(overlapInput);
  const overlappingIds = new Set(overlaps.flatMap((row) => row.taskIds));

  const segments: TimelineSegment[] = rawSegments.map((row) => ({
    ...row,
    hasOverlap: overlappingIds.has(row.task.id),
  }));

  const bounds = dayBoundsMinutes(input.dateIso);

  let rangeStartMinutes: number;
  let rangeEndMinutes: number;
  if (segments.length > 0) {
    const minStart = Math.min(...segments.map((row) => row.startMinutes));
    const maxEnd = Math.max(...segments.map((row) => row.endMinutes));
    rangeStartMinutes = Math.floor(minStart / 60) * 60;
    rangeEndMinutes = Math.ceil(maxEnd / 60) * 60;
  } else {
    rangeStartMinutes = (input.defaultStartHour ?? 8) * 60;
    rangeEndMinutes = (input.defaultEndHour ?? 18) * 60;
  }
  rangeStartMinutes = Math.max(bounds.start, rangeStartMinutes);
  rangeEndMinutes = Math.min(bounds.end, rangeEndMinutes);
  if (rangeEndMinutes <= rangeStartMinutes) {
    rangeEndMinutes = rangeStartMinutes + 60;
  }

  return {
    segments,
    overlaps,
    rangeStartMinutes,
    rangeEndMinutes,
    hourLabels: buildHourLabels(rangeStartMinutes, rangeEndMinutes),
  };
}

export function taskHasActiveOverlap(
  task: AnalystTask,
  tasks: AnalystTask[],
  activeTasks: AnalystTask[],
  nowIso: string,
): boolean {
  const dateIso = isoDateFromInstant(task.started_at);
  const timeline = buildDayTimeline({
    tasks,
    activeTasks,
    dateIso,
    nowIso,
  });
  return timeline.segments.some(
    (row) => row.task.id === task.id && row.hasOverlap,
  );
}

export function formatTimelineTime(totalMinutes: number): string {
  return formatHourLabel(totalMinutes);
}

export function minutesToPercent(
  minutes: number,
  rangeStart: number,
  rangeEnd: number,
): number {
  const span = rangeEnd - rangeStart;
  if (span <= 0) {
    return 0;
  }
  return ((minutes - rangeStart) / span) * 100;
}
