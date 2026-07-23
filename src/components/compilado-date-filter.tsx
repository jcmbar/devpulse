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
};

export function CompiladoDateFilter({
  basePath,
  importId,
  activeRange,
  monthOptions,
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

  return (
    <div className="ui-card space-y-5 px-4 py-3">
      <FormSectionHeader
        title="Filtro de período (Compilado)"
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("month")}
          className={
            mode === "month" ? "ui-btn-primary" : "ui-btn-secondary"
          }
        >
          Mês / ano
        </button>
        <button
          type="button"
          onClick={() => setMode("custom")}
          className={
            mode === "custom" ? "ui-btn-primary" : "ui-btn-secondary"
          }
        >
          Intervalo customizado
        </button>
      </div>

      {mode === "month" ? (
        <form onSubmit={applyMonth} className="flex flex-wrap items-end gap-4">
          <FormField label="Mês" htmlFor="month">
            <select
              id="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="ui-select min-w-[12rem]"
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
            className="ui-btn-primary"
          >
            Aplicar mês
          </button>
        </form>
      ) : (
        <form onSubmit={applyCustom} className="flex flex-wrap items-end gap-4">
          <FormField label="Data inicial" htmlFor="from">
            <input
              id="from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              required
              className="ui-input"
            />
          </FormField>
          <FormField label="Data final" htmlFor="to">
            <input
              id="to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              required
              className="ui-input"
            />
          </FormField>
          <button type="submit" className="ui-btn-primary">
            Aplicar intervalo
          </button>
        </form>
      )}
    </div>
  );
}
