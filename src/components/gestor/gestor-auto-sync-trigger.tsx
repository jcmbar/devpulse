"use client";

import { requestGestorAutoSyncAction } from "@/app/app/jira/pipeline-actions";
import { useEffect, useRef } from "react";

type GestorAutoSyncTriggerProps = {
  /** Filtered team id, or null for “all teams”. */
  teamId: string | null;
};

/**
 * One-shot mount trigger for gestor auto-sync.
 * Does not block RSC HTML; schedules work via server action + after().
 */
export function GestorAutoSyncTrigger({ teamId }: GestorAutoSyncTriggerProps) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) {
      return;
    }
    fired.current = true;
    void requestGestorAutoSyncAction({ teamId }).catch((error) => {
      console.error("[GestorAutoSyncTrigger]", error);
    });
  }, [teamId]);

  return null;
}
