"use client";

import { upsertAttendanceDayAction } from "@/app/app/gestor/folha/actions";
import {
  PAYROLL_ATTENDANCE_KIND_LABELS,
  PAYROLL_ATTENDANCE_KINDS,
  type PayrollAttendanceDay,
  type PayrollAttendanceKind,
  type PayrollClosingItem,
} from "@/types/payroll-closing";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type PayrollAttendancePanelProps = {
  item: PayrollClosingItem;
  days: PayrollAttendanceDay[];
  closeHref: string;
};

function weekdayLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date);
}

function dayNumber(isoDate: string): string {
  return isoDate.slice(8, 10);
}

export function PayrollAttendancePanel({
  item,
  days,
  closeHref,
}: PayrollAttendancePanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [localDays, setLocalDays] = useState(days);

  function saveDay(input: {
    dayOn: string;
    dayKind: PayrollAttendanceKind;
    hours: number;
  }) {
    setError(null);
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
      setLocalDays((prev) =>
        prev.map((day) =>
          day.day_on === input.dayOn
            ? {
                ...day,
                day_kind: input.dayKind,
                hours:
                  input.dayKind === "presencial" || input.dayKind === "home"
                    ? input.hours
                    : 0,
              }
            : day,
        ),
      );
      router.refresh();
    });
  }

  return (
    <section className="ui-dashboard-panel space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Calendário de presença · {item.developer_name}
          </h2>
          <p className="text-sm text-muted-foreground">
            Marque os dias presenciais. Horas padrão:{" "}
            {item.contracted_hours_per_day.toLocaleString("pt-BR")} h/dia.
            Diferencial variável = horas presenciais × valor hora.
          </p>
        </div>
        <a href={closeHref} className="ui-btn-secondary text-sm">
          Fechar calendário
        </a>
      </div>

      {error ? (
        <p className="ui-alert-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {localDays.map((day) => {
          const isWorkable =
            day.day_kind === "presencial" || day.day_kind === "home";
          return (
            <div
              key={day.id}
              className="rounded-[var(--radius-sm)] border border-border/80 bg-card/60 p-2.5 space-y-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium tabular-nums">
                  {dayNumber(day.day_on)}
                </span>
                <span className="text-[11px] uppercase text-muted-foreground">
                  {weekdayLabel(day.day_on)}
                </span>
              </div>
              <select
                className="ui-select text-xs"
                value={day.day_kind}
                disabled={pending}
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
                  defaultValue={String(day.hours)}
                  disabled={pending}
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
