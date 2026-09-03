"use client";

import { commitAttendanceDraftAction } from "@/app/app/gestor/folha/actions";
import { PersonAvatar } from "@/components/person-avatar";
import {
  WEEKDAY_OPTIONS,
  isCalendarWeekend,
  resolveBatchTargetDays,
  resolveFillMonthDefaultPatches,
  resolveWorkweekKindPatches,
  resolveZeroWeekendPatches,
  type BatchApplyMode,
  type BatchApplyPatch,
} from "@/lib/metrics/payroll-attendance-batch";
import {
  HOLIDAY_OVERLAY_RING_CLASS,
  toHolidayOverlay,
  type HolidayOverlayEntry,
} from "@/lib/metrics/holiday-overlay";
import { cn } from "@/lib/utils";
import {
  PAYROLL_ATTENDANCE_KIND_LABELS,
  type PayrollAttendanceDay,
  type PayrollAttendanceKind,
  type PayrollClosingItem,
} from "@/types/payroll-closing";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type PayrollAttendancePanelProps = {
  item: PayrollClosingItem;
  days: PayrollAttendanceDay[];
  onClose: () => void;
  readOnly?: boolean;
  finalizedClosingId?: string | null;
  /** Applicable holidays for this developer/month (visual overlay only). */
  holidays?: ReadonlyArray<HolidayOverlayEntry>;
  avatarUrl?: string | null;
  /** When true, omit outer section chrome for embedding in a modal. */
  embedded?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
};

/** Kinds editable in Folha UI — holiday is overlay-only, not selectable. */
const EDITABLE_ATTENDANCE_KINDS = [
  "presencial",
  "home",
  "off",
  "makeup",
  "weekend",
] as const satisfies ReadonlyArray<PayrollAttendanceKind>;

type EditableAttendanceKind = (typeof EDITABLE_ATTENDANCE_KINDS)[number];

const KIND_CARD_CLASS: Record<PayrollAttendanceKind, string> = {
  presencial:
    "border-emerald-500/35 bg-emerald-500/10 dark:border-emerald-400/30 dark:bg-emerald-400/10",
  home: "border-sky-500/35 bg-sky-500/10 dark:border-sky-400/30 dark:bg-sky-400/10",
  off: "border-amber-500/40 bg-amber-500/10 dark:border-amber-400/30 dark:bg-amber-400/10",
  holiday:
    "border-rose-500/40 bg-rose-500/10 dark:border-rose-400/35 dark:bg-rose-400/10",
  weekend:
    "border-violet-500/30 bg-violet-500/10 dark:border-violet-400/25 dark:bg-violet-400/10",
  makeup:
    "border-indigo-500/40 bg-indigo-500/10 dark:border-indigo-400/30 dark:bg-indigo-400/10",
};

const LEGEND: Array<{ kind: EditableAttendanceKind; swatch: string }> = [
  { kind: "presencial", swatch: "bg-emerald-500/70" },
  { kind: "home", swatch: "bg-sky-500/70" },
  { kind: "off", swatch: "bg-amber-500/70" },
  { kind: "makeup", swatch: "bg-indigo-500/70" },
  { kind: "weekend", swatch: "bg-violet-500/70" },
];

function weekdayLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date);
}

function dayNumber(isoDate: string): string {
  return isoDate.slice(8, 10);
}

function monthBounds(days: PayrollAttendanceDay[]): {
  start: string;
  end: string;
} | null {
  if (days.length === 0) {
    return null;
  }
  return {
    start: days[0]!.day_on,
    end: days[days.length - 1]!.day_on,
  };
}

function defaultHoursForKind(
  kind: PayrollAttendanceKind,
  contractedHoursPerDay: number,
): number {
  if (kind === "presencial" || kind === "home") {
    return Math.max(0, contractedHoursPerDay);
  }
  return 0;
}

function isSameDayState(
  a: PayrollAttendanceDay,
  b: PayrollAttendanceDay,
): boolean {
  return (
    a.day_kind === b.day_kind &&
    a.charges_meal === b.charges_meal &&
    Math.abs(a.hours - b.hours) < 0.001
  );
}

