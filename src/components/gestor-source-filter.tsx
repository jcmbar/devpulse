"use client";

import { FormField } from "@/components/ui/form";
import { persistFiltersFromHref } from "@/lib/filters/persist-client";
import type { FilterScope } from "@/lib/filters/persist";
import {
  COMPILADO_SOURCE_MODES,
  compiladoSourceModeLabel,
  type CompiladoSourceMode,
} from "@/lib/metrics/gestor-data-source";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type GestorSourceFilterProps = {
  basePath: string;
  selected: CompiladoSourceMode;
  preservedParams?: Record<string, string | undefined>;
  /** Compact control for FilterBar (no card / helper copy). */
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

function buildHref(
  basePath: string,
  source: CompiladoSourceMode,
  preservedParams?: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  if (source !== "auto") {
    params.set("source", source);
  }
  for (const [key, value] of Object.entries(preservedParams ?? {})) {
    if (value) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function GestorSourceFilter({
  basePath,
  selected,
  preservedParams,
  embedded = false,
  persistScope,
  applyOnChange = false,
  form,
  id = "gestor-source",
}: GestorSourceFilterProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(selected);

  useEffect(() => {
    setDraft(selected);
  }, [selected]);

  const select = (
    <select
      id={id}
      name="source"
      form={form}
      value={draft}
      onChange={(event) => {
        const next = event.target.value as CompiladoSourceMode;
        setDraft(next);
        if (!applyOnChange) {
          return;
        }
        const href = buildHref(basePath, next, preservedParams);
        if (persistScope) {
          persistFiltersFromHref(persistScope, href);
        }
        router.push(href);
      }}
      className={embedded ? "ui-select w-full min-w-0" : "ui-select max-w-xl"}
      aria-label="Modo de fonte"
    >
      {COMPILADO_SOURCE_MODES.map((option) => (
        <option key={option} value={option}>
          {compiladoSourceModeLabel(option)}
        </option>
      ))}
    </select>
  );

  if (embedded) {
    return select;
  }

  return (
    <div className="ui-card space-y-3 px-4 py-3">
      <FormField label="Modo de fonte (auditoria)" htmlFor={id}>
        {select}
      </FormField>
      <p className="text-sm text-muted-foreground">
        {draft === "auto"
          ? "Padrão: usa o snapshot Compilado mais recente disponível (Manual ou Jira Cloud materializado), sem misturar lotes."
          : draft === "manuais"
            ? "Auditoria: força apenas importações de planilha."
            : "Auditoria: força apenas lotes Compilado materializados da sync Jira (imports.source = jira)."}
      </p>
    </div>
  );
}
