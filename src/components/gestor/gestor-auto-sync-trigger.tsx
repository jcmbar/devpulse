"use client";

import { requestGestorAutoSyncAction } from "@/app/app/jira/pipeline-actions";
import { useEffect, useRef } from "react";

const GESTOR_AUTO_SYNC_DELAY_MS = 60_000;

type GestorAutoSyncTriggerProps = {
  /** Filtered team id, or null for “all teams”. */
  teamId: string | null;
};

/**
 * One-shot mount trigger for gestor auto-sync.
 * Waits before scheduling so manual "Rodar Sync Agora" is not racing the background pipeline.
 */
export function GestorAutoSyncTrigger({ teamId }: GestorAutoSyncTriggerProps) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) {
      return;
    }
    fired.current = true;

    const timer = window.setTimeout(() => {
      void requestGestorAutoSyncAction({ teamId }).catch((error) => {
        console.error("[GestorAutoSyncTrigger]", error);
      });
    }, GESTOR_AUTO_SYNC_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [teamId]);

  return null;
}
