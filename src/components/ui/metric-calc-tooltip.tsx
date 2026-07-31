"use client";

import { cn } from "@/lib/utils";
import type { MetricCalcExplain } from "@/lib/metrics/metric-calc-explain";
import { metricCalcExplainToPlainText } from "@/lib/metrics/metric-calc-explain";
import { Info } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type MetricCalcTooltipProps = {
  explain: MetricCalcExplain;
  children: ReactNode;
  className?: string;
  /** Show a small info affordance next to the value (helpful on touch). */
  showInfoIcon?: boolean;
};

type PanelPos = { top: number; left: number; width: number };

function MetricCalcPanel({ explain }: { explain: MetricCalcExplain }) {
  return (
    <div className="ui-metric-tooltip__body">
      <p className="ui-metric-tooltip__title">{explain.title}</p>
      <ul className="ui-metric-tooltip__facts">
        {explain.facts.map((fact) => (
          <li key={fact.label}>
            <span className="ui-metric-tooltip__fact-label">{fact.label}</span>
            <span className="ui-metric-tooltip__fact-value">{fact.value}</span>
          </li>
        ))}
      </ul>
      <p className="ui-metric-tooltip__rule">
        <span className="font-medium text-foreground">Regra aplicada:</span>{" "}
        {explain.rule}
      </p>
      <p className="ui-metric-tooltip__calc">
        <span className="font-medium text-foreground">Cálculo:</span>{" "}
        <span className="font-mono text-[12px] tabular-nums">
          {explain.calculation}
        </span>
      </p>
      {explain.interpretation ? (
        <p className="ui-metric-tooltip__interpretation">
          {explain.interpretation}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Hover tooltip on desktop; tap/click toggle on touch (and as keyboard fallback).
 * Portaled to body so table overflow does not clip the panel.
 */
export function MetricCalcTooltip({
  explain,
  children,
  className,
  showInfoIcon = true,
}: MetricCalcTooltipProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const plain = metricCalcExplainToPlainText(explain);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    const below = rect.bottom + 8;
    const estimatedHeight = 220;
    const top =
      below + estimatedHeight > window.innerHeight - 8
        ? Math.max(8, rect.top - estimatedHeight - 8)
        : below;
    setPos({ top, left, width });
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    updatePosition();
    function onScroll() {
      updatePosition();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open, updatePosition]);

  function clearCloseTimer() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function openFromHover() {
    clearCloseTimer();
    setOpen(true);
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  function toggleFromPress() {
    clearCloseTimer();
    setOpen((value) => !value);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cn("ui-metric-tooltip__trigger", className)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="Ver memória de cálculo"
        title={plain}
        onMouseEnter={openFromHover}
        onMouseLeave={scheduleClose}
        onFocus={openFromHover}
        onBlur={scheduleClose}
        onClick={(event) => {
          // Prefer click/tap toggle on coarse pointers; still useful on desktop.
          event.preventDefault();
          toggleFromPress();
        }}
      >
        <span className="min-w-0">{children}</span>
        {showInfoIcon ? (
          <Info
            className="ui-metric-tooltip__icon"
            strokeWidth={1.9}
            aria-hidden
          />
        ) : null}
      </button>

      {mounted && open && pos
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="tooltip"
              className="ui-metric-tooltip__panel"
              style={{
                top: pos.top,
                left: pos.left,
                width: pos.width,
              }}
              onMouseEnter={openFromHover}
              onMouseLeave={scheduleClose}
            >
              <MetricCalcPanel explain={explain} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
