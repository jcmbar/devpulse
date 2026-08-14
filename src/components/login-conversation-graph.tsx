"use client";

import { useTheme } from "@/components/theme-provider";
import {
  LOGIN_MESH,
  loginMeshPoints,
} from "@/lib/login-graph";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

const COMPACT_QUERY = "(max-width: 640px), (max-height: 560px)";

function subscribeMedia(query: string) {
  return (onStoreChange: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener("change", onStoreChange);
    return () => media.removeEventListener("change", onStoreChange);
  };
}

function getMediaSnapshot(query: string) {
  return () => window.matchMedia(query).matches;
}

function getMediaServerSnapshot() {
  return false;
}

const subscribeReducedMotion = subscribeMedia(
  "(prefers-reduced-motion: reduce)",
);
const getReducedMotionSnapshot = getMediaSnapshot(
  "(prefers-reduced-motion: reduce)",
);
const subscribeCompact = subscribeMedia(COMPACT_QUERY);
const getCompactSnapshot = getMediaSnapshot(COMPACT_QUERY);

export function LoginConversationGraph() {
  const { resolvedTheme } = useTheme();
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getMediaServerSnapshot,
  );
  const compact = useSyncExternalStore(
    subscribeCompact,
    getCompactSnapshot,
    getMediaServerSnapshot,
  );
  const [meshClock, setMeshClock] = useState(LOGIN_MESH.cycleMs * 0.2);
  const listeningRef = useRef(false);
  const staticMesh = reducedMotion || compact;
  const light = resolvedTheme === "light";

  const clock = staticMesh
    ? compact
      ? LOGIN_MESH.cycleMs * 0.32
      : LOGIN_MESH.cycleMs * 0.2
    : meshClock;

  const points = useMemo(
    () =>
      loginMeshPoints(resolvedTheme, compact, clock).filter((point) => {
        const nx = (point.x * 100 - 50) / 16;
        const ny = (point.y * 100 - 44) / 14;
        return nx * nx + ny * ny >= 1;
      }),
    [clock, compact, resolvedTheme],
  );

  useEffect(() => {
    function isField(target: EventTarget | null): boolean {
      return (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      );
    }
    function onFocusIn(event: FocusEvent) {
      if (isField(event.target)) {
        listeningRef.current = true;
      }
    }
    function onFocusOut(event: FocusEvent) {
      if (isField(event.target)) {
        listeningRef.current = false;
      }
    }
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  useEffect(() => {
    if (staticMesh) {
      return;
    }
    let frame = 0;
    let last = performance.now();
    let skip = 0;
    const tick = (now: number) => {
      const dt = Math.min(32, now - last);
      last = now;
      const scale = listeningRef.current ? LOGIN_MESH.listenScale : 1;
      skip += 1;
      if (skip % 2 === 0) {
        setMeshClock((value) => value + dt * scale * 2);
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [staticMesh]);

  return (
    <svg
      className="login-mesh"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {points.map((point) => (
        <circle
          key={`${point.row}-${point.col}`}
          cx={point.x * 100}
          cy={point.y * 100}
          r={light ? 0.26 + point.size * 0.26 : 0.18 + point.size * 0.28}
          fill="var(--login-mesh)"
          opacity={point.alpha * (light ? 0.88 : 0.9)}
        />
      ))}
    </svg>
  );
}
