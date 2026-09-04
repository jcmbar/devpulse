"use client";

import { AnalystDayTimeline } from "@/app/app/analistas/analyst-day-timeline";
import {
  acknowledgeAnalystTaskAction,
  clearAnalystTaskAcknowledgmentAction,
  completeAnalystTaskAction,
  createAnalystTaskAction,
  deleteAnalystTaskAction,
  pauseAnalystTaskAction,
  resumeAnalystTaskAction,
  updateAnalystTaskAction,
  type AnalystTaskActionState,
} from "@/app/app/analistas/actions";
import { FormFeedback, FormField } from "@/components/ui/form";
import { KpiMetricCard } from "@/components/ui/kpi-metric-card";
import { SectionShell } from "@/components/ui/section-shell";
import {
  isoDateFromInstant as timelineIsoDate,
  taskHasActiveOverlap,
  tasksOverlappingDay,
} from "@/lib/analyst-tasks/timeline";
import {
  ANALYST_CLOSED_DAY_MESSAGE,
  canOperateActiveAnalystTimer,
  isAnalystTaskDayClosed,
  localDateIsoFromInstant,
} from "@/lib/analyst-tasks/day-lock";
import {
  resolveSimultaneityAlertLevel,
  type SimultaneityAlertLevel,
} from "@/lib/analyst-tasks/simultaneous-hours";
import type {
  AnalystTask,
  AnalystTaskDay,
  AnalystTaskMetrics,
} from "@/types/analyst-task";
import { analystTaskElapsedMs } from "@/types/analyst-task";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Layers,
  Lock,
  Pause,
  Pencil,
  Play,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { cn } from "@/lib/utils";
import { usePathname, useRouter } from "next/navigation";

type TaskModalView =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "complete"; taskId: string };

type AnalystOption = { id: string; name: string };

type Props = {
  analysts: AnalystOption[];
  selectedDeveloperId: string;
  selectedDeveloperName: string;
  month: string;
  monthLabel: string;
  monthOptions: string[];
  defaultStartedAt: string;
  initialNow: string;
  tasks: AnalystTask[];
  activeTasks: AnalystTask[];
  metrics: AnalystTaskMetrics;
  canManageAll: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

const initialState: AnalystTaskActionState = {
  error: null,
  success: null,
  taskId: null,
  acknowledgment: null,
};

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dayFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

function formatHours(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  const sign = value < 0 ? "-" : "";
  const totalMinutes = Math.round(Math.abs(value) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0",
  )}`;
}

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function simultaneityAlertTone(
  level: SimultaneityAlertLevel,
): "neutral" | "warning" | "danger" {
  if (level === "none") {
    return "neutral";
  }
  if (level === "low" || level === "attention") {
    return "warning";
  }
  return "danger";
}

function simultaneityAlertClass(level: SimultaneityAlertLevel): string {
  switch (level) {
    case "none":
      return "text-muted-foreground";
    case "low":
      return "text-amber-600/90 dark:text-amber-300/90";
    case "attention":
      return "text-amber-700 dark:text-amber-200";
    case "high":
      return "text-rose-600 dark:text-rose-300";
    case "critical":
      return "text-rose-700 font-semibold dark:text-rose-200";
  }
}

const DAY_METRIC_HINTS = {
  realized:
    "Tempo líquido trabalhado no dia. Períodos com tarefas simultâneas são contados apenas uma vez.",
  conflict:
    "Tempo lançado em duplicidade por tarefas que ocorreram ao mesmo tempo.",
  simultaneity:
    "Percentual de tempo adicional lançado em paralelo em relação ao tempo líquido realizado. O indicador pode ultrapassar 100% quando três ou mais tarefas ocorrem simultaneamente.",
  balance: "Horas realizadas menos a jornada contratada do dia.",
  contracted: "Carga diária prevista no cadastro do analista.",
  launched: "Soma simples das durações de todas as tarefas concluídas do dia.",
} as const;

/** Vertical day KPI column between calendar and task list. */
const DAY_KPI_CARD_CLASS =
  "!overflow-visible p-2.5 sm:p-2.5 lg:p-2.5 [&_.ui-kpi-card__label]:break-words [&_.ui-kpi-card__label]:leading-snug [&_.ui-kpi-card__label]:text-[10px] [&_.ui-kpi-card__label]:tracking-[0.06em] [&_.ui-kpi-card__label]:sm:text-[10px] [&_.ui-kpi-card__value]:mt-0.5 [&_.ui-kpi-card__value]:text-lg [&_.ui-kpi-card__value]:sm:text-lg [&_.ui-kpi-card__value]:lg:text-lg [&_.ui-kpi-card__hint]:mt-0.5 [&_.ui-kpi-card__hint]:text-[10px] [&_.ui-kpi-card__hint]:leading-snug [&_.ui-kpi-card__hint]:break-words [&_.ui-kpi-card__hint]:sm:text-[10px]";

function formatDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}

function formatTime(value: string): string {
  return timeFormatter.format(new Date(value));
}

function formatElapsedSeconds(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0",
  )}:${String(remaining).padStart(2, "0")}`;
}

