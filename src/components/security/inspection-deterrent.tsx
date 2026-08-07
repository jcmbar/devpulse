"use client";

import { isInspectionDeterrentEnabled } from "@/lib/security/inspection-deterrent";
import { cn } from "@/lib/utils";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Props = {
  children: ReactNode;
  /** Override env flag (tests / story). Default: env + NODE_ENV. */
  enabled?: boolean;
  className?: string;
};

const CHECK_INTERVAL_MS = 2000;
const SIZE_THRESHOLD_PX = 180;
/** Require two consecutive positives to reduce dock/zoom false positives. */
const DETECTION_STREAK = 2;

function isDevToolsLikelyOpen(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const widthGap = Math.abs(window.outerWidth - window.innerWidth);
  const heightGap = Math.abs(window.outerHeight - window.innerHeight);
  return widthGap > SIZE_THRESHOLD_PX || heightGap > SIZE_THRESHOLD_PX;
}

function isInspectionShortcut(event: KeyboardEvent): boolean {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  if (key === "F12") {
    return true;
  }

  const ctrlOrMeta = event.ctrlKey || event.metaKey;

  // Ctrl/Cmd + Shift + I / J / C (common DevTools)
  if (
    ctrlOrMeta &&
    event.shiftKey &&
    (key === "i" || key === "j" || key === "c" || key === "I" || key === "J" || key === "C")
  ) {
    return true;
  }

  // Ctrl/Cmd + U (view source)
  if (ctrlOrMeta && !event.shiftKey && !event.altKey && (key === "u" || key === "U")) {
    return true;
  }

  // macOS: Cmd + Option + I / J
  if (
    event.metaKey &&
    event.altKey &&
    (key === "i" || key === "j" || key === "I" || key === "J")
  ) {
    return true;
  }

  return false;
}

/**
 * Lightweight deterrence for casual inspection on sensitive screens.
 * Does not protect data — only raises friction for common shortcuts / right-click.
 */
export function InspectionDeterrent({
  children,
  enabled: enabledProp,
  className,
}: Props) {
  const enabled = enabledProp ?? isInspectionDeterrentEnabled();
  const [devtoolsOpen, setDevtoolsOpen] = useState(false);
  const streakRef = useRef(0);

  const evaluateDevtools = useCallback(() => {
    if (!isDevToolsLikelyOpen()) {
      streakRef.current = 0;
      setDevtoolsOpen(false);
      return;
    }
    streakRef.current += 1;
    if (streakRef.current >= DETECTION_STREAK) {
      setDevtoolsOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function onContextMenu(event: MouseEvent) {
      event.preventDefault();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!isInspectionShortcut(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    }

    function onResize() {
      evaluateDevtools();
    }

    document.addEventListener("contextmenu", onContextMenu, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onResize);

    evaluateDevtools();
    const timer = window.setInterval(evaluateDevtools, CHECK_INTERVAL_MS);

    return () => {
      document.removeEventListener("contextmenu", onContextMenu, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onResize);
      window.clearInterval(timer);
      streakRef.current = 0;
    };
  }, [enabled, evaluateDevtools]);

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div className={cn("relative", className)}>
      {children}
      {devtoolsOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 px-6 backdrop-blur-[2px]"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="inspection-deterrent-title"
          aria-describedby="inspection-deterrent-desc"
        >
          <div className="max-w-md rounded-[var(--radius)] border border-border bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow-md)]">
            <p
              id="inspection-deterrent-title"
              className="text-base font-semibold text-foreground"
            >
              Acesso restrito nesta área
            </p>
            <p
              id="inspection-deterrent-desc"
              className="mt-2 text-sm text-muted-foreground text-pretty"
            >
              Ferramentas de inspeção foram detectadas. Feche-as para continuar
              usando o painel. Esta é uma camada de dissuasão no navegador — a
              proteção real dos dados permanece no servidor.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
