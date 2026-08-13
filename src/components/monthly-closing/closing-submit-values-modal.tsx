"use client";

import {
  computeClosingSubmitValues,
  formatClosingMoney,
} from "@/lib/metrics/closing-submit-values";
import { HOLIDAY_OVERLAY_CELL_CLASS } from "@/lib/metrics/holiday-overlay";
import { listDaysInYearMonth } from "@/lib/metrics/payroll-calc";
import { cn } from "@/lib/utils";
import type { DeveloperCompensation } from "@/types/developer-compensation";
import { COMPENSATION_BASE_TYPE_LABELS } from "@/types/developer-compensation";
import { Loader2, X } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ClosingSubmitValuesPayload = {
  travelDays: string[];
  mealDays: string[];
  absenceDays: string[];
  makeupDays: string[];
  valuesNotes: string | null;
};

type ClosingSubmitValuesModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: ClosingSubmitValuesPayload) => void;
  /** Persist D/R without sending for review. */
  onSave: (payload: ClosingSubmitValuesPayload) => void;
  pending: boolean;
  yearMonth: string;
  compensation: DeveloperCompensation;
  workedHours: number;
  /** Applicable holidays for this developer/month (date → name). */
  holidays?: ReadonlyArray<{ date: string; name: string }>;
  initialTravelDays?: ReadonlyArray<string>;
  initialMealDays?: ReadonlyArray<string>;
  initialAbsenceDays?: ReadonlyArray<string>;
  initialMakeupDays?: ReadonlyArray<string>;
  initialValuesNotes?: string | null;
  /** When false, Confirmar is disabled (e.g. pending justifications). */
  canConfirm?: boolean;
  confirmBlockedReason?: string | null;
  /** When resubmitting after rejection. */
  requireResubmissionNotes?: boolean;
  resubmissionNotes?: string;
  onResubmissionNotesChange?: (value: string) => void;
  title?: string;
  confirmLabel?: string;
  saveLabel?: string;
};

function weekdayShort(isoDate: string): string {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "narrow" }).format(
    new Date(`${isoDate}T12:00:00.000Z`),
  );
}

function dayNumber(isoDate: string): string {
  return String(Number(isoDate.slice(8, 10)));
}

