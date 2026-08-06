"use client";

import {
  computeClosingSubmitValues,
  formatClosingMoney,
} from "@/lib/metrics/closing-submit-values";
import { listDaysInYearMonth } from "@/lib/metrics/payroll-calc";
import { cn } from "@/lib/utils";
import type { DeveloperCompensation } from "@/types/developer-compensation";
import { COMPENSATION_BASE_TYPE_LABELS } from "@/types/developer-compensation";
import { Loader2, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

export type ClosingSubmitValuesPayload = {
  travelDays: string[];
  mealDays: string[];
  valuesNotes: string | null;
};

type ClosingSubmitValuesModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: ClosingSubmitValuesPayload) => void;
  pending: boolean;
  yearMonth: string;
  compensation: DeveloperCompensation;
  workedHours: number;
  /** Applicable holidays for this developer/month (date → name). */
  holidays?: ReadonlyArray<{ date: string; name: string }>;
  /** When resubmitting after rejection. */
  requireResubmissionNotes?: boolean;
  resubmissionNotes?: string;
  onResubmissionNotesChange?: (value: string) => void;
  title?: string;
  confirmLabel?: string;
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
  const days = useMemo(() => listDaysInYearMonth(yearMonth), [yearMonth]);
  const firstWeekday = days[0]
    ? new Date(`${days[0]}T12:00:00.000Z`).getUTCDay()
    : 0;
  /** Sunday-first grid offset. */
  const leadingEmpty = firstWeekday;

  function toggle(day: string) {
    if (holidayNameByDate.has(day)) {
      return;
    }
    const next = new Set(selected);
    if (next.has(day)) {
      next.delete(day);
    } else {
      next.add(day);
    }
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {selected.size} dia{selected.size === 1 ? "" : "s"}
        </p>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((letter, index) => (
          <span key={`${letter}-${index}`}>{letter}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingEmpty }).map((_, index) => (
          <span key={`empty-${index}`} />
        ))}
        {days.map((day) => {
          const active = selected.has(day);
          const weekend = isWeekend(day);
          const holidayName = holidayNameByDate.get(day) ?? null;
          const blocked = holidayName != null;
          return (
            <button
              key={day}
              type="button"
              onClick={() => toggle(day)}
              disabled={blocked}
              title={
                holidayName
                  ? `Feriado: ${holidayName}`
                  : `${weekdayShort(day)} ${day}`
              }
              className={cn(
                "flex h-8 flex-col items-center justify-center rounded-md border text-xs tabular-nums transition",
                blocked
                  ? "cursor-not-allowed border-rose-500/40 bg-rose-500/15 text-rose-900/80 dark:text-rose-100/80"
                  : active
                    ? accentClass
                    : weekend
                      ? "border-border/50 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                      : "border-border bg-card hover:bg-muted/50",
              )}
            >
              {dayNumber(day)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ClosingSubmitValuesModal({
  open,
  onClose,
  onConfirm,
  pending,
  yearMonth,
  compensation,
  workedHours,
  holidays = [],
  requireResubmissionNotes = false,
  resubmissionNotes = "",
  onResubmissionNotesChange,
  title = "Informar valores do fechamento",
  confirmLabel = "Confirmar e enviar",
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
  const [valuesNotes, setValuesNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const holidayNameByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of holidays) {
      map.set(row.date, row.name);
    }
    return map;
  }, [holidays]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTravelSelected(new Set());
    setMealSelected(new Set());
    setValuesNotes("");
    setLocalError(null);
  }, [open, yearMonth]);

  const preview = useMemo(
    () =>
      computeClosingSubmitValues({
        baseType: compensation.base_type,
        baseAmount: compensation.base_amount,
        hourlyRate: compensation.hourly_rate,
        dailyTravelAmount: compensation.daily_travel_amount,
        dailyMealAmount: compensation.daily_meal_amount,
        workedHours,
        travelDays: [...travelSelected],
        mealDays: [...mealSelected],
      }),
    [compensation, workedHours, travelSelected, mealSelected],
  );

  const isVariable = compensation.base_type === "variable";

  if (!open) {
    return null;
  }

  function confirm() {
    if (
      requireResubmissionNotes &&
      !(resubmissionNotes ?? "").trim()
    ) {
      setLocalError("Informe a resposta ao gestor antes de reenviar.");
      return;
    }
    setLocalError(null);
    const allowed = (days: Set<string>) =>
      [...days].filter((day) => !holidayNameByDate.has(day)).sort();
    onConfirm({
      travelDays: allowed(travelSelected),
      mealDays: allowed(mealSelected),
      valuesNotes: isVariable ? valuesNotes.trim() || null : null,
    });
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
        className="relative z-10 flex max-h-[min(92dvh,100%)] w-full min-w-0 max-w-2xl flex-col overflow-hidden rounded-t-[var(--radius)] border border-border bg-[var(--surface-elevated)] shadow-[var(--shadow-md)] sm:rounded-[var(--radius)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div>
            <h2 id={titleId} className="text-base font-semibold tracking-tight">
              {title}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Selecione os dias presenciais. Compensação:{" "}
              {COMPENSATION_BASE_TYPE_LABELS[compensation.base_type]}.
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
            <p className="text-xs text-muted-foreground">
              Feriados cadastrados aparecem em destaque e não podem ser
              selecionados como presenciais.
            </p>
          ) : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <MonthDayPicker
              yearMonth={yearMonth}
              selected={travelSelected}
              onChange={setTravelSelected}
              label="Dias presenciais — Deslocamento"
              accentClass="border-emerald-500/50 bg-emerald-500/20 font-semibold text-emerald-950 dark:text-emerald-100"
              holidayNameByDate={holidayNameByDate}
            />
            <MonthDayPicker
              yearMonth={yearMonth}
              selected={mealSelected}
              onChange={setMealSelected}
              label="Dias presenciais — Refeição"
              accentClass="border-sky-500/50 bg-sky-500/20 font-semibold text-sky-950 dark:text-sky-100"
              holidayNameByDate={holidayNameByDate}
            />
          </div>

          <div className="grid gap-2 rounded-[var(--radius-sm)] border border-border bg-muted/20 p-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Deslocamento
              </p>
              <p className="font-medium tabular-nums">
                {preview.travelPresencialDays} ×{" "}
                {formatClosingMoney(compensation.daily_travel_amount)} ={" "}
                {formatClosingMoney(preview.travelAmount)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Refeição
              </p>
              <p className="font-medium tabular-nums">
                {preview.mealPresencialDays} ×{" "}
                {formatClosingMoney(compensation.daily_meal_amount)} ={" "}
                {formatClosingMoney(preview.mealAmount)}
              </p>
            </div>
          </div>

          {isVariable ? (
            <div className="space-y-3 rounded-[var(--radius-sm)] border border-brand/30 bg-brand-soft/40 p-3 dark:bg-brand/10">
              <p className="text-xs text-muted-foreground text-pretty">
                Compensação variável — mesmos critérios da Folha. Diferencial
                usa as horas realizadas do mês (
                {workedHours.toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                })}{" "}
                h × valor/hora − base).
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Valor diferencial
                  </p>
                  <p className="text-lg font-semibold tabular-nums tracking-tight">
                    {formatClosingMoney(preview.differentialAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Valor total da Nota Fiscal
                  </p>
                  <p className="text-lg font-semibold tabular-nums tracking-tight">
                    {formatClosingMoney(preview.invoiceAmount)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Base {formatClosingMoney(compensation.base_amount)} +
                    diferencial + deslocamento + refeição
                  </p>
                </div>
              </div>
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
            </div>
          ) : (
            <div className="rounded-[var(--radius-sm)] border border-border bg-muted/15 px-3 py-2.5 text-xs text-muted-foreground">
              Compensação fixa — diferencial não se aplica. Total estimado da NF:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatClosingMoney(preview.invoiceAmount)}
              </span>{" "}
              (base + deslocamento + refeição).
            </div>
          )}

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

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="ui-btn-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="ui-btn-primary"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
