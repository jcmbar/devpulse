"use client";

import { FormField } from "@/components/ui/form";
import { useRouter } from "next/navigation";
import type { ImportBatchOption } from "@/types/import-period";

type ImportBatchSelectorProps = {
  batches: ImportBatchOption[];
  selectedImportId: string | null;
  basePath: string;
  /** Preserve other query params (from/to/month). */
  preservedParams?: Record<string, string | undefined>;
};

function formatBatchLabel(batch: ImportBatchOption): string {
  const team =
    batch.team_name && batch.jira_key_prefix
      ? `${batch.team_name} (${batch.jira_key_prefix}) · `
      : batch.team_name
        ? `${batch.team_name} · `
        : "";
  const name = batch.source_label ?? "Importação";
  const range =
    batch.period_start && batch.period_end
      ? `${batch.period_start} → ${batch.period_end}`
      : "sem faixa detectada";
  return `${team}${name} · ${range} · ${batch.records_count} cards`;
}

function buildHref(
  basePath: string,
  importId: string | null,
  preservedParams?: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  if (importId) {
    params.set("importId", importId);
  }
  for (const [key, value] of Object.entries(preservedParams ?? {})) {
    if (value) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function ImportBatchSelector({
  batches,
  selectedImportId,
  basePath,
  preservedParams,
}: ImportBatchSelectorProps) {
  const router = useRouter();

  if (batches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma importação concluída ainda.
      </p>
    );
  }

  return (
    <FormField label="Lote importado" htmlFor="importId">
      <select
        id="importId"
        name="importId"
        value={selectedImportId ?? ""}
        onChange={(event) => {
          const value = event.target.value || null;
          router.push(buildHref(basePath, value, preservedParams));
        }}
        className="ui-select max-w-xl"
      >
        {batches.map((batch) => (
          <option key={batch.id} value={batch.id}>
            {formatBatchLabel(batch)}
          </option>
        ))}
      </select>
    </FormField>
  );
}
