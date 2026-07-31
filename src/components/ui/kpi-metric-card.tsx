import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type KpiMetricTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info";

const TONE_CLASS: Record<KpiMetricTone, string> = {
  neutral: "",
  brand: "ui-kpi-card--brand",
  success: "ui-kpi-card--success",
  warning: "ui-kpi-card--warning",
  danger: "ui-kpi-card--danger",
  info: "ui-kpi-card--info",
};

type KpiMetricCardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: KpiMetricTone;
  className?: string;
  title?: string;
};

/**
 * Semantic KPI tile for Home / Gestor.
 * Tones map to volume (info), quality (brand/success), risk (warning/danger).
 */
export function KpiMetricCard({
  label,
  value,
  hint,
  tone = "neutral",
  className,
  title,
}: KpiMetricCardProps) {
  return (
    <div
      className={cn("ui-kpi-card", TONE_CLASS[tone], className)}
      title={title}
    >
      <p className="ui-kpi-card__label">{label}</p>
      <p className="ui-kpi-card__value">{value}</p>
      {hint ? <div className="ui-kpi-card__hint">{hint}</div> : null}
    </div>
  );
}
