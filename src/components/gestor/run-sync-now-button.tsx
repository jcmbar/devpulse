"use client";

import { triggerJiraSyncAction } from "@/app/app/jira/pipeline-actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type RunSyncNowButtonProps = {
  integrationId: string;
  teamId: string;
};

export function RunSyncNowButton({
  integrationId,
  teamId,
}: RunSyncNowButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const result = await triggerJiraSyncAction({
        integrationId,
        teamId,
        forceFull: false,
      });

      if (!result.ok) {
        setError(
          result.error ??
            result.message ??
            (result.reason === "already_running"
              ? "Já existe uma sincronização em andamento."
              : "Falha ao sincronizar."),
        );
        return;
      }

      setMessage("Sync concluído. Atualizando painel…");
      router.refresh();
    });
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end">
      <button
        type="button"
        disabled={pending}
        onClick={run}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-sm)] bg-brand px-4 text-sm font-semibold text-brand-on shadow-[var(--shadow-sm)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Sincronizando…" : "Rodar Sync Agora"}
      </button>
      {error ? (
        <p className="text-xs text-danger sm:max-w-xs sm:text-right">
          {error}
        </p>
      ) : null}
      {message && !error ? (
        <p className="text-xs text-success sm:max-w-xs sm:text-right">
          {message}
        </p>
      ) : null}
    </div>
  );
}
