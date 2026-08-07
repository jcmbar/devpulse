"use client";

import { useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyTrendPoint } from "@/lib/metrics/monthly-trend";
import { cn } from "@/lib/utils";

export type MonthlyTrendMetric =
  | "cards"
  | "utilization"
  | "deliveryIndex"
  | "mix";

type MonthlyTrendChartProps = {
  title: string;
  description?: string;
  points: MonthlyTrendPoint[];
  /** When true, utilization/index are averages across developers (gestor matrix). */
  averagesNote?: boolean;
  /** Shorter chart area for dense personal dashboards. */
  compact?: boolean;
  className?: string;
};

const METRIC_OPTIONS: Array<{
  id: MonthlyTrendMetric;
  label: string;
}> = [
  { id: "cards", label: "Cards" },
  { id: "utilization", label: "Aproveitamento" },
  { id: "deliveryIndex", label: "Índice" },
  { id: "mix", label: "Prazo × atraso" },
];

export function MonthlyTrendChart({
  title,
  description,
  points,
  averagesNote = false,
  compact = false,
  className,
}: MonthlyTrendChartProps) {
  const [metric, setMetric] = useState<MonthlyTrendMetric>("cards");

  const options = averagesNote
    ? METRIC_OPTIONS.filter((option) => option.id !== "mix")
    : METRIC_OPTIONS;

  return (
    <section className={cn("ui-dashboard-panel", className)}>
      <div className="flex flex-col gap-3 border-b border-border/70 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
          {averagesNote &&
          (metric === "utilization" || metric === "deliveryIndex") ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Média dos developers com entrega no mês (mesma base da matriz
              mensal).
            </p>
          ) : null}
        </div>
        <div
          className={cn(
            "ui-mode-toggle shrink-0",
            options.length === 4 ? "sm:max-w-md" : "sm:max-w-sm sm:grid-cols-3",
          )}
        >
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setMetric(option.id)}
              className={cn(
                "ui-mode-toggle__btn px-2 text-xs sm:text-sm",
                metric === option.id ? "is-active" : "",
              )}
              aria-pressed={metric === option.id}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {points.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Sem entregas com Entrega TU para montar o acompanhamento mensal neste
          filtro.
        </p>
      ) : (
        <div
          className={cn(
            "mt-3 w-full",
            compact ? "h-48 sm:h-52" : "mt-4 h-64 sm:h-72",
          )}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={points}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="var(--border)"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="left"
                allowDecimals={metric !== "cards" && metric !== "mix"}
                width={36}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--foreground)",
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }}
              />
              {metric === "cards" ? (
                <Bar
                  yAxisId="left"
                  dataKey="cards"
                  name="Cards"
                  fill="var(--info)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              ) : null}
              {metric === "utilization" ? (
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="utilizationPct"
                  name="Aproveitamento %"
                  stroke="var(--brand)"
                  fill="var(--brand)"
                  fillOpacity={0.18}
                  strokeWidth={2}
                  connectNulls
                />
              ) : null}
              {metric === "deliveryIndex" ? (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="deliveryIndex"
                  name="Índice"
                  stroke="var(--brand)"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "var(--brand)" }}
                />
              ) : null}
              {metric === "mix" ? (
                <>
                  <Bar
                    yAxisId="left"
                    dataKey="onTime"
                    name="No prazo"
                    stackId="mix"
                    fill="var(--success)"
                    radius={[0, 0, 0, 0]}
                    maxBarSize={40}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="delayedNet"
                    name="Atraso líq."
                    stackId="mix"
                    fill="var(--danger)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </>
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
