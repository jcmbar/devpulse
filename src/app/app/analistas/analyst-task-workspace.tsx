"use client";

import { AnalystDayTimeline } from "@/app/app/analistas/analyst-day-timeline";
import {
  completeAnalystTaskAction,
  createAnalystTaskAction,
  deleteAnalystTaskAction,
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
import type {
  AnalystTask,
  AnalystTaskDay,
  AnalystTaskMetrics,
} from "@/types/analyst-task";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Pencil,
  Play,
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

const initialState: AnalystTaskActionState = { error: null, success: null };

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

function formatDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}

function formatTime(value: string): string {
  return timeFormatter.format(new Date(value));
}

function formatElapsed(startedAt: string, now: number): string {
  const seconds = Math.max(
    0,
    Math.floor((now - new Date(startedAt).getTime()) / 1000),
  );
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

function isoDateFromInstant(value: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
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
      className={`min-h-[4.5rem] rounded-[var(--radius-sm)] border p-1.5 text-left transition ${
        selected
          ? "border-brand bg-brand-soft shadow-[var(--shadow-sm)]"
          : "border-border bg-card hover:border-brand/50 hover:bg-muted/30"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-semibold text-foreground">{dayNumber}</span>
      </div>
      {day.task_count > 0 ? (
        <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Registrado
        </span>
      ) : (
        <span className="mt-1.5 inline-flex animate-pulse items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
          <span className="size-1.5 rounded-full bg-amber-500" />
          Ausente
        </span>
      )}
      {day.contracted_hours > 0 || day.hours > 0 ? (
        <div className="mt-1 space-y-0.5">
          <p className="text-[10px] font-semibold tabular-nums text-foreground">
            {formatHours(day.hours)}
          </p>
          {day.contracted_hours > 0 ? (
            <p
              className={`text-[9px] tabular-nums ${
                day.delta_hours >= 0
                  ? "text-emerald-600/90 dark:text-emerald-400/90"
                  : "text-amber-700/90 dark:text-amber-300/90"
              }`}
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
  startedAt,
  initialNow,
  className,
}: {
  startedAt: string;
  initialNow: string;
  className?: string;
}) {
  const startedMs = new Date(startedAt).getTime();
  const [elapsedSeconds, setElapsedSeconds] = useState(() => {
    const elapsedMs = Math.max(0, new Date(initialNow).getTime() - startedMs);
    return Math.floor(elapsedMs / 1000);
  });

  useEffect(() => {
    const elapsedMs = Math.max(0, new Date(initialNow).getTime() - startedMs);
    const baseSeconds = Math.floor(elapsedMs / 1000);
    const anchor = performance.now();

    setElapsedSeconds(baseSeconds);

    const tick = () => {
      setElapsedSeconds(
        baseSeconds + Math.floor((performance.now() - anchor) / 1000),
      );
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, initialNow, startedMs]);

  return (
    <span
      className={cn(
        "font-mono font-semibold tabular-nums text-brand-foreground",
        className ?? "text-xl",
      )}
    >
      {formatElapsed(startedAt, startedMs + elapsedSeconds * 1000)}
    </span>
  );
}

function TaskRow({
  task,
  initialNow,
  onEdit,
  onContinue,
  canDelete,
}: {
  task: AnalystTask;
  initialNow: string;
  onEdit: () => void;
  onContinue: () => void;
  canDelete: boolean;
}) {
  const isRunning = task.status === "running";

  return (
    <div
      className={`flex flex-col gap-3 rounded-[var(--radius-sm)] border bg-card px-3 py-3 sm:flex-row sm:items-start sm:justify-between ${
        isRunning ? "border-brand/40 bg-brand-soft/20" : "border-border"
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
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            DevPulse
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatTime(task.started_at)} →{" "}
          {task.ended_at ? formatTime(task.ended_at) : "em andamento"} ·{" "}
          {formatHours(task.duration_hours)}
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
        <div className="flex gap-2">
          {isRunning ? (
            <button type="button" onClick={onContinue} className="ui-btn-secondary">
              <Play className="size-3.5" />
              Continuar
            </button>
          ) : (
            <button type="button" onClick={onEdit} className="ui-btn-secondary">
              <Pencil className="size-3.5" />
              Editar
            </button>
          )}
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
            <button type="submit" className="ui-btn-ghost text-red-600 dark:text-red-300">
              <Trash2 className="size-3.5" />
              Excluir
            </button>
          </form>
        ) : null}
        </div>
        {isRunning ? (
          <ActiveTimer
            startedAt={task.started_at}
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
  const runningTasks = activeTasks;
  const runningCount = runningTasks.length;
  const focusedRunningTask =
    modalView.kind === "complete"
      ? (runningTasks.find((task) => task.id === modalView.taskId) ?? null)
      : null;
  const taskModalOpen = modalView.kind !== "closed";
  const classificationResult = classification(metrics);
  const dailyByDate = new Map(metrics.daily.map((day) => [day.date, day]));
  const selectedDay = dailyByDate.get(selectedDate) ?? metrics.daily[0];
  const selectedTasks = tasksOverlappingDay(
    tasks,
    activeTasks,
    selectedDate,
    initialNow,
  ).sort(
    (left, right) =>
      new Date(left.started_at).getTime() - new Date(right.started_at).getTime(),
  );
  const focusedTaskHasOverlap =
    focusedRunningTask != null &&
    taskHasActiveOverlap(focusedRunningTask, tasks, activeTasks, initialNow);
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
      const latestTask = runningTasks.reduce((latest, task) =>
        new Date(task.started_at).getTime() > new Date(latest.started_at).getTime()
          ? task
          : latest,
      );
      setModalView({ kind: "complete", taskId: latestTask.id });
      return;
    }
    setModalView({ kind: "closed" });
  }, [createState.success, runningCount, runningTasks]);

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
    if (modalView.kind === "complete" && focusedRunningTask == null) {
      setModalView({ kind: "closed" });
    }
  }, [focusedRunningTask, modalView.kind]);

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
            hint={`Contratado: ${formatHours(metrics.contracted_hours)}`}
            tone="brand"
          />
          <KpiMetricCard
            variant="hero"
            label="Média por tarefa"
            value={formatHours(metrics.average_hours)}
            hint="Duração média"
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
            label="Diferença mensal"
            value={`${metrics.delta_hours >= 0 ? "+" : ""}${formatHours(metrics.delta_hours)}`}
            hint="Realizado − contratado"
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
                    ? "Tarefa em andamento"
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

            {modalView.kind === "complete" && focusedRunningTask ? (
              <div className="mt-5 space-y-5">
                <div className="rounded-[var(--radius-sm)] border border-brand/30 bg-brand-soft p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-brand-foreground">
                      {focusedRunningTask.description}
                    </span>
                    {focusedRunningTask.is_urgent ? (
                      <span className="inline-flex animate-pulse items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="size-3" />
                        URGENTE
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
                    Iniciada em {formatDateTime(focusedRunningTask.started_at)}
                  </p>
                  <div className="mt-4 text-center">
                    <ActiveTimer
                      startedAt={focusedRunningTask.started_at}
                      initialNow={initialNow}
                    />
                  </div>
                </div>
                <form action={completeAction} className="flex justify-end gap-2">
                  <input
                    type="hidden"
                    name="taskId"
                    value={focusedRunningTask.id}
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
                <FormFeedback
                  error={completeState.error}
                  success={completeState.success}
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
        <SectionShell
          title="Calendário de atividades"
          description="Selecione um dia para consultar os registros realizados."
          actions={
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" />
              {monthLabel}
            </span>
          }
        >
          <div className="grid grid-cols-7 gap-1.5">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
              <div
                key={day}
                className="px-1 py-1 text-center text-[10px] font-semibold tracking-wide text-muted-foreground uppercase"
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
                <div key={`empty-${index}`} className="min-h-[4.5rem]" />
              ),
            )}
          </div>
        </SectionShell>

        <SectionShell
          title={selectedDay ? `Tarefas de ${formatDayLabel(selectedDate)}` : "Tarefas do dia"}
          description={
            selectedDay
              ? `${formatHours(selectedDay.hours)} realizados · ${selectedDay.delta_hours >= 0 ? "+" : ""}${formatHours(selectedDay.delta_hours)} contra o dia contratado`
              : undefined
          }
        >
          <div className="max-h-[30rem] space-y-2 overflow-y-auto overscroll-contain pr-1 lg:max-h-[36rem]">
            {selectedTasks.length > 0 ? (
              selectedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  initialNow={initialNow}
                  onEdit={() => setEditingTask(task)}
                  onContinue={() => openCompleteModal(task.id)}
                  canDelete={canDelete && task.status === "completed"}
                />
              ))
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
        description={`Atividades de ${formatDayLabel(selectedDate)} em formato de cronograma. Marcações pontilhadas indicam sobreposição simultânea.`}
      >
        <AnalystDayTimeline
          dateIso={selectedDate}
          dateLabel={formatDayLabel(selectedDate)}
          tasks={tasks}
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
