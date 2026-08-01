"use client";

import { batchLookupDeveloperJiraAccountsAction } from "@/app/app/developers/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type DeveloperJiraAccountBatchLookupProps = {
  /** Developers on the current page that have e-mail and empty jira_account_id. */
  candidateIds: string[];
};

export function DeveloperJiraAccountBatchLookup({
  candidateIds,
}: DeveloperJiraAccountBatchLookupProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (candidateIds.length === 0) {
    return null;
  }

  return (
    <div className="ui-dashboard-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Ferramenta · Jira Account ID
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {candidateIds.length} developer(s) nesta página sem ID e com e-mail
            para busca automática.
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            setSummary(null);
            startTransition(async () => {
              try {
                const result = await batchLookupDeveloperJiraAccountsAction(
                  candidateIds,
                );
                setSummary(
                  `Lote: ${result.summary.filled} preenchido(s) · ${result.summary.notFound} não encontrado(s) · ${result.summary.ambiguous} ambíguo(s) · ${result.summary.noEmail} sem e-mail · ${result.summary.skipped} ignorado(s) · ${result.summary.error} erro(s).`,
                );
                if (result.summary.filled > 0) {
                  router.refresh();
                }
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Falha no lote de busca Jira.",
                );
              }
            });
          }}
          className="ui-btn-secondary shrink-0"
        >
          {pending
            ? `Buscando ${candidateIds.length}…`
            : `Buscar IDs faltantes (${candidateIds.length})`}
        </button>
      </div>
      {summary ? (
        <p className="mt-2 text-xs text-muted-foreground">{summary}</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}
