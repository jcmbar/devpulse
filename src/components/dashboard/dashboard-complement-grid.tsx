import Link from "next/link";
import { PersonAvatar } from "@/components/person-avatar";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type MixItem = {
  label: string;
  value: number;
  total: number;
  tone: "success" | "danger" | "warning" | "info" | "brand" | "neutral";
  detail?: string;
};

type HoursItem = {
  label: string;
  value: string;
  hint?: string;
};

type RankItem = {
  name: string;
  meta: string;
  href?: string;
  avatarUrl?: string | null;
};

type DashboardComplementGridProps = {
  mixTitle: string;
  mixItems: MixItem[];
  hoursTitle: string;
  hoursItems: HoursItem[];
  thirdTitle: string;
  thirdDescription?: string;
  thirdContent: ReactNode;
  className?: string;
};

const TONE_BAR: Record<MixItem["tone"], string> = {
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
  brand: "bg-brand",
  neutral: "bg-muted-foreground/50",
};

function pct(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((value / total) * 1000) / 10);
}

/**
 * Three-column complementary reading block under the monthly chart.
 * Presentational only — values come from existing metrics.
 */
export function DashboardComplementGrid({
  mixTitle,
  mixItems,
  hoursTitle,
  hoursItems,
  thirdTitle,
  thirdDescription,
  thirdContent,
  className,
}: DashboardComplementGridProps) {
  return (
    <div
      className={cn(
        "grid gap-3 md:grid-cols-2 xl:grid-cols-3 xl:gap-4",
        className,
      )}
    >
      <section className="ui-dashboard-panel">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          {mixTitle}
        </h3>
        <ul className="mt-3 space-y-3">
          {mixItems.map((item) => {
            const share = pct(item.value, item.total);
            return (
              <li key={item.label}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-foreground">
                    {item.label}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {item.value}
                    {item.total > 0 ? (
                      <>
                        /{item.total}{" "}
                        <span className="text-foreground">({share}%)</span>
                      </>
                    ) : null}
                  </span>
                </div>
                {item.detail ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {item.detail}
                  </p>
                ) : null}
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", TONE_BAR[item.tone])}
                    style={{ width: `${share}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="ui-dashboard-panel">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          {hoursTitle}
        </h3>
        <dl className="mt-3 space-y-3">
          {hoursItems.map((item) => (
            <div
              key={item.label}
              className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0"
            >
              <dt className="text-sm text-muted-foreground">{item.label}</dt>
              <dd className="text-right">
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {item.value}
                </p>
                {item.hint ? (
                  <p className="text-[11px] text-muted-foreground">{item.hint}</p>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="ui-dashboard-panel md:col-span-2 xl:col-span-1">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          {thirdTitle}
        </h3>
        {thirdDescription ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {thirdDescription}
          </p>
        ) : null}
        <div className="mt-3">{thirdContent}</div>
      </section>
    </div>
  );
}

export function DashboardRankList({ items }: { items: RankItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum developer para exibir.
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {items.map((item, index) => (
        <li
          key={`${item.name}-${index}`}
          className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border/60 bg-muted/30 px-2.5 py-2"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">
              {index + 1}
            </span>
            <PersonAvatar name={item.name} src={item.avatarUrl} size="sm" />
            {item.href ? (
              <Link
                href={item.href}
                className="truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                {item.name}
              </Link>
            ) : (
              <span className="truncate text-sm font-medium text-foreground">
                {item.name}
              </span>
            )}
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {item.meta}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function DashboardStatusList({
  counts,
}: {
  counts: Record<string, number>;
}) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Sem status no período.</p>
    );
  }
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  return (
    <ul className="space-y-2">
      {entries.slice(0, 6).map(([status, count]) => (
        <li
          key={status}
          className="flex items-center justify-between gap-2 text-sm"
        >
          <span className="truncate text-foreground">{status || "—"}</span>
          <span className="tabular-nums text-muted-foreground">
            {count}
            {total > 0 ? (
              <span className="text-foreground">
                {" "}
                ({pct(count, total)}%)
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
