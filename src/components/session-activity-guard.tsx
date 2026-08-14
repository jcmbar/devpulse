"use client";

import { signOutIdle } from "@/lib/auth/actions";
import { useEffect } from "react";

const PING_THROTTLE_MS = 20_000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export function SessionActivityGuard({
  idleMinutes,
}: {
  idleMinutes: number | null;
}) {
  useEffect(() => {
    if (idleMinutes == null || idleMinutes <= 0) {
      return;
    }

    const idleMs = idleMinutes * 60 * 1000;
    let lastPing = 0;
    let lastActivity = Date.now();
    let timer = 0;

    function scheduleLogout() {
      window.clearTimeout(timer);
      const remaining = idleMs - (Date.now() - lastActivity);
      timer = window.setTimeout(() => {
        void signOutIdle();
      }, Math.max(remaining, 0));
    }

    function ping() {
      lastActivity = Date.now();
      scheduleLogout();
      const now = Date.now();
      if (now - lastPing < PING_THROTTLE_MS) {
        return;
      }
      lastPing = now;
      void fetch("/api/session/touch", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
      });
    }

    function onVisibility() {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (Date.now() - lastActivity >= idleMs) {
        void signOutIdle();
        return;
      }
      ping();
    }

    ping();
    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, ping, { passive: true });
    });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, ping);
      });
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [idleMinutes]);

  return null;
}
