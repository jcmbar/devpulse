"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** Stable stack order (bottom → top). Matches flow_v1 groups used in WIP history. */
export const CFD_STATUS_GROUP_ORDER = [
  "analysis",
  "development",
  "validation",
  "other",
] as const;

export type CfdStatusGroup = (typeof CFD_STATUS_GROUP_ORDER)[number];

/** Stable colors — readable in light/dark; not theme-purple. */
const GROUP_COLORS: Record<CfdStatusGroup, string> = {
  analysis: "var(--muted-foreground)",
  development: "var(--brand)",
  validation: "#d97706",
  other: "#94a3b8",
};

export type CfdChartDay = {
  day: string;
  byGroup: Record<string, number>;
  totalOpen: number;
};

type CfdChartProps = {
  days: CfdChartDay[];
};

type ChartRow = {
  day: string;
  label: string;
  totalOpen: number;
} & Record<CfdStatusGroup, number>;

function toChartRows(days: CfdChartDay[]): ChartRow[] {
  return days.map((row) => {
    const point = {
      day: row.day,
      label: row.day.slice(5), // MM-DD
      totalOpen: row.totalOpen,
    } as ChartRow;

    for (const group of CFD_STATUS_GROUP_ORDER) {
      point[group] = Number(row.byGroup[group] ?? 0);
    }
    return point;
  });
}

type TooltipPayloadItem = {
  dataKey?: string | number;
  value?: number | string;
  color?: string;
  name?: string;
};

function CfdTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const row = payload[0] as TooltipPayloadItem & {
    payload?: ChartRow;
  };
  const day = row.payload?.day ?? label ?? "—";
  const totalOpen = row.payload?.totalOpen ?? 0;

  const breakdown = CFD_STATUS_GROUP_ORDER.map((group) => {
    const item = payload.find((entry) => entry.dataKey === group);
    return {
      group,
      value: Number(item?.value ?? row.payload?.[group] ?? 0),
      color: GROUP_COLORS[group],
    };
  });

  return (
    <div
      className="rounded-[var(--radius-sm)] border border-border bg-card px-3 py-2 text-xs shadow-sm"
      style={{ minWidth: 160 }}
    >
      <p className="font-medium text-foreground">{day} · UTC</p>
      <p className="mt-0.5 tabular-nums text-muted-foreground">
        WIP total: {totalOpen}
      </p>
      <ul className="mt-2 space-y-1">
        {breakdown.map((entry) => (
          <li
            key={entry.group}
            className="flex items-center justify-between gap-4 tabular-nums"
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="inline-block size-2 rounded-sm"
                style={{ background: entry.color }}
              />
              {entry.group}
            </span>
            <span className="text-foreground">{entry.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Stacked area CFD from read-model `history.wipByDay`.
 * Presentation only — fills missing groups with 0 for chart stability.
 */
export function CfdChart({ days }: CfdChartProps) {
  const data = toChartRows(days);
  const sparse = data.length > 0 && data.length < 4;

  return (
    <div className="space-y-3">
      <div className="h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
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
              interval={sparse ? 0 : "preserveStartEnd"}
              minTickGap={sparse ? 8 : 24}
            />
            <YAxis
              allowDecimals={false}
              width={32}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={<CfdTooltip />}
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
            />
            <Legend
              verticalAlign="top"
              height={28}
              wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
            />
            {CFD_STATUS_GROUP_ORDER.map((group) => (
              <Area
                key={group}
                type="monotone"
                dataKey={group}
                name={group}
                stackId="wip"
                stroke={GROUP_COLORS[group]}
                fill={GROUP_COLORS[group]}
                fillOpacity={0.55}
                strokeWidth={1.25}
                isAnimationActive={false}
              />
            ))}
            <Line
              type="monotone"
              dataKey="totalOpen"
              name="WIP total"
              stroke="var(--foreground)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="ui-hint m-0">
        Áreas = WIP por grupo (EOD UTC). Linha = total aberto. Faixas que
        engrossam ao longo do tempo sugerem acúmulo naquele grupo — confirme na
        auditoria antes de concluir gargalo.
      </p>
    </div>
  );
}
