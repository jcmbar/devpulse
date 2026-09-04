"use client";

import { FormField } from "@/components/ui/form";
import { persistFiltersFromHref } from "@/lib/filters/persist-client";
import type { FilterScope } from "@/lib/filters/persist";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ImportBatchOption } from "@/types/import-period";

type ImportBatchSelectorProps = {
  batches: ImportBatchOption[];
  selectedImportId: string | null;
  basePath: string;
  /** Preserve other query params (from/to/month). */
  preservedParams?: Record<string, string | undefined>;
  /** Compact control for FilterBar. */
  embedded?: boolean;
  persistScope?: FilterScope;
  /**
   * When true, changing the select navigates immediately.
   * Default false — change locally and apply via a parent form / Aplicar.
   */
  applyOnChange?: boolean;
  form?: string;
  id?: string;
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
  embedded = false,
  persistScope,
  applyOnChange = false,
  form,
  id = "importId",
}: ImportBatchSelectorProps) {
  const router = useRouter();
  const serverValue = selectedImportId ?? "";
  const [draft, setDraft] = useState(serverValue);

  useEffect(() => {
    setDraft(serverValue);
  }, [serverValue]);

  if (batches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma importação concluída ainda.
      </p>
    );
  }

  const select = (
    <select
      id={id}
      name="importId"
      form={form}
      value={draft}
      onChange={(event) => {
        const value = event.target.value || null;
        setDraft(value ?? "");
        if (!applyOnChange) {
          return;
        }
        const href = buildHref(basePath, value, preservedParams);
        if (persistScope) {
          persistFiltersFromHref(persistScope, href);
        }
        router.push(href);
      }}
      className={
        embedded ? "ui-select w-full min-w-0 max-w-full" : "ui-select max-w-xl"
      }
      aria-label="Lote importado"
    >
      {batches.map((batch) => (
        <option key={batch.id} value={batch.id}>
          {formatBatchLabel(batch)}
        </option>
      ))}
    </select>
  );

  if (embedded) {
    return select;
  }

  return (
    <FormField label="Lote importado" htmlFor={id}>
      {select}
    </FormField>
  );
}
