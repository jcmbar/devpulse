"use client";

import type { AnalystTask } from "@/types/analyst-task";
import {
  buildDayTimeline,
  formatTimelineTime,
  minutesToPercent,
} from "@/lib/analyst-tasks/timeline";
import { AlertTriangle } from "lucide-react";
import { useMemo } from "react";

type Props = {
  dateIso: string;
  dateLabel: string;
  tasks: AnalystTask[];
  activeTasks: AnalystTask[];
  initialNow: string;
};

const BAR_COLORS = [
  "bg-sky-500/85 border-sky-400",
  "bg-violet-500/85 border-violet-400",
  "bg-emerald-500/85 border-emerald-400",
  "bg-amber-500/85 border-amber-400",
  "bg-rose-500/85 border-rose-400",
  "bg-cyan-500/85 border-cyan-400",
];

function barColor(index: number, urgent: boolean): string {
  if (urgent) {
    return "bg-amber-500/90 border-amber-300";
  }
  return BAR_COLORS[index % BAR_COLORS.length];
}

export function AnalystDayTimeline({
  dateIso,
  dateLabel,
  tasks,
  activeTasks,
  initialNow,
}: Props) {
  const timeline = useMemo(
    () =>
      buildDayTimeline({
        tasks,
        activeTasks,
        dateIso,
        nowIso: initialNow,
      }),
    [tasks, activeTasks, dateIso, initialNow],
  );

  if (timeline.segments.length === 0) {
    return (
      <div className="rounded-[var(--radius-sm)] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        Nenhuma atividade registrada em {dateLabel}.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {timeline.overlaps.length > 0 ? (
        <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-900 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <p>
            Há{" "}
            <span className="font-semibold">
              {timeline.overlaps.length} período(s)
            </span>{" "}
            com tarefas simultâneas neste dia. As marcações pontilhadas são
            apenas informativas.
          </p>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-border bg-card">
        <div className="min-w-[42rem]">
          <div className="grid grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)] border-b border-border bg-muted/20">
            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Tarefa
            </div>
            <div className="relative px-2 py-2">
              <div className="flex justify-between text-[10px] font-medium tabular-nums text-muted-foreground">
                {timeline.hourLabels.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            </div>
          </div>

          {timeline.segments.map((segment, index) => {
            const left = minutesToPercent(
              segment.startMinutes,
              timeline.rangeStartMinutes,
              timeline.rangeEndMinutes,
            );
            const width = Math.max(
              1.5,
              minutesToPercent(
                segment.endMinutes,
                timeline.rangeStartMinutes,
                timeline.rangeEndMinutes,
              ) - left,
            );
            const segmentOverlaps = timeline.overlaps.filter((overlap) =>
              overlap.taskIds.includes(segment.task.id),
            );

            return (
              <div
                key={segment.task.id}
                className="grid grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)] border-b border-border/70 last:border-b-0"
              >
                <div className="flex min-w-0 flex-col justify-center gap-1 border-r border-border/70 px-3 py-3">
                  <p
                    className="truncate text-xs font-medium text-foreground"
                    title={segment.task.description}
                  >
                    {segment.task.description}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {segment.task.is_urgent ? (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:text-amber-300">
                        URGENTE
                      </span>
                    ) : null}
                    {segment.hasOverlap ? (
                      <span className="rounded-full border border-dashed border-amber-500/50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:text-amber-300">
                        Conflito
                      </span>
                    ) : null}
                    {segment.task.status === "running" ? (
                      <span className="text-[9px] font-medium text-brand-foreground">
                        Em andamento
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="relative px-2 py-3">
                  <div
                    className="relative h-9 rounded-[var(--radius-sm)] bg-muted/25"
                  >
                    {segmentOverlaps.map((overlap) => {
                      const overlapLeft = minutesToPercent(
                        overlap.startMinutes,
                        timeline.rangeStartMinutes,
                        timeline.rangeEndMinutes,
                      );
                      const overlapWidth = Math.max(
                        0.5,
                        minutesToPercent(
                          overlap.endMinutes,
                          timeline.rangeStartMinutes,
                          timeline.rangeEndMinutes,
                        ) - overlapLeft,
                      );
                      return (
                        <div
                          key={`${segment.task.id}-${overlap.startMinutes}-${overlap.endMinutes}`}
                          className="pointer-events-none absolute inset-y-0 rounded-[2px] border border-dashed border-amber-500/70 bg-amber-500/10"
                          style={{
                            left: `${overlapLeft}%`,
                            width: `${overlapWidth}%`,
                          }}
                          title="Tarefas simultâneas"
                        />
                      );
                    })}

                    <div
                      className={`absolute inset-y-1 rounded-full border shadow-sm ${barColor(index, segment.task.is_urgent)} ${
                        segment.hasOverlap
                          ? "ring-2 ring-amber-400/50 ring-offset-1 ring-offset-card"
                          : ""
                      } ${segment.task.status === "running" ? "animate-pulse" : ""}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${formatTimelineTime(segment.startMinutes)} → ${formatTimelineTime(segment.endMinutes)}`}
                    >
                      <span className="sr-only">
                        {formatTimelineTime(segment.startMinutes)} até{" "}
                        {formatTimelineTime(segment.endMinutes)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
