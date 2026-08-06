"use client";

import { GestorClosingDecisionPanel } from "@/components/monthly-closing/gestor-closing-decision";
import { formatClosingMoney } from "@/lib/metrics/closing-submit-values";
import { formatYearMonthLabel } from "@/lib/metrics/date-range";
import { cn } from "@/lib/utils";
import { COMPENSATION_BASE_TYPE_LABELS } from "@/types/developer-compensation";
import type {
  MonthlyClosing,
  MonthlyClosingAttachment,
  MonthlyClosingPresenceDay,
} from "@/types/monthly-closing";
import { useMemo, useState } from "react";

type GestorClosingReviewTabsProps = {
  closing: MonthlyClosing;
  attachments: MonthlyClosingAttachment[];
  presenceDays: MonthlyClosingPresenceDay[];
};

function formatHours(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return `${value.toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })} h`;
}

function DayChips({
  days,
  emptyLabel,
}: {
  days: string[];
  emptyLabel: string;
}) {
  if (days.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {days.map((day) => (
        <span
          key={day}
          className="inline-flex rounded-[var(--radius-sm)] border border-border bg-muted/30 px-2 py-0.5 text-xs tabular-nums"
        >
          {day.slice(8, 10)}/{day.slice(5, 7)}
        </span>
      ))}
    </div>
  );
}

export function GestorClosingReviewTabs({
  closing,
  attachments,
  presenceDays,
}: GestorClosingReviewTabsProps) {
  const [tab, setTab] = useState<"decisao" | "valores">("decisao");

  const travelDays = useMemo(
    () =>
      presenceDays
        .filter((row) => row.kind === "travel")
        .map((row) => row.day_on),
    [presenceDays],
  );
  const mealDays = useMemo(
    () =>
      presenceDays.filter((row) => row.kind === "meal").map((row) => row.day_on),
    [presenceDays],
  );

  const hasValues = closing.values_submitted_at != null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setTab("decisao")}
          className={cn(
            "rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm font-medium",
            tab === "decisao"
              ? "border-brand/40 bg-brand-soft text-foreground"
              : "border-border hover:bg-muted",
          )}
        >
          Decisão
        </button>
        <button
          type="button"
          onClick={() => setTab("valores")}
          className={cn(
            "rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm font-medium",
            tab === "valores"
              ? "border-brand/40 bg-brand-soft text-foreground"
              : "border-border hover:bg-muted",
          )}
        >
          Valores
        </button>
      </div>

      {tab === "decisao" ? (
        <GestorClosingDecisionPanel
          closing={closing}
          attachments={attachments}
        />
      ) : (
        <section className="space-y-4 rounded-[var(--radius)] border border-border p-4">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Valores informados no envio
            </h3>
            <p className="text-xs text-muted-foreground">
              Declarados pelo developer/analista ao enviar{" "}
              {formatYearMonthLabel(closing.year_month)} para revisão.
            </p>
          </div>

          {!hasValues ? (
            <p className="text-sm text-muted-foreground">
              Este fechamento ainda não possui valores de presença/NF gravados
              (envio anterior à nova regra ou dados incompletos).
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric
                  label="Deslocamento"
                  value={`${closing.travel_presencial_days ?? 0} dia(s)`}
                  detail={formatClosingMoney(closing.travel_amount)}
                />
                <Metric
                  label="Refeição"
                  value={`${closing.meal_presencial_days ?? 0} dia(s)`}
                  detail={formatClosingMoney(closing.meal_amount)}
                />
                <Metric
                  label="Diferencial"
                  value={formatClosingMoney(closing.differential_amount)}
                  detail={
                    closing.compensation_base_type
                      ? COMPENSATION_BASE_TYPE_LABELS[
                          closing.compensation_base_type
                        ]
                      : undefined
                  }
                />
                <Metric
                  label="Total NF"
                  value={formatClosingMoney(closing.invoice_amount)}
                  detail={`Base ${formatClosingMoney(closing.compensation_base_amount)}`}
                />
              </div>

              <div className="grid gap-2 rounded-[var(--radius-sm)] border border-border bg-muted/15 p-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Horas realizadas (snapshot)
                  </p>
                  <p className="font-medium tabular-nums">
                    {formatHours(closing.worked_hours_snapshot)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Valor/hora
                  </p>
                  <p className="font-medium tabular-nums">
                    {formatClosingMoney(closing.compensation_hourly_rate)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Diárias
                  </p>
                  <p className="font-medium tabular-nums">
                    Desloc.{" "}
                    {formatClosingMoney(
                      closing.compensation_daily_travel_amount,
                    )}{" "}
                    · Ref.{" "}
                    {formatClosingMoney(closing.compensation_daily_meal_amount)}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Dias — Deslocamento
                  </p>
                  <DayChips
                    days={travelDays}
                    emptyLabel="Nenhum dia de deslocamento selecionado."
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Dias — Refeição
                  </p>
                  <DayChips
                    days={mealDays}
                    emptyLabel="Nenhum dia de refeição selecionado."
                  />
                </div>
              </div>

              {closing.developer_values_notes ? (
                <div className="space-y-1.5 rounded-[var(--radius-sm)] border border-border px-3 py-3">
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Observação do developer
                  </p>
                  <p className="text-sm text-pretty whitespace-pre-wrap">
                    {closing.developer_values_notes}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-border bg-muted/10 px-3 py-2.5">
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-0.5 text-base font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      {detail ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}