function isWeekend(isoDate: string): boolean {
  const weekday = new Date(`${isoDate}T12:00:00.000Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

const WEEKDAY_LETTERS = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

const DAY_CELL_BASE =
  "flex aspect-square w-full items-center justify-center rounded-md border text-[11px] font-medium tabular-nums transition sm:text-xs";

/** Selected states — solid enough to read clearly on dark surfaces. */
const TRAVEL_SELECTED =
  "border-emerald-400 bg-emerald-500 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] hover:bg-emerald-600";
const MEAL_SELECTED =
  "border-sky-400 bg-sky-500 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] hover:bg-sky-600";
const ABSENCE_ACCENT =
  "border-amber-400 bg-amber-500 text-amber-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] hover:bg-amber-400";
const MAKEUP_ACCENT =
  "border-violet-400 bg-violet-500 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] hover:bg-violet-600";

const LEGEND_SWATCH_ABSENCE = "border-amber-400 bg-amber-500";
const LEGEND_SWATCH_MAKEUP = "border-violet-400 bg-violet-500";

function CalendarCard({
  title,
  meta,
  children,
}: {
  title: string;
  meta: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 overflow-hidden rounded-[var(--radius)] border border-border/70 bg-[var(--surface)]/40 p-3 sm:p-3.5">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium leading-snug text-pretty">{title}</p>
        <p className="text-xs tabular-nums text-muted-foreground">{meta}</p>
      </div>
      {children}
    </div>
  );
}

function MonthDayGrid({
  yearMonth,
  holidayNameByDate,
  renderDay,
}: {
  yearMonth: string;
  holidayNameByDate: Map<string, string>;
  renderDay: (input: {
    day: string;
    weekend: boolean;
    holidayName: string | null;
  }) => ReactNode;
}) {
  const days = useMemo(() => listDaysInYearMonth(yearMonth), [yearMonth]);
  const firstWeekday = days[0]
    ? new Date(`${days[0]}T12:00:00.000Z`).getUTCDay()
    : 0;
  const leadingEmpty = firstWeekday;

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {WEEKDAY_LETTERS.map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            className="flex h-5 items-center justify-center text-[10px] font-semibold tracking-wide text-muted-foreground uppercase"
          >
            {letter}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {Array.from({ length: leadingEmpty }).map((_, index) => (
          <span key={`empty-${index}`} className="aspect-square" />
        ))}
        {days.map((day) => {
          const weekend = isWeekend(day);
          const holidayName = holidayNameByDate.get(day) ?? null;
          return (
            <div key={day} className="min-w-0">
              {renderDay({ day, weekend, holidayName })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthDayPicker({
  yearMonth,
  selected,
  onChange,
  label,
  accentClass,
  holidayNameByDate,
}: {
  yearMonth: string;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  label: string;
  accentClass: string;
  holidayNameByDate: Map<string, string>;
}) {
  function toggle(day: string) {
    const next = new Set(selected);
    if (next.has(day)) {
      next.delete(day);
    } else {
      next.add(day);
    }
    onChange(next);
  }

  return (
    <CalendarCard
      title={label}
      meta={`${selected.size} dia${selected.size === 1 ? "" : "s"}`}
    >
      <MonthDayGrid
        yearMonth={yearMonth}
        holidayNameByDate={holidayNameByDate}
        renderDay={({ day, weekend, holidayName }) => {
          const active = selected.has(day);
          const isHoliday = holidayName != null;
          return (
            <button
              type="button"
              onClick={() => toggle(day)}
              title={
                holidayName
                  ? `Feriado: ${holidayName}`
                  : `${weekdayShort(day)} ${day}`
              }
              className={cn(
                DAY_CELL_BASE,
                isHoliday && !active
                  ? HOLIDAY_OVERLAY_CELL_CLASS
                  : active
                    ? accentClass
                    : weekend
                      ? "border-border/50 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                      : "border-border bg-card hover:bg-muted/50",
                isHoliday && active ? accentClass : null,
              )}
            >
              {dayNumber(day)}
            </button>
          );
        }}
      />
    </CalendarCard>
  );
}

type AbsenceMakeupMark = "none" | "absence" | "makeup";

/** Single calendar: click cycles none → falta → compensação → none. */
function AbsenceMakeupDayPicker({
  yearMonth,
  absenceSelected,
  makeupSelected,
  onChange,
  holidayNameByDate,
}: {
  yearMonth: string;
  absenceSelected: Set<string>;
  makeupSelected: Set<string>;
  onChange: (next: {
    absence: Set<string>;
    makeup: Set<string>;
  }) => void;
  holidayNameByDate: Map<string, string>;
}) {
  const billed = Math.max(0, absenceSelected.size - makeupSelected.size);

  function markFor(day: string): AbsenceMakeupMark {
    if (absenceSelected.has(day)) {
      return "absence";
    }
    if (makeupSelected.has(day)) {
      return "makeup";
    }
    return "none";
  }

  function cycle(day: string) {
    const mark = markFor(day);
    const nextAbsence = new Set(absenceSelected);
    const nextMakeup = new Set(makeupSelected);
    nextAbsence.delete(day);
    nextMakeup.delete(day);
    if (mark === "none") {
      nextAbsence.add(day);
    } else if (mark === "absence") {
      nextMakeup.add(day);
    }
    onChange({ absence: nextAbsence, makeup: nextMakeup });
  }

  return (
    <CalendarCard
      title="Faltas"
      meta={`${absenceSelected.size} falta${absenceSelected.size === 1 ? "" : "s"} · ${makeupSelected.size} ${makeupSelected.size === 1 ? "compensação" : "compensações"} · saldo ${billed}`}
    >
      <MonthDayGrid
        yearMonth={yearMonth}
        holidayNameByDate={holidayNameByDate}
        renderDay={({ day, weekend, holidayName }) => {
          const mark = markFor(day);
          const isHoliday = holidayName != null;
          const active = mark !== "none";
          const accent = mark === "absence" ? ABSENCE_ACCENT : MAKEUP_ACCENT;
          const markLabel =
            mark === "absence"
              ? "Falta"
              : mark === "makeup"
                ? "Compensação"
                : null;
          return (
            <button
              type="button"
              onClick={() => cycle(day)}
              title={
                [
                  holidayName ? `Feriado: ${holidayName}` : null,
                  markLabel,
                  `${weekdayShort(day)} ${day}`,
                ]
                  .filter(Boolean)
                  .join(" · ")
              }
              aria-label={
                markLabel
                  ? `${dayNumber(day)}, ${markLabel}`
                  : `${dayNumber(day)}`
              }
              className={cn(
                DAY_CELL_BASE,
                isHoliday && !active
                  ? HOLIDAY_OVERLAY_CELL_CLASS
                  : active
                    ? accent
                    : weekend
                      ? "border-border/50 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                      : "border-border bg-card hover:bg-muted/50",
                isHoliday && active ? accent : null,
              )}
            >
              {dayNumber(day)}
            </button>
          );
        }}
      />
    </CalendarCard>
  );
}

export function ClosingSubmitValuesModal({
  open,
  onClose,
  onConfirm,
  onSave,
  pending,
  yearMonth,
  compensation,
  workedHours,
  holidays = [],
  initialTravelDays = [],
  initialMealDays = [],
  initialAbsenceDays = [],
  initialMakeupDays = [],
  initialValuesNotes = null,
  canConfirm = true,
  confirmBlockedReason = null,
  requireResubmissionNotes = false,
  resubmissionNotes = "",
  onResubmissionNotesChange,
  title = "Informar valores do fechamento",
  confirmLabel = "Confirmar e enviar",
  saveLabel = "Salvar",
}: ClosingSubmitValuesModalProps) {
  const titleId = useId();
  const notesId = useId();
  const resubmitId = useId();
  const [travelSelected, setTravelSelected] = useState<Set<string>>(
    () => new Set(),
  );
  const [mealSelected, setMealSelected] = useState<Set<string>>(
    () => new Set(),
  );
  const [absenceSelected, setAbsenceSelected] = useState<Set<string>>(
    () => new Set(),
  );
  const [makeupSelected, setMakeupSelected] = useState<Set<string>>(
    () => new Set(),
  );
  const [valuesNotes, setValuesNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const holidayNameByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of holidays) {
      map.set(row.date, row.name);
    }
    return map;
  }, [holidays]);

  const showAbsenceCalendar =
    compensation.base_type === "fixed" && !compensation.consider_jira_hours;
  const considerJiraHours =
    compensation.base_type === "variable" || compensation.consider_jira_hours;

  const initialTravelKey = initialTravelDays.join(",");
  const initialMealKey = initialMealDays.join(",");
  const initialAbsenceKey = initialAbsenceDays.join(",");
  const initialMakeupKey = initialMakeupDays.join(",");

  useEffect(() => {
    if (!open) {
      return;
    }
    setTravelSelected(new Set(initialTravelDays));
    setMealSelected(new Set(initialMealDays));
    setAbsenceSelected(new Set(initialAbsenceDays));
    setMakeupSelected(new Set(initialMakeupDays));
    setValuesNotes(initialValuesNotes ?? "");
    setLocalError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate from keys when modal opens
  }, [
    open,
    yearMonth,
    initialTravelKey,
    initialMealKey,
    initialAbsenceKey,
    initialMakeupKey,
    initialValuesNotes,
  ]);

  const preview = useMemo(
    () =>
      computeClosingSubmitValues({
        baseType: compensation.base_type,
        baseAmount: compensation.base_amount,
        hourlyRate: compensation.hourly_rate,
        contractedHoursPerDay: compensation.contracted_hours_per_day,
        contractedHoursPerMonth: compensation.contracted_hours_per_month,
        dailyTravelAmount: compensation.daily_travel_amount,
        dailyMealAmount: compensation.daily_meal_amount,
        workedHours,
        travelDays: [...travelSelected],
        mealDays: [...mealSelected],
        absenceDays: showAbsenceCalendar ? [...absenceSelected] : [],
        makeupDays: showAbsenceCalendar ? [...makeupSelected] : [],
        timeBankEnabled: compensation.time_bank_enabled,
        considerJiraHours: compensation.consider_jira_hours,
      }),
    [
      compensation,
      workedHours,
      travelSelected,
      mealSelected,
      absenceSelected,
      makeupSelected,
      showAbsenceCalendar,
    ],
  );

  const isVariable = compensation.base_type === "variable";

  if (!open) {
    return null;
  }

  function buildPayload(): ClosingSubmitValuesPayload {
    return {
      travelDays: [...travelSelected].sort(),
      mealDays: [...mealSelected].sort(),
      absenceDays: showAbsenceCalendar ? [...absenceSelected].sort() : [],
      makeupDays: showAbsenceCalendar ? [...makeupSelected].sort() : [],
      valuesNotes: isVariable ? valuesNotes.trim() || null : null,
    };
  }

  function saveDraft() {
    setLocalError(null);
    onSave(buildPayload());
  }

  function confirm() {
    if (!canConfirm) {
      setLocalError(
        confirmBlockedReason ??
          "Ainda há justificativas pendentes. Você pode salvar o rascunho e enviar depois.",
      );
      return;
    }
    if (
      requireResubmissionNotes &&
      !(resubmissionNotes ?? "").trim()
    ) {
      setLocalError("Informe a resposta ao gestor antes de reenviar.");
      return;
    }
    setLocalError(null);
    onConfirm(buildPayload());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Fechar"
        onClick={() => {
          if (!pending) {
            onClose();
          }
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(92dvh,100%)] w-full min-w-0 max-w-4xl flex-col overflow-hidden rounded-t-[var(--radius)] border border-border bg-[var(--surface-elevated)] shadow-[var(--shadow-md)] sm:rounded-[var(--radius)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div>
            <h2 id={titleId} className="text-base font-semibold tracking-tight">
              {title}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {showAbsenceCalendar
                ? "Marque deslocamento, refeição e faltas/compensação. Compensação: Fixo (sem horas Jira)."
                : `Selecione os dias presenciais. Compensação: ${COMPENSATION_BASE_TYPE_LABELS[compensation.base_type]}.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" strokeWidth={1.9} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
          {holidayNameByDate.size > 0 ? (
            <p className="text-xs text-muted-foreground text-pretty">
              Feriados cadastrados aparecem em vermelho como referência. Você
              ainda pode marcá-los como presenciais se necessário.
            </p>
          ) : null}
          {showAbsenceCalendar ? (
            <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1">
              <p className="text-xs text-muted-foreground text-pretty">
                Em faltas: clique cicla{" "}
                <span className="text-foreground/85">
                  falta → compensação → limpar
                </span>
                . Cada compensação quita uma falta.
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      "size-2.5 shrink-0 rounded-sm border",
                      LEGEND_SWATCH_ABSENCE,
                    )}
                    aria-hidden
                  />
                  Falta
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      "size-2.5 shrink-0 rounded-sm border",
                      LEGEND_SWATCH_MAKEUP,
                    )}
                    aria-hidden
                  />
                  Compensação
                </span>
              </div>
            </div>
          ) : null}
          <div
            className={cn(
              "grid items-start gap-4",
              showAbsenceCalendar
                ? "lg:grid-cols-3"
                : "sm:grid-cols-2",
            )}
          >
            <MonthDayPicker
              yearMonth={yearMonth}
              selected={travelSelected}
              onChange={(next) => {
                setTravelSelected(next);
                // Suggest meal on same days when newly marking travel.
                setMealSelected((prev) => {
                  const merged = new Set(prev);
                  for (const day of next) {
                    if (!travelSelected.has(day)) {
                      merged.add(day);
                    }
                  }
                  return merged;
                });
              }}
              label="Deslocamento"
              accentClass={TRAVEL_SELECTED}
              holidayNameByDate={holidayNameByDate}
            />
            <MonthDayPicker
              yearMonth={yearMonth}
              selected={mealSelected}
              onChange={setMealSelected}
              label="Refeição"
              accentClass={MEAL_SELECTED}
              holidayNameByDate={holidayNameByDate}
            />
            {showAbsenceCalendar ? (
              <AbsenceMakeupDayPicker
                yearMonth={yearMonth}
                absenceSelected={absenceSelected}
                makeupSelected={makeupSelected}
                onChange={({ absence, makeup }) => {
                  setAbsenceSelected(absence);
                  setMakeupSelected(makeup);
                }}
                holidayNameByDate={holidayNameByDate}
              />
            ) : null}
          </div>

          <section
            aria-label="Previsão da nota fiscal"
            className="ui-kpi-hero ui-kpi-card--brand overflow-hidden shadow-[var(--shadow-sm)]"
          >
            <div className="ui-kpi-hero__band">
              <span className="ui-kpi-hero__band-label">
                Previsão da nota fiscal
              </span>
            </div>
            <div className="ui-kpi-hero__body space-y-4">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                  Total estimado
                </p>
                <p className="ui-kpi-hero__value text-brand-foreground dark:text-brand">
                  {formatClosingMoney(preview.invoiceAmount)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground text-pretty">
                  {considerJiraHours
                    ? "Estimativa com base no cadastro e nas horas Jira do mês."
                    : "Estimativa com base no cadastro, faltas e compensações (sem horas Jira)."}{" "}
                  Fechamentos já finalizados/pagos não são recalculados.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-[var(--radius-sm)] border border-border/70 bg-[var(--surface)]/80 px-3 py-2.5">
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Base contratual
                  </p>
                  <p className="mt-1 text-sm font-semibold tabular-nums tracking-tight text-foreground">
                    {formatClosingMoney(compensation.base_amount)}
                  </p>
                </div>

                {considerJiraHours ? (
                  <div className="rounded-[var(--radius-sm)] border border-border/70 bg-[var(--surface)]/80 px-3 py-2.5">
                    <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                      Horas Jira
                    </p>
                    <p className="mt-1 text-sm font-semibold tabular-nums tracking-tight text-foreground">
                      {workedHours.toLocaleString("pt-BR", {
                        maximumFractionDigits: 1,
                      })}{" "}
                      /{" "}
                      {compensation.contracted_hours_per_month.toLocaleString(
                        "pt-BR",
                        { maximumFractionDigits: 1 },
                      )}{" "}
                      h
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground text-pretty">
                      {compensation.time_bank_enabled
                        ? preview.timeBankHoursDelta === 0
                          ? "Banco de horas ativo · sem movimento"
                          : `Banco de horas · ${preview.timeBankHoursDelta > 0 ? "+" : ""}${preview.timeBankHoursDelta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`
                        : preview.jiraDeficitAmount > 0
                          ? `Déficit −${formatClosingMoney(preview.jiraDeficitAmount)}`
                          : "Sem déficit"}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-[var(--radius-sm)] border border-border/70 bg-[var(--surface)]/80 px-3 py-2.5">
                    <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                      Faltas
                    </p>
                    <p className="mt-1 text-sm font-semibold tabular-nums tracking-tight text-foreground">
                      {preview.absenceDaysCount} ×{" "}
                      {compensation.contracted_hours_per_day.toLocaleString(
                        "pt-BR",
                      )}{" "}
                      h × {formatClosingMoney(compensation.hourly_rate)}
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground text-pretty">
                      {preview.absenceDeclaredCount} falta
                      {preview.absenceDeclaredCount === 1 ? "" : "s"}
                      {" · "}
                      {preview.makeupDaysCount}{" "}
                      {preview.makeupDaysCount === 1
                        ? "compensação"
                        : "compensações"}
                      {" · saldo "}
                      {preview.absenceDaysCount}
                      {preview.absenceAmount > 0
                        ? ` · desconto −${formatClosingMoney(preview.absenceAmount)}`
                        : " · sem desconto"}
                    </p>
                  </div>
                )}

                {preview.presencialExtraAmount > 0 ? (
                  <div className="rounded-[var(--radius-sm)] border border-border/70 bg-[var(--surface)]/80 px-3 py-2.5">
                    <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                      Excedente presencial
                    </p>
                    <p className="mt-1 text-sm font-semibold tabular-nums tracking-tight text-foreground">
                      {formatClosingMoney(preview.presencialExtraAmount)}
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground text-pretty">
                      {preview.travelPresencialDays} × 2 h ×{" "}
                      {formatClosingMoney(compensation.hourly_rate)}
                    </p>
                  </div>
                ) : null}

                <div className="rounded-[var(--radius-sm)] border border-border/70 bg-[var(--surface)]/80 px-3 py-2.5">
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Deslocamento
                  </p>
                  <p className="mt-1 text-sm font-semibold tabular-nums tracking-tight text-foreground text-pretty">
                    {preview.travelPresencialDays} ×{" "}
                    {formatClosingMoney(compensation.daily_travel_amount)} ={" "}
                    {formatClosingMoney(preview.travelAmount)}
                  </p>
                </div>

                <div className="rounded-[var(--radius-sm)] border border-border/70 bg-[var(--surface)]/80 px-3 py-2.5">
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Refeição
                  </p>
                  <p className="mt-1 text-sm font-semibold tabular-nums tracking-tight text-foreground text-pretty">
                    {preview.mealPresencialDays} ×{" "}
                    {formatClosingMoney(compensation.daily_meal_amount)} ={" "}
                    {formatClosingMoney(preview.mealAmount)}
                  </p>
                </div>
              </div>

              <p className="text-xs leading-snug text-muted-foreground text-pretty">
                {isVariable
                  ? compensation.contracted_hours_per_day === 6
                    ? "Variável 6h/dia: dias de deslocamento incluem 2h extras. Carga mínima mensal via Jira."
                    : "Variável: carga mínima mensal via Jira; deslocamento e refeição pelos dias marcados."
                  : showAbsenceCalendar
                    ? "Fixo sem Jira: base − saldo de faltas + deslocamento + refeição."
                    : "Fixo: base contratual ± déficit Jira (ou banco) + deslocamento + refeição."}
              </p>
            </div>
          </section>

          {isVariable ? (
            <div className="space-y-1.5">
              <label htmlFor={notesId} className="text-sm font-medium">
                Observação{" "}
                <span className="font-normal text-muted-foreground">
                  (opcional)
                </span>
              </label>
              <textarea
                id={notesId}
                value={valuesNotes}
                onChange={(event) => setValuesNotes(event.target.value)}
                rows={3}
                placeholder="Algum detalhe sobre presença, valores ou exceções…"
                className="ui-textarea min-h-[4.5rem] text-sm"
              />
            </div>
          ) : null}

          {requireResubmissionNotes ? (
            <div className="space-y-1.5">
              <label htmlFor={resubmitId} className="text-sm font-medium">
                Resposta ao gestor (obrigatória)
              </label>
              <textarea
                id={resubmitId}
                value={resubmissionNotes}
                onChange={(event) =>
                  onResubmissionNotesChange?.(event.target.value)
                }
                rows={3}
                placeholder="Explique o ajuste feito / justificativa do reenvio…"
                className="ui-textarea min-h-[4.5rem] text-sm"
              />
            </div>
          ) : null}

          {localError ? (
            <p className="text-sm text-danger">{localError}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-border px-4 py-3 sm:px-5">
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={saveDraft}
              disabled={pending}
              className="ui-btn-secondary w-full justify-center"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {saveLabel}
            </button>
            <p className="text-center text-[11px] leading-snug text-muted-foreground text-pretty">
              Guarda deslocamento e refeição sem enviar ao gestor.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-end sm:justify-between">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="ui-btn-secondary w-full justify-center sm:w-auto"
            >
              Cancelar
            </button>
            <div className="flex w-full flex-col gap-1 sm:w-auto sm:items-end">
              <p className="text-[11px] text-muted-foreground text-pretty sm:text-right">
                Envia para revisão do gestor.
              </p>
              <button
                type="button"
                onClick={confirm}
                disabled={pending || !canConfirm}
                title={
                  !canConfirm
                    ? (confirmBlockedReason ??
                      "Justificativas pendentes — salve o rascunho e envie depois.")
                    : undefined
                }
                className="ui-btn-primary w-full min-w-[10.5rem] flex-col gap-0.5 justify-center sm:w-auto sm:min-w-0 sm:flex-row sm:gap-1.5"
              >
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : null}
                <span className="hidden sm:inline">
                  {confirmLabel} — {formatClosingMoney(preview.invoiceAmount)}
                </span>
                <span className="sm:hidden">{confirmLabel}</span>
                <span className="text-[11px] font-semibold tabular-nums sm:hidden">
                  {formatClosingMoney(preview.invoiceAmount)}
                </span>
              </button>
              {!canConfirm && confirmBlockedReason ? (
                <p className="text-[11px] text-amber-800 dark:text-amber-200 text-pretty sm:text-right">
                  {confirmBlockedReason}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
