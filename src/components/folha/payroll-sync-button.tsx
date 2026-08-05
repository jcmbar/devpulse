"use client";

import { syncPayrollFromCompensationAction } from "@/app/app/gestor/folha/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function PayrollSyncFromCompensationButton({
  yearMonth,
  teamId,
}: {
  yearMonth: string;
  teamId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="ui-btn-secondary text-sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          setMessage(null);
          startTransition(async () => {
            const result = await syncPayrollFromCompensationAction({
              yearMonth,
              teamId: teamId ?? null,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setMessage(
              result.syncedCount === 0
                ? "Nenhuma pessoa sincronizada."
                : `${result.syncedCount} pessoa(s) recalculada(s).`,
            );
            router.refresh();
          });
        }}
      >
        {pending ? "Recalculando..." : "Recalcular pelo cadastro"}
      </button>
      {message ? (
        <span className="text-xs text-muted-foreground">{message}</span>
      ) : null}
      {error ? (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
