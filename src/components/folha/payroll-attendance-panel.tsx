"use client";

import {
  batchApplyAttendanceAction,
  upsertAttendanceDayAction,
} from "@/app/app/gestor/folha/actions";
import {
  WEEKDAY_OPTIONS,
  isCalendarWeekend,
  type BatchApplyMode,
} from "@/lib/metrics/payroll-attendance-batch";
import { cn } from "@/lib/utils";
import {
  PAYROLL_ATTENDANCE_KIND_LABELS,
  PAYROLL_ATTENDANCE_KINDS,
  type PayrollAttendanceDay,
  type PayrollAttendanceKind,
  type PayrollClosingItem,
} from "@/types/payroll-closing";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

type PayrollAttendancePanelProps = {
  item: PayrollClosingItem;
  days: PayrollAttendanceDay[];
  closeHref: string;
  readOnly?: boolean;
  finalizedClosingId?: string | null;
};

const KIND_CARD_CLASS: Record<PayrollAttendanceKind, string> = {
  presencial:
    "border-emerald-500/35 bg-emerald-500/10 dark:border-emerald-400/30 dark:bg-emerald-400/10",
  home: "border-sky-500/35 bg-sky-500/10 dark:border-sky-400/30 dark:bg-sky-400/10",
  off: "border-border bg-muted/60 text-muted-foreground",
  holiday:
    "border-rose-500/40 bg-rose-500/10 dark:border-rose-400/35 dark:bg-rose-400/10",
  weekend:
    "border-violet-500/30 bg-violet-500/10 dark:border-violet-400/25 dark:bg-violet-400/10",
};

