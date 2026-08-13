"use client";

import { syncDeveloperAvatarAction } from "@/app/app/developers/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type SyncDeveloperAvatarButtonProps = {
  developerId: string;
  hasJiraAccountId: boolean;
};

export function SyncDeveloperAvatarButton({
  developerId,
  hasJiraAccountId,
}: SyncDeveloperAvatarButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!hasJiraAccountId) {
    return null;
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        className="ui-btn-secondary"
        onClick={() => {
          setMessage(null);
          setError(null);
          startTransition(async () => {
            const result = await syncDeveloperAvatarAction(developerId);
            if (result.error) {
              setError(result.error);
              return;
            }
            setMessage(result.success ?? "Avatar atualizado.");
            router.refresh();
          });
        }}
      >
        {pending ? "Sincronizando…" : "Atualizar foto do Jira"}
      </button>
      {error ? (
        <p className="text-xs text-danger text-pretty">{error}</p>
      ) : null}
      {message ? (
        <p className="text-xs text-muted-foreground text-pretty">{message}</p>
      ) : null}
    </div>
  );
}
