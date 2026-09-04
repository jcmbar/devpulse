"use client";

import type { AnalystTask } from "@/types/analyst-task";
import {
  buildDayTimeline,
  formatTimelineTime,
  minutesToPercent,
  type TimelineOverlap,
} from "@/lib/analyst-tasks/timeline";
import { AlertTriangle, Layers } from "lucide-react";
import { useMemo, useState } from "react";

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

function overlapBandClass(maxConcurrency: number): string {
  if (maxConcurrency >= 3) {
    return "border-rose-500/70 bg-rose-500/15";
  }
  return "border-amber-500/60 bg-amber-500/10";
}

function overlapHatchClass(maxConcurrency: number): string {
  if (maxConcurrency >= 3) {
    return "bg-[repeating-linear-gradient(-45deg,transparent,transparent_4px,rgba(244,63,94,0.14)_4px,rgba(244,63,94,0.14)_8px)]";
  }
  return "bg-[repeating-linear-gradient(-45deg,transparent,transparent_5px,rgba(245,158,11,0.12)_5px,rgba(245,158,11,0.12)_10px)]";
}

function formatDurationMinutes(startMinutes: number, endMinutes: number): string {
  const total = Math.max(0, Math.round(endMinutes - startMinutes));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function overlapKey(overlap: TimelineOverlap): string {
  return `${overlap.startMinutes}-${overlap.endMinutes}-${overlap.taskIds.join(",")}`;
}

function overlapAriaLabel(
  overlap: TimelineOverlap,
  taskLabels: Map<string, string>,
): string {
  const names = overlap.taskIds
    .map((id) => taskLabels.get(id) ?? id)
    .join(", ");
  return `Simultaneidade das ${formatTimelineTime(overlap.startMinutes)} às ${formatTimelineTime(overlap.endMinutes)}, duração ${formatDurationMinutes(overlap.startMinutes, overlap.endMinutes)}, até ${overlap.maxConcurrency} tarefas ao mesmo tempo: ${names}`;
}

function OverlapBand({
  overlap,
  rangeStart,
  rangeEnd,
  selected,
  taskLabels,
  onSelect,
  showBadge,
}: {
  overlap: TimelineOverlap;
  rangeStart: number;
  rangeEnd: number;
  selected: boolean;
  taskLabels: Map<string, string>;
  onSelect: () => void;
  showBadge?: boolean;
}) {
  const left = minutesToPercent(
    overlap.startMinutes,
    rangeStart,
    rangeEnd,
  );
  const width = Math.max(
    0.5,
    minutesToPercent(overlap.endMinutes, rangeStart, rangeEnd) - left,
  );
  const label = overlapAriaLabel(overlap, taskLabels);

  return (
    <button
      type="button"
      className={`pointer-events-auto absolute inset-y-0 z-10 border-x border-dashed ${overlapBandClass(overlap.maxConcurrency)} ${overlapHatchClass(overlap.maxConcurrency)} ${
        selected ? "ring-2 ring-inset ring-amber-500/70" : ""
      }`}
      style={{ left: `${left}%`, width: `${width}%` }}
      title={label}
      aria-label={label}
      onClick={onSelect}
    >
      {showBadge ? (
        <span
          className={`absolute top-1 left-1 inline-flex items-center gap-0.5 rounded-[2px] border border-dashed px-1 py-0.5 text-[9px] font-semibold shadow-sm ${
            overlap.maxConcurrency >= 3
              ? "border-rose-500/60 bg-card/95 text-rose-700 dark:text-rose-300"
              : "border-amber-500/60 bg-card/95 text-amber-800 dark:text-amber-200"
          }`}
        >
          <Layers className="size-2.5" aria-hidden />
          ×{overlap.maxConcurrency}
        </span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </button>
  );
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
  const [selectedOverlapKey, setSelectedOverlapKey] = useState<string | null>(
    null,
  );

  const taskLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const segment of timeline.segments) {
      map.set(segment.task.id, segment.task.description);
    }
    return map;
  }, [timeline.segments]);

  if (timeline.segments.length === 0) {
    return (
      <div className="rounded-[var(--radius-sm)] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        Nenhuma atividade registrada em {dateLabel}.
      </div>
    );
  }

  const selectedOverlap =
    timeline.overlaps.find((overlap) => overlapKey(overlap) === selectedOverlapKey) ??
    null;

  function toggleOverlap(key: string) {
    setSelectedOverlapKey((current) => (current === key ? null : key));
  }

  return (
    <div className="space-y-3">
      {timeline.overlaps.length > 0 ? (
        <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-900 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <p>
            Há{" "}
            <span className="font-semibold">
              {timeline.overlaps.length} janela(s)
            </span>{" "}
            de tarefas simultâneas neste dia. As faixas tracejadas marcam o
            intervalo em que 2 ou mais tarefas estavam ativas; isso não altera o
            lançamento das tarefas. Tarefas em andamento aparecem só como
            projeção na régua.
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
              <div className="relative flex justify-between text-[10px] font-medium tabular-nums text-muted-foreground">
                {timeline.hourLabels.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              {timeline.overlaps.map((overlap) => (
                <div
                  key={`ruler-${overlapKey(overlap)}`}
                  className={`pointer-events-none absolute inset-y-0 border-x border-dashed ${overlapBandClass(overlap.maxConcurrency)}`}
                  style={{
                    left: `${minutesToPercent(overlap.startMinutes, timeline.rangeStartMinutes, timeline.rangeEndMinutes)}%`,
                    width: `${Math.max(
                      0.5,
                      minutesToPercent(
                        overlap.endMinutes,
                        timeline.rangeStartMinutes,
                        timeline.rangeEndMinutes,
                      ) -
                        minutesToPercent(
                          overlap.startMinutes,
                          timeline.rangeStartMinutes,
                          timeline.rangeEndMinutes,
                        ),
                    )}%`,
                  }}
                  aria-hidden
                />
              ))}
            </div>
          </div>

          <div className="relative">
            <div
              className="pointer-events-none absolute inset-0 z-10 grid grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)]"
              aria-hidden={timeline.overlaps.length === 0}
            >
              <div />
              <div className="relative px-2">
                {timeline.overlaps.map((overlap) => (
                  <OverlapBand
                    key={`layer-${overlapKey(overlap)}`}
                    overlap={overlap}
                    rangeStart={timeline.rangeStartMinutes}
                    rangeEnd={timeline.rangeEndMinutes}
                    selected={selectedOverlapKey === overlapKey(overlap)}
                    taskLabels={taskLabels}
                    onSelect={() => toggleOverlap(overlapKey(overlap))}
                    showBadge
                  />
                ))}
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

              return (
                <div
                  key={segment.task.id}
                  className="grid grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)] border-b border-border/70 last:border-b-0"
                >
                  <div className="relative z-20 flex min-w-0 flex-col justify-center gap-1 border-r border-border/70 bg-card px-3 py-3">
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
                        <span className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-amber-500/50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:text-amber-300">
                          <Layers className="size-2.5" aria-hidden />
                          Simultânea
                        </span>
                      ) : null}
                      {segment.task.status === "running" ? (
                        <span className="text-[9px] font-medium text-brand-foreground">
                          Em andamento
                        </span>
                      ) : null}
                      {segment.task.status === "paused" ? (
                        <span className="text-[9px] font-medium text-amber-700 dark:text-amber-300">
                          Pausada
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="relative z-0 px-2 py-3">
                    <div className="relative h-9 rounded-[var(--radius-sm)] bg-muted/25">
                      <div
                        className={`absolute inset-y-1 z-[1] rounded-full border shadow-sm ${barColor(index, segment.task.is_urgent)} ${
                          segment.hasOverlap
                            ? "ring-2 ring-amber-400/40 ring-offset-1 ring-offset-card"
                            : ""
                        } ${segment.task.status === "running" ? "animate-pulse" : ""}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${formatTimelineTime(segment.startMinutes)} → ${formatTimelineTime(segment.endMinutes)}`}
                      >
                        <span className="sr-only">
                          {formatTimelineTime(segment.startMinutes)} até{" "}
                          {formatTimelineTime(segment.endMinutes)}
                          {segment.task.status === "running"
                            ? " (em andamento)"
                            : ""}
                          {segment.task.status === "paused" ? " (pausada)" : ""}
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

      {selectedOverlap ? (
        <div
          className="rounded-[var(--radius-sm)] border border-border bg-muted/20 px-3 py-2.5 text-xs text-foreground"
          role="status"
        >
          <p className="font-semibold">
            {formatTimelineTime(selectedOverlap.startMinutes)} –{" "}
            {formatTimelineTime(selectedOverlap.endMinutes)} ·{" "}
            {formatDurationMinutes(
              selectedOverlap.startMinutes,
              selectedOverlap.endMinutes,
            )}{" "}
            · até {selectedOverlap.maxConcurrency} simultâneas
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
            {selectedOverlap.taskIds.map((id) => (
              <li key={id}>{taskLabels.get(id) ?? id}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