const LEGEND: Array<{ kind: PayrollAttendanceKind; swatch: string }> = [
  { kind: "presencial", swatch: "bg-emerald-500/70" },
  { kind: "home", swatch: "bg-sky-500/70" },
  { kind: "off", swatch: "bg-muted-foreground/40" },
  { kind: "holiday", swatch: "bg-rose-500/70" },
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

export function PayrollAttendancePanel({
  item,
  days,
  closeHref,
  readOnly = false,
  finalizedClosingId = null,
}: PayrollAttendancePanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [localDays, setLocalDays] = useState(days);
  const [syncedDays, setSyncedDays] = useState(days);

  const bounds = useMemo(() => monthBounds(days), [days]);
  const monthKey = bounds ? `${bounds.start}:${bounds.end}` : "";
  const defaultHours = String(item.contracted_hours_per_day);

  const [batchKind, setBatchKind] =
    useState<PayrollAttendanceKind>("presencial");
  const [batchHours, setBatchHours] = useState(defaultHours);
  const [batchWeekdays, setBatchWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [rangeStart, setRangeStart] = useState(bounds?.start ?? "");
  const [rangeEnd, setRangeEnd] = useState(bounds?.end ?? "");
  const [rangeMonthKey, setRangeMonthKey] = useState(monthKey);
  const [batchMode, setBatchMode] = useState<BatchApplyMode>("overwrite");

  if (days !== syncedDays) {
    setSyncedDays(days);
    setLocalDays(days);
  }

  if (monthKey !== rangeMonthKey) {
    setRangeMonthKey(monthKey);
    setRangeStart(bounds?.start ?? "");
    setRangeEnd(bounds?.end ?? "");
  }

  function applyLocalPatches(
    patches: Array<{
      dayOn: string;
      dayKind: PayrollAttendanceKind;
      hours: number;
    }>,
  ) {
    const byDay = new Map(patches.map((p) => [p.dayOn, p]));
    setLocalDays((prev) =>
      prev.map((day) => {
        const patch = byDay.get(day.day_on);
        if (!patch) {
          return day;
        }
        return {
          ...day,
          day_kind: patch.dayKind,
          hours: patch.hours,
        };
      }),
    );
  }

  function saveDay(input: {
    dayOn: string;
    dayKind: PayrollAttendanceKind;
    hours: number;
  }) {
    if (readOnly) {
      return;
    }
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await upsertAttendanceDayAction({
        itemId: item.id,
        dayOn: input.dayOn,
        dayKind: input.dayKind,
        hours: input.hours,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      applyLocalPatches([
        {
          dayOn: input.dayOn,
          dayKind: input.dayKind,
          hours:
            input.dayKind === "presencial" || input.dayKind === "home"
              ? input.hours
              : 0,
        },
      ]);
      router.refresh();
    });
  }

  type BatchInput = Omit<
    Parameters<typeof batchApplyAttendanceAction>[0],
    "itemId"
  >;

  function runBatch(input: BatchInput) {
    if (readOnly) {
      return;
    }
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await batchApplyAttendanceAction({
        ...input,
        itemId: item.id,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo(
        result.updatedCount === 0
          ? "Nenhum dia alterado com os critérios atuais."
          : `${result.updatedCount} dia(s) atualizado(s).`,
      );
      router.refresh();
    });
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

  const needsHours = batchKind === "presencial" || batchKind === "home";

  return (
    <section className="ui-dashboard-panel space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">
            Calendário de presença · {item.developer_name}
          </h2>
          <p className="text-sm text-muted-foreground">
            Horas padrão:{" "}
            {item.contracted_hours_per_day.toLocaleString("pt-BR")} h/dia.
            Presencial e home office somam horas para o diferencial; só os dias
            presenciais geram deslocamento e refeição.
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
          </ul>
        </div>
        <a href={closeHref} className="ui-btn-secondary text-sm">
          Fechar calendário
        </a>
      </div>

      <div className="space-y-3 rounded-[var(--radius-sm)] border border-border/80 bg-muted/20 p-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="ui-btn-secondary text-xs"
            disabled={pending || readOnly}
            onClick={() => runBatch({ shortcut: "fill_month_default" })}
          >
            Preencher mês padrão
          </button>
          <button
            type="button"
            className="ui-btn-secondary text-xs"
            disabled={pending || readOnly}
            onClick={() =>
              runBatch({
                shortcut: "workweek_home",
                rangeStart: rangeStart || null,
                rangeEnd: rangeEnd || null,
              })
            }
          >
            Marcar úteis como home office
          </button>
          <button
            type="button"
            className="ui-btn-secondary text-xs"
            disabled={pending || readOnly}
            onClick={() =>
              runBatch({
                shortcut: "workweek_presencial",
                rangeStart: rangeStart || null,
                rangeEnd: rangeEnd || null,
              })
            }
          >
            Marcar úteis como presencial
          </button>
          <button
            type="button"
            className="ui-btn-secondary text-xs"
            disabled={pending || readOnly}
            onClick={() =>
              runBatch({
                shortcut: "zero_weekends",
                rangeStart: rangeStart || null,
                rangeEnd: rangeEnd || null,
              })
            }
          >
            Zerar fins de semana
          </button>
        </div>

        <div className="space-y-2 border-t border-border/60 pt-3">
          <p className="text-xs font-medium text-foreground">Aplicar em lote</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Tipo</span>
              <select
                className="ui-select text-xs"
                value={batchKind}
                disabled={pending || readOnly}
                onChange={(event) =>
                  setBatchKind(event.target.value as PayrollAttendanceKind)
                }
              >
                {PAYROLL_ATTENDANCE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {PAYROLL_ATTENDANCE_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Horas</span>
              <input
                type="text"
                inputMode="decimal"
                className="ui-input text-xs"
                value={batchHours}
                disabled={pending || readOnly || !needsHours}
                onChange={(event) => setBatchHours(event.target.value)}
                placeholder={needsHours ? defaultHours : "0"}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">De</span>
              <input
                type="date"
                className="ui-input text-xs"
                value={rangeStart}
                disabled={pending || readOnly}
                min={bounds?.start}
                max={bounds?.end}
                onChange={(event) => setRangeStart(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Até</span>
              <input
                type="date"
                className="ui-input text-xs"
                value={rangeEnd}
                disabled={pending || readOnly}
                min={bounds?.start}
                max={bounds?.end}
                onChange={(event) => setRangeEnd(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs sm:col-span-2 lg:col-span-2">
              <span className="text-muted-foreground">Modo</span>
              <select
                className="ui-select text-xs"
                value={batchMode}
                disabled={pending || readOnly}
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

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Dias</span>
            {WEEKDAY_OPTIONS.map((weekday) => {
              const active = batchWeekdays.includes(weekday.value);
              return (
                <button
                  key={weekday.value}
                  type="button"
                  disabled={pending || readOnly}
                  className={cn(
                    "rounded-[calc(var(--radius-sm)-2px)] border px-2 py-1 text-xs font-medium transition-colors",
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
              className="ui-btn-primary ml-auto text-xs"
              disabled={pending || readOnly || batchWeekdays.length === 0}
              onClick={() => {
                const hoursRaw = batchHours.trim().replace(",", ".");
                const hours = needsHours
                  ? Number(hoursRaw || defaultHours)
                  : 0;
                if (needsHours && (!Number.isFinite(hours) || hours < 0)) {
                  setError("Informe horas válidas para o lote.");
                  return;
                }
                runBatch({
                  dayKind: batchKind,
                  hours,
                  weekdays: batchWeekdays,
                  rangeStart: rangeStart || null,
                  rangeEnd: rangeEnd || null,
                  mode: batchMode,
                });
              }}
            >
              {pending ? "Aplicando..." : "Aplicar lote"}
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
          const isWorkable =
            day.day_kind === "presencial" || day.day_kind === "home";
          const weekend = isCalendarWeekend(day.day_on);
          return (
            <div
              key={day.id}
              className={cn(
                "space-y-2 rounded-[var(--radius-sm)] border p-2.5",
                KIND_CARD_CLASS[day.day_kind],
                weekend && day.day_kind !== "weekend"
                  ? "ring-1 ring-violet-500/25"
                  : null,
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
              {day.day_kind === "holiday" ? (
                <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                  Feriado
                </p>
              ) : null}
              <select
                className="ui-select text-xs"
                value={day.day_kind}
                disabled={pending || readOnly}
                onChange={(event) => {
                  const nextKind = event.target
                    .value as PayrollAttendanceKind;
                  const nextHours =
                    nextKind === "presencial" || nextKind === "home"
                      ? day.hours > 0
                        ? day.hours
                        : item.contracted_hours_per_day
                      : 0;
                  saveDay({
                    dayOn: day.day_on,
                    dayKind: nextKind,
                    hours: nextHours,
                  });
                }}
              >
                {PAYROLL_ATTENDANCE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {PAYROLL_ATTENDANCE_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
              {isWorkable ? (
                <input
                  type="text"
                  inputMode="decimal"
                  className="ui-input text-xs"
                  key={`${day.id}-${day.hours}`}
                  defaultValue={String(day.hours)}
                  disabled={pending || readOnly}
                  aria-label={`Horas em ${day.day_on}`}
                  onBlur={(event) => {
                    const raw = event.target.value.trim().replace(",", ".");
                    const hours = Number(raw);
                    if (!Number.isFinite(hours) || hours < 0) {
                      return;
                    }
                    if (hours === day.hours) {
                      return;
                    }
                    saveDay({
                      dayOn: day.day_on,
                      dayKind: day.day_kind,
                      hours,
                    });
                  }}
                />
              ) : (
                <p className="text-xs text-muted-foreground">0 h</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
