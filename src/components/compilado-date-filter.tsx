"use client";

import { FormField, FormSectionHeader } from "@/components/ui/form";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  formatDateRangeLabel,
  formatYearMonthLabel,
  type CompiladoDateRange,
} from "@/lib/metrics/date-range";

type CompiladoDateFilterProps = {
  basePath: string;
  importId: string | null;
  activeRange: CompiladoDateRange;
  monthOptions: string[];
  /** Extra query params to keep (e.g. source). */
  preservedParams?: Record<string, string | undefined>;
  /** When true, drop outer card chrome (parent already provides FilterBar). */
  embedded?: boolean;
};

export function CompiladoDateFilter({
  basePath,
  importId,
  activeRange,
  monthOptions,
  preservedParams,
  embedded = false,
}: CompiladoDateFilterProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"month" | "custom">(activeRange.mode);
  const [month, setMonth] = useState(
    activeRange.month ?? monthOptions[monthOptions.length - 1] ?? "",
  );
  const [from, setFrom] = useState(activeRange.start);
  const [to, setTo] = useState(activeRange.end);

  function navigate(next: URLSearchParams) {
    if (importId) {
      next.set("importId", importId);
    }
    for (const [key, value] of Object.entries(preservedParams ?? {})) {
      if (value && !next.has(key)) {
        next.set(key, value);
      }
    }
    const query = next.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  function applyMonth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!month) {
      return;
    }
    const params = new URLSearchParams();
    params.set("month", month);
    navigate(params);
  }

  function applyCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!from || !to || to < from) {
      return;
    }
    const params = new URLSearchParams();
    params.set("from", from);
    params.set("to", to);
    navigate(params);
  }

  const modeToggle = (
    <div className="ui-mode-toggle" role="group" aria-label="Modo do filtro">
      <button
        type="button"
        onClick={() => setMode("month")}
        className={`ui-mode-toggle__btn ${mode === "month" ? "is-active" : ""}`}
        aria-pressed={mode === "month"}
      >
        Mês / ano
      </button>
      <button
        type="button"
        onClick={() => setMode("custom")}
        className={`ui-mode-toggle__btn ${mode === "custom" ? "is-active" : ""}`}
        aria-pressed={mode === "custom"}
      >
        Intervalo
      </button>
    </div>
  );

  const forms =
    mode === "month" ? (
      <form
        onSubmit={applyMonth}
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3"
      >
        <FormField label="Mês" htmlFor="month" className="min-w-0 flex-1 sm:max-w-xs">
          <select
            id="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="ui-select w-full min-w-0"
          >
            {monthOptions.length === 0 ? (
              <option value="">Sem meses disponíveis</option>
            ) : (
              monthOptions.map((option) => (
                <option key={option} value={option}>
                  {formatYearMonthLabel(option)}
                </option>
              ))
            )}
          </select>
        </FormField>
        <button
          type="submit"
          disabled={!month}
          className="ui-btn-primary w-full sm:w-auto"
        >
          Aplicar
        </button>
      </form>
    ) : (
      <form
        onSubmit={applyCustom}
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <FormField label="Data inicial" htmlFor="from" className="min-w-0">
          <input
            id="from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            required
            className="ui-input"
          />
        </FormField>
        <FormField label="Data final" htmlFor="to" className="min-w-0">
          <input
            id="to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            required
            className="ui-input"
          />
        </FormField>
        <button type="submit" className="ui-btn-primary w-full sm:w-auto">
          Aplicar
        </button>
      </form>
    );

  if (embedded) {
    return (
      <div className="min-w-0 space-y-3">
        <div className="space-y-1">
          <p className="ui-filter-bar__label">Período</p>
          <p className="text-xs text-muted-foreground">
            Ativo:{" "}
            <span className="font-medium text-foreground">
              {formatDateRangeLabel(activeRange)}
            </span>
            {" · "}
            Entrega TU
          </p>
        </div>
        {modeToggle}
        {forms}
      </div>
    );
  }

  return (
    <div className="ui-card space-y-5 px-4 py-3">
      <FormSectionHeader
        title="Filtro de período"
        description={
          <>
            Ativo:{" "}
            <span className="font-medium">
              {formatDateRangeLabel(activeRange)}
            </span>
            {" · "}
            baseado em Entrega p/ Teste Unitário
          </>
        }
      />
      {modeToggle}
      {forms}
    </div>
  );
}