export function PayrollAttendancePanel({
  item,
  days,
  onClose,
  readOnly = false,
  finalizedClosingId = null,
  holidays = [],
  avatarUrl = null,
  embedded = false,
  onDirtyChange,
}: PayrollAttendancePanelProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sourceItemId, setSourceItemId] = useState(item.id);
  const [baseline, setBaseline] = useState(days);
  const [localDays, setLocalDays] = useState(days);
  const holidayOverlay = useMemo(() => toHolidayOverlay(holidays), [holidays]);

  const bounds = useMemo(() => monthBounds(days), [days]);
  const monthKey = bounds ? `${bounds.start}:${bounds.end}` : "";

  const [batchKind, setBatchKind] =
    useState<EditableAttendanceKind>("presencial");
  const [batchWeekdays, setBatchWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [rangeStart, setRangeStart] = useState(bounds?.start ?? "");
  const [rangeEnd, setRangeEnd] = useState(bounds?.end ?? "");
  const [rangeMonthKey, setRangeMonthKey] = useState(monthKey);
  const [batchMode, setBatchMode] = useState<BatchApplyMode>("overwrite");

  if (item.id !== sourceItemId) {
    setSourceItemId(item.id);
    setBaseline(days);
    setLocalDays(days);
    setError(null);
    setInfo(null);
  }

  if (monthKey !== rangeMonthKey) {
    setRangeMonthKey(monthKey);
    setRangeStart(bounds?.start ?? "");
    setRangeEnd(bounds?.end ?? "");
  }

  const dirtyDays = useMemo(() => {
    const byDate = new Map(baseline.map((day) => [day.day_on, day]));
    return localDays.filter((day) => {
      const saved = byDate.get(day.day_on);
      return saved == null || !isSameDayState(day, saved);
    });
  }, [baseline, localDays]);
  const dirtyCount = dirtyDays.length;
  const locked = saving || readOnly;

  useEffect(() => {
    onDirtyChange?.(dirtyCount > 0);
  }, [dirtyCount, onDirtyChange]);

  useEffect(() => {
    if (dirtyCount === 0) {
      return;
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirtyCount]);

  function applyLocalPatches(patches: BatchApplyPatch[]) {
    const byDay = new Map(patches.map((patch) => [patch.dayOn, patch]));
    setLocalDays((prev) =>
      prev.map((day) => {
        const patch = byDay.get(day.day_on);
        if (!patch) {
          return day;
        }
        const dayKind = patch.dayKind as PayrollAttendanceKind;
        return {
          ...day,
          day_kind: dayKind,
          hours: patch.hours,
          charges_meal:
            dayKind === "presencial"
              ? day.day_kind === "presencial"
                ? day.charges_meal
                : true
              : false,
        };
      }),
    );
  }

  function updateDay(input: {
    dayOn: string;
    dayKind: PayrollAttendanceKind;
    chargesMeal?: boolean;
  }) {
    if (readOnly) {
      return;
    }
    const hours = defaultHoursForKind(
      input.dayKind,
      item.contracted_hours_per_day,
    );
    setError(null);
    setInfo(null);
    setLocalDays((prev) =>
      prev.map((day) => {
        if (day.day_on !== input.dayOn) {
          return day;
        }
        return {
          ...day,
          day_kind: input.dayKind,
          hours,
          charges_meal:
            input.chargesMeal ?? input.dayKind === "presencial",
        };
      }),
    );
  }

  function snapshots() {
    return localDays.map((day) => ({
      day_on: day.day_on,
      day_kind: day.day_kind,
      hours: day.hours,
    }));
  }

  function applyBatchLocally(
    patches: BatchApplyPatch[],
    emptyMessage: string,
  ) {
    if (readOnly) {
      return;
    }
    setError(null);
    if (patches.length === 0) {
      setInfo(emptyMessage);
      return;
    }
    applyLocalPatches(patches);
    setInfo(
      `${patches.length} dia(s) atualizado(s) no calendário. Salve para gravar na folha.`,
    );
  }

  function runShortcut(
    shortcut:
      | "fill_month_default"
      | "workweek_home"
      | "workweek_presencial"
      | "zero_weekends",
  ) {
    const contracted = item.contracted_hours_per_day;
    const daysSnap = snapshots();
    if (shortcut === "fill_month_default") {
      applyBatchLocally(
        resolveFillMonthDefaultPatches({
          days: daysSnap,
          contractedHoursPerDay: contracted,
        }),
        "Nenhum dia alterado com os critérios atuais.",
      );
      return;
    }
    if (shortcut === "zero_weekends") {
      applyBatchLocally(
        resolveZeroWeekendPatches({
          days: daysSnap,
          rangeStart: rangeStart || null,
          rangeEnd: rangeEnd || null,
        }),
        "Nenhum dia alterado com os critérios atuais.",
      );
      return;
    }
    applyBatchLocally(
      resolveWorkweekKindPatches({
        days: daysSnap,
        dayKind: shortcut === "workweek_home" ? "home" : "presencial",
        contractedHoursPerDay: contracted,
        rangeStart: rangeStart || null,
        rangeEnd: rangeEnd || null,
      }),
      "Nenhum dia alterado com os critérios atuais.",
    );
  }

  function applyCustomBatch() {
    applyBatchLocally(
      resolveBatchTargetDays({
        days: snapshots(),
        dayKind: batchKind,
        hours: defaultHoursForKind(batchKind, item.contracted_hours_per_day),
        weekdays: batchWeekdays,
        rangeStart: rangeStart || null,
        rangeEnd: rangeEnd || null,
        mode: batchMode,
        contractedHoursPerDay: item.contracted_hours_per_day,
      }),
      "Nenhum dia alterado com os critérios atuais.",
    );
  }

  function discardDraft() {
    setLocalDays(baseline);
    setError(null);
    setInfo("Alterações descartadas.");
  }

  async function saveDraft() {
    if (readOnly || dirtyCount === 0 || saving) {
      return;
    }
    setError(null);
    setInfo(null);
    setSaving(true);
    try {
      const result = await commitAttendanceDraftAction({
        itemId: item.id,
        patches: dirtyDays.map((day) => ({
          dayOn: day.day_on,
          dayKind: day.day_kind,
          hours: day.hours,
          chargesMeal: day.charges_meal,
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBaseline(localDays);
      setInfo(
        result.updatedCount === 0
          ? "Nada para salvar."
          : `${result.updatedCount} dia(s) gravado(s) na folha.`,
      );
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function toggleWeekday(value: number) {
    setBatchWeekdays((prev) =>
      prev.includes(value)
        ? prev.filter((day) => day !== value)
        : [...prev, value].sort((a, b) => {
            const order = [1, 2, 3, 4, 5, 6, 0];
            return order.indexOf(a) - order.indexOf(b);
          }),
    );
  }

  function requestClose() {
    if (
      !embedded &&
      dirtyCount > 0 &&
      !window.confirm(
        "Há alterações não salvas. Sair do calendário mesmo assim?",
      )
    ) {
      return;
    }
    onClose();
  }

  return (
    <section
      className={
        embedded
          ? "space-y-4"
          : "ui-dashboard-panel space-y-4"
      }
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          {embedded ? null : (
            <div className="flex items-center gap-2.5">
              <PersonAvatar
                name={item.developer_name}
                src={avatarUrl}
                size="md"
              />
              <h2 className="text-base font-semibold text-foreground">
                Presença e refeição · {item.developer_name}
              </h2>
            </div>
          )}
          <p className="text-sm text-muted-foreground text-pretty">
            <span className="font-medium text-foreground">Presencial</span> =
            deslocamento; marque{" "}
            <span className="font-medium text-foreground">Refeição</span> quando
            couber.{" "}
            <span className="font-medium text-foreground">Falta / folga</span>{" "}
            conta no compare (Fixo sem Jira). Home = trabalhou sem deslocamento.
            Feriados são só referência visual.             Carga da NF vem do Jira ou das
            faltas conforme o cadastro — não das horas digitadas aqui. As
            mudanças no calendário só entram na folha quando você salvar.
          </p>
          {finalizedClosingId ? (
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Fechamento mensal finalizado — presença somente leitura.{" "}
              <Link
                href={`/app/gestor/fechamentos/${finalizedClosingId}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                Reabra o fechamento
              </Link>{" "}
              para editar.
            </p>
          ) : null}
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {LEGEND.map((row) => (
              <li key={row.kind} className="inline-flex items-center gap-1.5">
                <span
                  className={cn("size-2.5 rounded-sm", row.swatch)}
                  aria-hidden
                />
                {PAYROLL_ATTENDANCE_KIND_LABELS[row.kind]}
              </li>
            ))}
            <li className="inline-flex items-center gap-1.5">
              <span
                className={cn("size-2.5 rounded-sm bg-rose-500/70")}
                aria-hidden
              />
              Feriado (referência)
            </li>
          </ul>
        </div>
        {embedded ? null : (
          <button
            type="button"
            className="ui-btn-secondary text-sm"
            onClick={requestClose}
          >
            Fechar calendário
          </button>
        )}
      </div>

      <div className="space-y-3 rounded-[var(--radius-sm)] border border-border/80 bg-muted/20 p-3">
        <div className="ui-control-row">
          <button
            type="button"
            className="ui-btn-secondary"
            disabled={locked}
            onClick={() => runShortcut("fill_month_default")}
          >
            Preencher mês padrão
          </button>
          <button
            type="button"
            className="ui-btn-secondary"
            disabled={locked}
            onClick={() => runShortcut("workweek_home")}
          >
            Marcar úteis como home office
          </button>
          <button
            type="button"
            className="ui-btn-secondary"
            disabled={locked}
            onClick={() => runShortcut("workweek_presencial")}
          >
            Marcar úteis como presencial
          </button>
          <button
            type="button"
            className="ui-btn-secondary"
            disabled={locked}
            onClick={() => runShortcut("zero_weekends")}
          >
            Zerar fins de semana
          </button>
        </div>

        <div className="space-y-2 border-t border-border/60 pt-3">
          <p className="text-xs font-medium text-foreground">Aplicar em lote</p>
          <p className="text-[11px] text-muted-foreground">
            Atualiza só o calendário abaixo. Use Salvar alterações para gravar
            na folha.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Tipo</span>
              <select
                className="ui-select"
                value={batchKind}
                disabled={locked}
                onChange={(event) =>
                  setBatchKind(event.target.value as EditableAttendanceKind)
                }
              >
                {EDITABLE_ATTENDANCE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {PAYROLL_ATTENDANCE_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">De</span>
              <input
                type="date"
                className="ui-input"
                value={rangeStart}
                disabled={locked}
                min={bounds?.start}
                max={bounds?.end}
                onChange={(event) => setRangeStart(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Até</span>
              <input
                type="date"
                className="ui-input"
                value={rangeEnd}
                disabled={locked}
                min={bounds?.start}
                max={bounds?.end}
                onChange={(event) => setRangeEnd(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Modo</span>
              <select
                className="ui-select"
                value={batchMode}
                disabled={locked}
                onChange={(event) =>
                  setBatchMode(event.target.value as BatchApplyMode)
                }
              >
                <option value="overwrite">Sobrescrever dias existentes</option>
                <option value="fill_unfilled">
                  Só dias ainda no padrão inicial
                </option>
              </select>
            </label>
          </div>

          <div className="ui-control-row">
            <span className="mr-1 text-xs text-muted-foreground">Dias</span>
            {WEEKDAY_OPTIONS.map((weekday) => {
              const active = batchWeekdays.includes(weekday.value);
              return (
                <button
                  key={weekday.value}
                  type="button"
                  disabled={locked}
                  className={cn(
                    "inline-flex h-8 min-h-8 items-center rounded-[calc(var(--radius-sm)-2px)] border px-2 text-xs font-medium transition-colors",
                    active
                      ? "border-brand/40 bg-brand-soft text-brand-foreground"
                      : "border-border bg-card/50 text-muted-foreground hover:bg-muted/50",
                  )}
                  onClick={() => toggleWeekday(weekday.value)}
                >
                  {weekday.short}
                </button>
              );
            })}
            <button
              type="button"
              className="ui-btn-secondary ml-auto shrink-0"
              disabled={locked || batchWeekdays.length === 0}
              onClick={applyCustomBatch}
            >
              Aplicar no calendário
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <p className="ui-alert-error" role="alert">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="ui-alert-success" role="status">
          {info}
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {localDays.map((day) => {
          const weekend = isCalendarWeekend(day.day_on);
          const holidayName = holidayOverlay.byDate.get(day.day_on);
          const isHolidayOverlay = holidayName != null;
          const isLegacyHolidayKind = day.day_kind === "holiday";
          const saved = baseline.find((row) => row.day_on === day.day_on);
          const isDirty = saved == null || !isSameDayState(day, saved);
          return (
            <div
              key={day.id}
              title={
                isHolidayOverlay ? `Feriado: ${holidayName}` : undefined
              }
              className={cn(
                "space-y-2 rounded-[var(--radius-sm)] border p-2.5",
                KIND_CARD_CLASS[day.day_kind],
                weekend && day.day_kind !== "weekend"
                  ? "ring-1 ring-violet-500/25"
                  : null,
                isHolidayOverlay ? HOLIDAY_OVERLAY_RING_CLASS : null,
                isDirty ? "ring-2 ring-brand/50" : null,
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium tabular-nums">
                  {dayNumber(day.day_on)}
                </span>
                <span
                  className={cn(
                    "text-[11px] uppercase",
                    weekend
                      ? "font-semibold text-violet-700 dark:text-violet-300"
                      : "text-muted-foreground",
                  )}
                >
                  {weekdayLabel(day.day_on)}
                </span>
              </div>
              {isHolidayOverlay ? (
                <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                  Feriado: {holidayName}
                </p>
              ) : null}
              <select
                className="ui-select ui-control-sm"
                value={day.day_kind}
                disabled={locked}
                onChange={(event) => {
                  const nextKind = event.target
                    .value as PayrollAttendanceKind;
                  updateDay({
                    dayOn: day.day_on,
                    dayKind: nextKind,
                    chargesMeal: nextKind === "presencial",
                  });
                }}
              >
                {isLegacyHolidayKind ? (
                  <option value="holiday">Feriado (legado — trocar)</option>
                ) : null}
                {EDITABLE_ATTENDANCE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {PAYROLL_ATTENDANCE_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
              {day.day_kind === "presencial" ? (
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-[var(--brand)]"
                    checked={day.charges_meal}
                    disabled={locked}
                    onChange={(event) => {
                      updateDay({
                        dayOn: day.day_on,
                        dayKind: day.day_kind,
                        chargesMeal: event.target.checked,
                      });
                    }}
                  />
                  Refeição
                </label>
              ) : null}
            </div>
          );
        })}
      </div>

      {dirtyCount > 0 || saving ? (
        <div className="sticky bottom-3 z-20 flex flex-col gap-2 rounded-[var(--radius-sm)] border border-brand/30 bg-card/95 p-3 shadow-[var(--shadow-md)] backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-foreground">
            {saving
              ? "Gravando na folha…"
              : `${dirtyCount} dia(s) com alteração ainda não salva.`}
          </p>
          <div className="ui-control-row">
            <button
              type="button"
              className="ui-btn-secondary"
              disabled={saving || readOnly}
              onClick={discardDraft}
            >
              Descartar
            </button>
            <button
              type="button"
              className="ui-btn-primary"
              disabled={saving || readOnly || dirtyCount === 0}
              onClick={() => {
                void saveDraft();
              }}
            >
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