function localInputValue(value: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function nowInputValue(): string {
  return localInputValue(new Date().toISOString());
}

function DayCell({
  day,
  selected,
  onSelect,
}: {
  day: AnalystTaskDay;
  selected: boolean;
  onSelect: () => void;
}) {
  const dayNumber = day.date.slice(-2);
  return (
    <button
      type="button"
      onClick={onSelect}
      title={
        day.task_count > 0
          ? `${day.task_count} tarefa(s) registrada(s)`
          : day.is_holiday
            ? "Feriado sem tarefa registrada"
            : "Nenhuma tarefa registrada"
      }
      className={`min-h-[3.25rem] rounded-[var(--radius-sm)] border p-1 text-left transition ${
        selected
          ? "border-brand bg-brand-soft shadow-[var(--shadow-sm)]"
          : "border-border bg-card hover:border-brand/50 hover:bg-muted/30"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-semibold text-foreground">{dayNumber}</span>
      </div>
      {day.task_count > 0 ? (
        <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-700 dark:text-emerald-300">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          OK
        </span>
      ) : (
        <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-semibold text-amber-700 dark:text-amber-300">
          <span className="size-1.5 rounded-full bg-amber-500" />
          —
        </span>
      )}
      {day.contracted_hours > 0 || day.hours > 0 || day.launched_hours > 0 ? (
        <div className="mt-0.5 space-y-0.5">
          <p
            className="text-[9px] font-semibold tabular-nums text-foreground"
            title={DAY_METRIC_HINTS.realized}
          >
            {formatHours(day.hours)}
          </p>
          {day.conflict_hours > 0 ? (
            <p
              className={`inline-flex items-center gap-0.5 text-[8px] tabular-nums ${simultaneityAlertClass(
                resolveSimultaneityAlertLevel(day.simultaneity_percent),
              )}`}
              title={DAY_METRIC_HINTS.conflict}
            >
              <Layers className="size-2" aria-hidden />
              {formatHours(day.conflict_hours)}
            </p>
          ) : null}
          {day.contracted_hours > 0 ? (
            <p
              className={`text-[8px] tabular-nums ${
                day.delta_hours >= 0
                  ? "text-emerald-600/90 dark:text-emerald-400/90"
                  : "text-amber-700/90 dark:text-amber-300/90"
              }`}
              title={DAY_METRIC_HINTS.balance}
            >
              {day.delta_hours >= 0 ? "+" : ""}
              {formatHours(day.delta_hours)}
            </p>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}
function classification(metrics: AnalystTaskMetrics): {
  label: string;
  tone: "success" | "warning" | "neutral";
} {
  if (metrics.total_tasks === 0) {
    return { label: "Sem registros", tone: "neutral" };
  }
  if (metrics.contracted_hours > 0) {
    const ratio = metrics.total_hours / metrics.contracted_hours;
    if (ratio >= 1) {
      return { label: "Carga completa", tone: "success" };
    }
    if (ratio >= 0.75) {
      return { label: "Bom ritmo", tone: "success" };
    }
  }
  return { label: "Em andamento", tone: "warning" };
}

function ActiveTimer({
  task,
  initialNow,
  className,
}: {
  task: Pick<
    AnalystTask,
    "started_at" | "ended_at" | "paused_at" | "total_paused_ms" | "status"
  >;
  initialNow: string;
  className?: string;
}) {
  const isPaused = task.status === "paused";
  const [elapsedSeconds, setElapsedSeconds] = useState(() =>
    Math.floor(
      analystTaskElapsedMs(task, new Date(initialNow).getTime()) / 1000,
    ),
  );

  useEffect(() => {
    const baseMs = analystTaskElapsedMs(task, new Date(initialNow).getTime());
    const baseSeconds = Math.floor(baseMs / 1000);
    setElapsedSeconds(baseSeconds);

    if (isPaused || task.status === "completed") {
      return;
    }

    const anchor = performance.now();
    const tick = () => {
      setElapsedSeconds(
        baseSeconds + Math.floor((performance.now() - anchor) / 1000),
      );
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [
    task.started_at,
    task.ended_at,
    task.paused_at,
    task.total_paused_ms,
    task.status,
    initialNow,
    isPaused,
  ]);

  return (
    <span
      className={cn(
        "font-mono font-semibold tabular-nums",
        isPaused ? "text-amber-700 dark:text-amber-300" : "text-brand-foreground",
        className ?? "text-xl",
      )}
    >
      {formatElapsedSeconds(elapsedSeconds)}
    </span>
  );
}

function TaskRow({
  task,
  initialNow,
  onEdit,
  onOpenTimer,
  onPause,
  onResume,
  pausePending,
  resumePending,
  canEditRecord,
  canDelete,
  canOperateTimer,
  canAcknowledge,
  onAcknowledge,
  onClearAcknowledgment,
  acknowledgePending,
}: {
  task: AnalystTask;
  initialNow: string;
  onEdit: () => void;
  onOpenTimer: () => void;
  onPause: () => void;
  onResume: () => void;
  pausePending: boolean;
  resumePending: boolean;
  canEditRecord: boolean;
  canDelete: boolean;
  canOperateTimer: boolean;
  canAcknowledge: boolean;
  onAcknowledge: () => void;
  onClearAcknowledgment: () => void;
  acknowledgePending: boolean;
}) {
  const isRunning = task.status === "running";
  const isPaused = task.status === "paused";
  const isOpen = isRunning || isPaused;
  const isAcknowledged = Boolean(task.acknowledged_at);

  return (
    <div
      className={`flex flex-col gap-3 rounded-[var(--radius-sm)] border bg-card px-3 py-3 sm:flex-row sm:items-start sm:justify-between ${
        isRunning
          ? "border-brand/40 bg-brand-soft/20"
          : isPaused
            ? "border-amber-500/40 bg-amber-500/5"
            : isAcknowledged
              ? "border-emerald-500/35 bg-emerald-500/5"
              : "border-border"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{task.description}</span>
          {task.is_urgent ? (
            <span className="inline-flex animate-pulse items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
              <AlertTriangle className="size-3" />
              URGENTE
            </span>
          ) : null}
          {isRunning ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand-foreground">
              Em andamento
            </span>
          ) : null}
          {isPaused ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
              Pausada
            </span>
          ) : null}
          {isAcknowledged ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300"
              title={
                task.acknowledged_at
                  ? `Ciência em ${formatDateTime(task.acknowledged_at)}`
                  : "Gestor ciente"
              }
            >
              <ThumbsUp className="size-3" aria-hidden />
              Ciente
              {task.acknowledged_by_name
                ? ` · ${task.acknowledged_by_name}`
                : ""}
            </span>
          ) : null}
          {!canEditRecord && !isOpen ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
              title={ANALYST_CLOSED_DAY_MESSAGE}
            >
              <Lock className="size-3" aria-hidden />
              Dia encerrado
            </span>
          ) : null}
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            DevPulse
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatTime(task.started_at)} →{" "}
          {task.ended_at
            ? formatTime(task.ended_at)
            : isPaused
              ? "pausada"
              : "em andamento"}{" "}
          · {formatHours(task.duration_hours)}
        </p>
        {task.details ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-medium text-brand-foreground">
              Ver mais
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {task.details}
            </p>
          </details>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <div className="flex flex-wrap justify-end gap-2">
          {isOpen ? (
            canOperateTimer ? (
              <>
                <button
                  type="button"
                  onClick={onOpenTimer}
                  className="ui-btn-secondary"
                >
                  Cronômetro
                </button>
                {isRunning ? (
                  <button
                    type="button"
                    onClick={onPause}
                    disabled={pausePending}
                    className="ui-btn-ghost border border-red-500/40 text-red-600 dark:text-red-300"
                  >
                    <Pause className="size-3.5" />
                    {pausePending ? "Pausando…" : "Pausar"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onResume}
                    disabled={resumePending}
                    className="ui-btn-secondary"
                  >
                    <Play className="size-3.5" />
                    {resumePending ? "Continuando…" : "Continuar"}
                  </button>
                )}
              </>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                title={ANALYST_CLOSED_DAY_MESSAGE}
              >
                <Lock className="size-3.5" aria-hidden />
                Encerrado
              </span>
            )
          ) : canEditRecord ? (
            <button type="button" onClick={onEdit} className="ui-btn-secondary">
              <Pencil className="size-3.5" />
              Editar
            </button>
          ) : (
            <button
              type="button"
              disabled
              title={ANALYST_CLOSED_DAY_MESSAGE}
              className="ui-btn-secondary opacity-60"
            >
              <Lock className="size-3.5" />
              Editar
            </button>
          )}
          {canAcknowledge && task.status === "completed" ? (
            isAcknowledged ? (
              <button
                type="button"
                onClick={onClearAcknowledgment}
                disabled={acknowledgePending}
                title="Remover ciência"
                className="ui-btn-ghost border border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
              >
                <ThumbsUp className="size-3.5 fill-current" />
                {acknowledgePending ? "…" : "Ciente"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onAcknowledge}
                disabled={acknowledgePending}
                title="Dar ciência nesta tarefa"
                className="ui-btn-secondary"
              >
                <ThumbsUp className="size-3.5" />
                {acknowledgePending ? "…" : "Ciência"}
              </button>
            )
          ) : null}
          {canDelete ? (
            <form
              action={async (formData) => {
                await deleteAnalystTaskAction(undefined, formData);
              }}
              onSubmit={(event) => {
                if (!window.confirm("Excluir esta tarefa?")) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="taskId" value={task.id} />
              <button
                type="submit"
                className="ui-btn-ghost text-red-600 dark:text-red-300"
              >
                <Trash2 className="size-3.5" />
                Excluir
              </button>
            </form>
          ) : null}
        </div>
        {isOpen ? (
          <ActiveTimer
            task={task}
            initialNow={initialNow}
            className="text-base"
          />
        ) : null}
      </div>
    </div>
  );
}

function EditTaskDialog({
  task,
  onClose,
}: {
  task: AnalystTask;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(
    updateAnalystTaskAction,
    initialState,
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-xl rounded-[var(--radius-md)] border border-border bg-card p-5 shadow-[var(--shadow-lg)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-brand uppercase">
              Editar tarefa
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              Ajustar registro
            </h2>
          </div>
          <button type="button" onClick={onClose} className="ui-btn-ghost px-2">
            <X className="size-4" />
          </button>
        </div>
        <form action={action} className="mt-5 space-y-4">
          <input type="hidden" name="taskId" value={task.id} />
          <FormField label="Descrição" htmlFor={`edit-description-${task.id}`}>
            <textarea
              id={`edit-description-${task.id}`}
              name="description"
              defaultValue={task.description}
              required
              maxLength={500}
              className="ui-input min-h-24 resize-y"
            />
          </FormField>
          <FormField
            label="Detalhes (opcional)"
            htmlFor={`edit-details-${task.id}`}
          >
            <textarea
              id={`edit-details-${task.id}`}
              name="details"
              defaultValue={task.details ?? ""}
              maxLength={2000}
              className="ui-input min-h-20 resize-y"
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Início" htmlFor={`edit-started-${task.id}`}>
              <input
                id={`edit-started-${task.id}`}
                type="datetime-local"
                name="startedAt"
                defaultValue={localInputValue(task.started_at)}
                required
                className="ui-input"
              />
            </FormField>
            <FormField label="Término" htmlFor={`edit-ended-${task.id}`}>
              <input
                id={`edit-ended-${task.id}`}
                type="datetime-local"
                name="endedAt"
                defaultValue={task.ended_at ? localInputValue(task.ended_at) : ""}
                className="ui-input"
              />
            </FormField>
          </div>
          <label className="ui-check">
            <input
              name="isUrgent"
              type="checkbox"
              defaultChecked={task.is_urgent}
              className="ui-checkbox mt-0.5"
            />
            <span>Atendimento urgente</span>
          </label>
          <FormFeedback error={state.error} success={state.success} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="ui-btn-secondary">
              Cancelar
            </button>
            <button type="submit" disabled={pending} className="ui-btn-primary">
              {pending ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AnalystTaskWorkspace({
  analysts,
  selectedDeveloperId,
  selectedDeveloperName,
  month,
  monthLabel,
  monthOptions,
  defaultStartedAt,
  initialNow,
  tasks,
  activeTasks,
  metrics,
  canManageAll,
  canEdit,
  canDelete,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendingNavigation, startNavigation] = useTransition();
  const [draftMonth, setDraftMonth] = useState(month);
  const [draftDeveloperId, setDraftDeveloperId] = useState(selectedDeveloperId);
  const [selectedDate, setSelectedDate] = useState(() => {
    const todayIso = timelineIsoDate(initialNow);
    if (month === todayIso.slice(0, 7)) {
      return todayIso;
    }
    return (
      metrics.daily.find((day) => day.hours > 0)?.date ?? `${month}-01`
    );
  });

  useEffect(() => {
    setDraftMonth(month);
    setDraftDeveloperId(selectedDeveloperId);
  }, [month, selectedDeveloperId]);
  const [editingTask, setEditingTask] = useState<AnalystTask | null>(null);
  const [modalView, setModalView] = useState<TaskModalView>({ kind: "closed" });
  const startedAtEdited = useRef(false);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const concludeRef = useRef<HTMLButtonElement>(null);
  const handledCreateSuccess = useRef<string | null>(null);
  const handledCompleteSuccess = useRef<string | null>(null);
  const [createState, createAction, createPending] = useActionState(
    createAnalystTaskAction,
    initialState,
  );
  const [completeState, completeAction, completePending] = useActionState(
    completeAnalystTaskAction,
    initialState,
  );
  const [pauseState, pauseAction, pausePending] = useActionState(
    pauseAnalystTaskAction,
    initialState,
  );
  const [resumeState, resumeAction, resumePending] = useActionState(
    resumeAnalystTaskAction,
    initialState,
  );
  const [ackState, ackAction, ackPending] = useActionState(
    acknowledgeAnalystTaskAction,
    initialState,
  );
  const [clearAckState, clearAckAction, clearAckPending] = useActionState(
    clearAnalystTaskAcknowledgmentAction,
    initialState,
  );
  const [localTasks, setLocalTasks] = useState(tasks);
  const [ackTaskId, setAckTaskId] = useState<string | null>(null);
  const handledAckKey = useRef<string | null>(null);

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    const state = ackState.success
      ? ackState
      : clearAckState.success
        ? clearAckState
        : null;
    if (!state?.success || !state.taskId || !state.acknowledgment) {
      return;
    }
    const key = `${state.success}:${state.taskId}:${state.acknowledgment.acknowledged_at ?? "cleared"}`;
    if (handledAckKey.current === key) {
      return;
    }
    handledAckKey.current = key;
    const acknowledgment = state.acknowledgment;
    setLocalTasks((previous) =>
      previous.map((task) =>
        task.id === state.taskId
          ? {
              ...task,
              acknowledged_at: acknowledgment.acknowledged_at,
              acknowledged_by: acknowledgment.acknowledged_by,
              acknowledged_by_name: acknowledgment.acknowledged_by_name,
            }
          : task,
      ),
    );
    setAckTaskId(null);
  }, [ackState, clearAckState]);

  useEffect(() => {
    if (!ackPending && !clearAckPending) {
      setAckTaskId(null);
    }
  }, [ackPending, clearAckPending]);

  const acknowledgePending = ackPending || clearAckPending;
  const activeOpenTasks = activeTasks;
  const runningCount = activeOpenTasks.length;
  const focusedActiveTask =
    modalView.kind === "complete"
      ? (activeOpenTasks.find((task) => task.id === modalView.taskId) ?? null)
      : null;
  const taskModalOpen = modalView.kind !== "closed";
  const classificationResult = classification(metrics);
  const dailyByDate = new Map(metrics.daily.map((day) => [day.date, day]));
  const selectedDay = dailyByDate.get(selectedDate) ?? metrics.daily[0];
  const todayIso = timelineIsoDate(initialNow);
  const selectedDayClosedForUser =
    !canManageAll && isAnalystTaskDayClosed(selectedDate, todayIso);
  const selectedTasks = tasksOverlappingDay(
    localTasks,
    activeTasks,
    selectedDate,
    initialNow,
  ).sort(
    (left, right) =>
      new Date(left.started_at).getTime() - new Date(right.started_at).getTime(),
  );
  const focusedTaskHasOverlap =
    focusedActiveTask != null &&
    taskHasActiveOverlap(focusedActiveTask, localTasks, activeTasks, initialNow);
  const firstWeekday = new Date(`${month}-01T12:00:00Z`).getUTCDay();
  const calendarCells: Array<AnalystTaskDay | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...metrics.daily,
  ];

  useEffect(() => {
    if (!taskModalOpen) {
      return;
    }
    const focusTarget = window.setTimeout(() => {
      if (modalView.kind === "complete") {
        concludeRef.current?.focus();
      } else {
        descriptionRef.current?.focus();
      }
    }, 0);
    return () => window.clearTimeout(focusTarget);
  }, [modalView, taskModalOpen]);

  useEffect(() => {
    if (modalView.kind !== "complete") {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setModalView({ kind: "closed" });
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modalView.kind]);

  useEffect(() => {
    if (
      !createState.success ||
      handledCreateSuccess.current === createState.success
    ) {
      return;
    }
    handledCreateSuccess.current = createState.success;
    if (createState.success === "Tarefa iniciada." && runningCount > 0) {
      const latestTask = activeOpenTasks.reduce((latest, task) =>
        new Date(task.started_at).getTime() > new Date(latest.started_at).getTime()
          ? task
          : latest,
      );
      setModalView({ kind: "complete", taskId: latestTask.id });
      return;
    }
    setModalView({ kind: "closed" });
  }, [createState.success, runningCount, activeOpenTasks]);

  useEffect(() => {
    if (
      !completeState.success ||
      handledCompleteSuccess.current === completeState.success
    ) {
      return;
    }
    handledCompleteSuccess.current = completeState.success;
    setModalView({ kind: "closed" });
  }, [completeState.success]);

  useEffect(() => {
    if (modalView.kind === "complete" && focusedActiveTask == null) {
      setModalView({ kind: "closed" });
    }
  }, [focusedActiveTask, modalView.kind]);

  useEffect(() => {
    if (!canEdit || taskModalOpen) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(target.tagName))
      ) {
        return;
      }
      event.preventDefault();
      openCreateModal();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [canEdit, taskModalOpen]);

  function navigate(nextMonth: string, nextDeveloperId = selectedDeveloperId) {
    const params = new URLSearchParams({
      month: nextMonth,
      developerId: nextDeveloperId,
    });
    startNavigation(() => router.push(`${pathname}?${params.toString()}`));
  }

  function applyContextFilters() {
    navigate(draftMonth, draftDeveloperId);
  }

  function openCreateModal() {
    startedAtEdited.current = false;
    setModalView({ kind: "create" });
  }

  function openCompleteModal(taskId: string) {
    setModalView({ kind: "complete", taskId });
  }

  function hideTaskModal() {
    setModalView({ kind: "closed" });
  }

  return (
    <>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-stretch">
        <div className="ui-kpi-grid--hero order-2 min-w-0 xl:order-1">
          <KpiMetricCard
            variant="hero"
            label="Tarefas concluídas"
            value={metrics.total_tasks}
            hint="No mês selecionado"
            tone="info"
          />
          <KpiMetricCard
            variant="hero"
            label="Horas realizadas"
            value={formatHours(metrics.total_hours)}
            hint={`Lançadas: ${formatHours(metrics.total_launched_hours)} · Contratado: ${formatHours(metrics.contracted_hours)}`}
            title="Tempo líquido do mês. Períodos com tarefas simultâneas contam uma vez."
            tone="brand"
          />
          <KpiMetricCard
            variant="hero"
            label="Horas conflitantes"
            value={formatHours(metrics.total_conflict_hours)}
            hint="Duplicidade por simultaneidade no mês"
            title={DAY_METRIC_HINTS.conflict}
            tone={
              metrics.total_conflict_hours > 0
                ? simultaneityAlertTone(
                    resolveSimultaneityAlertLevel(
                      metrics.total_hours > 0
                        ? (metrics.total_conflict_hours / metrics.total_hours) *
                            100
                        : null,
                    ),
                  )
                : "neutral"
            }
          />
          <KpiMetricCard
            variant="hero"
            label="Média por tarefa"
            value={formatHours(metrics.average_hours)}
            hint="Duração média lançada"
            tone="success"
          />
          <KpiMetricCard
            variant="hero"
            label="Horas urgentes"
            value={formatHours(metrics.urgent_hours)}
            hint="Atendimentos prioritários"
            tone={metrics.urgent_hours > 0 ? "warning" : "neutral"}
          />
          <KpiMetricCard
            variant="hero"
            label="Saldo mensal"
            value={`${metrics.delta_hours >= 0 ? "+" : ""}${formatHours(metrics.delta_hours)}`}
            hint="Realizadas − jornada contratada"
            title="Saldo com base nas horas realizadas (união), nunca nas lançadas."
            tone={metrics.delta_hours >= 0 ? "success" : "danger"}
          />
          <KpiMetricCard
            variant="hero"
            label="Classificação"
            value={classificationResult.label}
            hint="Volume + carga realizada"
            tone={classificationResult.tone}
          />
        </div>

        <aside className="order-1 flex w-full flex-col gap-2.5 rounded-[var(--radius)] border border-border bg-card p-3 shadow-[var(--shadow-sm)] sm:p-3.5 xl:order-2 xl:w-[17.5rem] xl:shrink-0 2xl:w-[19rem]">
          <div className="ui-field min-w-0">
            <label htmlFor="analyst-month" className="ui-label">
              Mês do log
            </label>
            <select
              id="analyst-month"
              value={draftMonth}
              disabled={pendingNavigation}
              onChange={(event) => setDraftMonth(event.target.value)}
              className="ui-select"
            >
              {monthOptions.map((option) => (
                <option key={option} value={option}>
                  {formatMonthOption(option)}
                </option>
              ))}
            </select>
          </div>
          {canManageAll ? (
            <div className="ui-field min-w-0">
              <label htmlFor="analyst-developer" className="ui-label">
                Analista
              </label>
              <select
                id="analyst-developer"
                value={draftDeveloperId}
                disabled={pendingNavigation}
                onChange={(event) => setDraftDeveloperId(event.target.value)}
                className="ui-select"
              >
                {analysts.map((analyst) => (
                  <option key={analyst.id} value={analyst.id}>
                    {analyst.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="rounded-[var(--radius-sm)] border border-border/70 bg-muted/20 px-2.5 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {selectedDeveloperName}
              </span>
              <span className="mx-1">·</span>
              {monthLabel}
            </p>
          )}
          <button
            type="button"
            className="ui-btn-secondary w-full justify-center"
            disabled={
              pendingNavigation ||
              (draftMonth === month &&
                draftDeveloperId === selectedDeveloperId)
            }
            onClick={applyContextFilters}
          >
            Aplicar
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={openCreateModal}
              className={`ui-btn-primary mt-auto w-full justify-center px-4 py-2.5 ${
                runningCount > 0 ? "ring-2 ring-brand/40" : ""
              }`}
            >
              <Play className="size-4" />
              Iniciar tarefa
              {runningCount > 0 ? (
                <span className="rounded-full bg-brand-foreground/15 px-2 py-0.5 text-[10px] font-semibold">
                  {runningCount} em andamento
                </span>
              ) : null}
              <span className="rounded border border-current/30 px-1.5 py-0.5 text-xs opacity-80">
                Enter
              </span>
            </button>
          ) : null}
        </aside>
      </div>

      {taskModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="analyst-task-modal-title"
            className="w-full max-w-xl rounded-[var(--radius-md)] border border-border bg-card p-5 shadow-[var(--shadow-lg)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-brand uppercase">
                  Produtividade
                </p>
                <h2
                  id="analyst-task-modal-title"
                  className="mt-1 text-lg font-semibold text-foreground"
                >
                  {modalView.kind === "complete"
                    ? focusedActiveTask?.status === "paused"
                      ? "Tarefa pausada"
                      : "Tarefa em andamento"
                    : "Iniciar tarefa"}
                </h2>
              </div>
              <button
                type="button"
                onClick={hideTaskModal}
                className="ui-btn-ghost px-2"
                aria-label="Fechar modal"
              >
                <X className="size-4" />
              </button>
            </div>

            {modalView.kind === "complete" && focusedActiveTask ? (
              <div className="mt-5 space-y-5">
                <div
                  className={cn(
                    "rounded-[var(--radius-sm)] border p-4",
                    focusedActiveTask.status === "paused"
                      ? "border-amber-500/40 bg-amber-500/10"
                      : "border-brand/30 bg-brand-soft",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">
                      {focusedActiveTask.description}
                    </span>
                    {focusedActiveTask.is_urgent ? (
                      <span className="inline-flex animate-pulse items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="size-3" />
                        URGENTE
                      </span>
                    ) : null}
                    {focusedActiveTask.status === "paused" ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        Pausada
                      </span>
                    ) : null}
                    {focusedTaskHasOverlap ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        Conflito simultâneo
                      </span>
                    ) : null}
                  </div>
                  {focusedTaskHasOverlap ? (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                      Esta tarefa coincide no horário com outra atividade do
                      mesmo dia. O registro continua permitido; a marcação é
                      apenas informativa.
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Iniciada em {formatDateTime(focusedActiveTask.started_at)}
                  </p>
                  <div className="mt-4 text-center">
                    <ActiveTimer
                      task={focusedActiveTask}
                      initialNow={initialNow}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {focusedActiveTask.status === "running" ? (
                    <form action={pauseAction}>
                      <input
                        type="hidden"
                        name="taskId"
                        value={focusedActiveTask.id}
                      />
                      <button
                        type="submit"
                        disabled={pausePending}
                        className="ui-btn-ghost border border-red-500/40 px-5 py-3 text-red-600 dark:text-red-300"
                      >
                        <Pause className="size-4" />
                        {pausePending ? "Pausando…" : "Pausar"}
                      </button>
                    </form>
                  ) : (
                    <form action={resumeAction}>
                      <input
                        type="hidden"
                        name="taskId"
                        value={focusedActiveTask.id}
                      />
                      <button
                        type="submit"
                        disabled={resumePending}
                        className="ui-btn-secondary px-5 py-3"
                      >
                        <Play className="size-4" />
                        {resumePending ? "Continuando…" : "Continuar"}
                      </button>
                    </form>
                  )}
                  <form action={completeAction} className="contents">
                    <input
                      type="hidden"
                      name="taskId"
                      value={focusedActiveTask.id}
                    />
                    <button
                      type="button"
                      onClick={hideTaskModal}
                      className="ui-btn-secondary px-5 py-3"
                    >
                      Ocultar
                      <span className="text-xs opacity-70">ESC</span>
                    </button>
                    <button
                      ref={concludeRef}
                      type="submit"
                      disabled={completePending}
                      className="ui-btn-primary px-6 py-3"
                    >
                      <Check className="size-4" />
                      {completePending ? "Concluindo…" : "Concluir tarefa"}
                      <span className="text-xs opacity-70">Enter</span>
                    </button>
                  </form>
                </div>
                <FormFeedback
                  error={
                    completeState.error ?? pauseState.error ?? resumeState.error
                  }
                  success={
                    completeState.success ??
                    pauseState.success ??
                    resumeState.success
                  }
                />
              </div>
            ) : modalView.kind === "create" ? (
              <form
                action={createAction}
                className="mt-5 space-y-4"
                onSubmit={(event) => {
                  if (!startedAtEdited.current) {
                    const startedAt = event.currentTarget.querySelector<
                      HTMLInputElement
                    >('input[name="startedAt"]');
                    if (startedAt) {
                      startedAt.value = nowInputValue();
                    }
                  }
                const useCurrentStart = event.currentTarget.querySelector<
                  HTMLInputElement
                >('input[name="useCurrentStart"]');
                if (useCurrentStart) {
                  useCurrentStart.value = startedAtEdited.current ? "off" : "on";
                }
                }}
              >
                <input
                  type="hidden"
                  name="developerId"
                  value={selectedDeveloperId}
                />
              <input type="hidden" name="useCurrentStart" value="off" />
                <FormField
                  label="O que você está fazendo?"
                  htmlFor="task-description"
                >
                  <input
                    ref={descriptionRef}
                    id="task-description"
                    name="description"
                    required
                    maxLength={500}
                    placeholder="Ex.: análise de incidente no ambiente de produção"
                    className="ui-input"
                  />
                </FormField>
                <FormField
                  label="Detalhes (opcional)"
                  htmlFor="task-details"
                  hint="Use este campo para contexto adicional da tarefa."
                >
                  <textarea
                    id="task-details"
                    name="details"
                    maxLength={2000}
                    placeholder="Contexto, resultado ou observações adicionais"
                    className="ui-input min-h-20 resize-y"
                  />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Início" htmlFor="task-started-at">
                    <input
                      id="task-started-at"
                      type="datetime-local"
                      name="startedAt"
                      defaultValue={localInputValue(defaultStartedAt)}
                      required
                      onChange={() => {
                        startedAtEdited.current = true;
                      }}
                      className="ui-input"
                    />
                  </FormField>
                  <FormField
                    label="Término (opcional)"
                    htmlFor="task-ended-at"
                    hint="Preencha apenas para um lançamento retroativo."
                  >
                    <input
                      id="task-ended-at"
                      type="datetime-local"
                      name="endedAt"
                      className="ui-input"
                    />
                  </FormField>
                </div>
                <label className="ui-check">
                  <input
                    name="isUrgent"
                    type="checkbox"
                    className="ui-checkbox mt-0.5"
                  />
                  <span>Atendimento urgente</span>
                </label>
                <FormFeedback
                  error={createState.error}
                  success={createState.success}
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={createPending}
                    className="ui-btn-primary px-6 py-3"
                  >
                    <Play className="size-4" />
                    {createPending ? "Iniciando…" : "Iniciar tarefa"}
                    <span className="text-xs opacity-70">Enter</span>
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_13.5rem_minmax(0,1fr)] xl:items-start">
        <SectionShell
          title="Calendário"
          description="Selecione um dia."
          actions={
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" />
              {monthLabel}
            </span>
          }
        >
          <div className="grid grid-cols-7 gap-1">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
              <div
                key={day}
                className="px-0.5 py-0.5 text-center text-[9px] font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {day}
              </div>
            ))}
            {calendarCells.map((day, index) =>
              day ? (
                <DayCell
                  key={day.date}
                  day={day}
                  selected={day.date === selectedDate}
                  onSelect={() => setSelectedDate(day.date)}
                />
              ) : (
                <div key={`empty-${index}`} className="min-h-[3.25rem]" />
              ),
            )}
          </div>
        </SectionShell>

        <SectionShell
          title="Resumo do dia"
          description={
            selectedDay ? formatDayLabel(selectedDate) : "Selecione um dia"
          }
        >
          {selectedDay ? (
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
              <KpiMetricCard
                label="Horas realizadas"
                value={formatHours(selectedDay.hours)}
                hint={`Lançadas ${formatHours(selectedDay.launched_hours)}`}
                title={DAY_METRIC_HINTS.realized}
                tone="brand"
                className={DAY_KPI_CARD_CLASS}
              />
              <KpiMetricCard
                label="Horas conflitantes"
                value={formatHours(selectedDay.conflict_hours)}
                hint="Só simultaneidade"
                title={DAY_METRIC_HINTS.conflict}
                tone={
                  selectedDay.conflict_hours > 0
                    ? simultaneityAlertTone(
                        resolveSimultaneityAlertLevel(
                          selectedDay.simultaneity_percent,
                        ),
                      )
                    : "neutral"
                }
                className={DAY_KPI_CARD_CLASS}
              />
              <KpiMetricCard
                label="Jornada contratada"
                value={formatHours(selectedDay.contracted_hours)}
                hint="Cadastro do dia"
                title={DAY_METRIC_HINTS.contracted}
                tone="neutral"
                className={DAY_KPI_CARD_CLASS}
              />
              <KpiMetricCard
                label="Saldo do dia"
                value={`${selectedDay.delta_hours >= 0 ? "+" : ""}${formatHours(selectedDay.delta_hours)}`}
                hint="Realizadas − jornada"
                title={DAY_METRIC_HINTS.balance}
                tone={selectedDay.delta_hours >= 0 ? "success" : "danger"}
                className={DAY_KPI_CARD_CLASS}
              />
              <KpiMetricCard
                label="Intensidade de simultaneidade"
                value={formatPercent(selectedDay.simultaneity_percent)}
                hint={
                  selectedDay.simultaneity_percent == null
                    ? "Sem horas realizadas"
                    : resolveSimultaneityAlertLevel(
                        selectedDay.simultaneity_percent,
                      )
                }
                title={DAY_METRIC_HINTS.simultaneity}
                tone={simultaneityAlertTone(
                  resolveSimultaneityAlertLevel(
                    selectedDay.simultaneity_percent,
                  ),
                )}
                className={cn(DAY_KPI_CARD_CLASS, "col-span-2 xl:col-span-1")}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Escolha um dia no calendário para ver o resumo.
            </p>
          )}
        </SectionShell>

        <SectionShell
          title={selectedDay ? `Tarefas de ${formatDayLabel(selectedDate)}` : "Tarefas do dia"}
          description={
            selectedDay
              ? `${formatHours(selectedDay.hours)} realizados · ${selectedDay.delta_hours >= 0 ? "+" : ""}${formatHours(selectedDay.delta_hours)} saldo do dia`
              : undefined
          }
        >
          {selectedDayClosedForUser ? (
            <div className="mb-3 flex items-start gap-2 rounded-[var(--radius-sm)] border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-900 dark:text-amber-100">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <p>
                Este dia já foi encerrado. Não é mais possível editar ou excluir
                apontamentos. Solicite a alteração ao gestor.
              </p>
            </div>
          ) : null}
          <FormFeedback
            error={ackState.error ?? clearAckState.error}
            success={ackState.success ?? clearAckState.success}
          />
          <div className="max-h-[30rem] space-y-2 overflow-y-auto overscroll-contain pr-1 lg:max-h-[36rem]">
            {selectedTasks.length > 0 ? (
              selectedTasks.map((task) => {
                const taskDayIso = localDateIsoFromInstant(task.started_at);
                const taskDayClosed =
                  !canManageAll &&
                  isAnalystTaskDayClosed(taskDayIso, todayIso);
                const canEditRecord = canEdit && !taskDayClosed;
                const canOperateTimer =
                  canEdit &&
                  canOperateActiveAnalystTimer({
                    isManager: canManageAll,
                    status: task.status,
                    taskDayIso,
                    todayIso,
                  });
                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    initialNow={initialNow}
                    onEdit={() => {
                      if (!canEditRecord) {
                        return;
                      }
                      setEditingTask(task);
                    }}
                    onOpenTimer={() => openCompleteModal(task.id)}
                    onPause={() => {
                      const formData = new FormData();
                      formData.set("taskId", task.id);
                      pauseAction(formData);
                    }}
                    onResume={() => {
                      const formData = new FormData();
                      formData.set("taskId", task.id);
                      resumeAction(formData);
                    }}
                    pausePending={pausePending}
                    resumePending={resumePending}
                    canEditRecord={canEditRecord}
                    canDelete={
                      canDelete &&
                      task.status === "completed" &&
                      canEditRecord
                    }
                    canOperateTimer={canOperateTimer}
                    canAcknowledge={canManageAll}
                    acknowledgePending={
                      acknowledgePending && ackTaskId === task.id
                    }
                    onAcknowledge={() => {
                      setAckTaskId(task.id);
                      const formData = new FormData();
                      formData.set("taskId", task.id);
                      ackAction(formData);
                    }}
                    onClearAcknowledgment={() => {
                      setAckTaskId(task.id);
                      const formData = new FormData();
                      formData.set("taskId", task.id);
                      clearAckAction(formData);
                    }}
                  />
                );
              })
            ) : (
              <div className="rounded-[var(--radius-sm)] border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhuma tarefa neste dia.
              </div>
            )}
          </div>
        </SectionShell>
      </div>

      <SectionShell
        title="Linha do tempo"
        description={`Atividades de ${formatDayLabel(selectedDate)} em formato de cronograma. Faixas tracejadas indicam janelas de simultaneidade; números consolidados usam só tarefas concluídas.`}
      >
        <AnalystDayTimeline
          dateIso={selectedDate}
          dateLabel={formatDayLabel(selectedDate)}
          tasks={localTasks}
          activeTasks={activeTasks}
          initialNow={initialNow}
        />
      </SectionShell>

      {editingTask ? (
        <EditTaskDialog
          task={editingTask}
          onClose={() => setEditingTask(null)}
        />
      ) : null}
    </>
  );
}

function formatMonthOption(value: string): string {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function formatDayLabel(value: string): string {
  return dayFormatter.format(new Date(`${value}T12:00:00Z`));
}
