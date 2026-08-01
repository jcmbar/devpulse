"use client";

import { persistFiltersFromHref } from "@/lib/filters/persist-client";
import { FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

type IntegrationOption = {
  id: string;
  name: string;
  team_id: string;
};

type TeamOption = {
  id: string;
  name: string;
};

type DashboardFiltersProps = {
  integrations: IntegrationOption[];
  teams: TeamOption[];
  issueTypes: string[];
  values: {
    integrationId: string;
    teamId: string;
    from: string;
    to: string;
    statusGroup: string;
    issueType: string;
    bucket: "day" | "week";
  };
};

const STATUS_GROUPS = [
  { value: "all", label: "Todos os grupos" },
  { value: "analysis", label: "analysis" },
  { value: "development", label: "development" },
  { value: "validation", label: "validation" },
  { value: "done", label: "done" },
  { value: "other", label: "other" },
] as const;

/**
 * GET-style filters with persistence of last-used durable params.
 */
export function DashboardFilters({
  integrations,
  teams,
  issueTypes,
  values,
}: DashboardFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      const trimmed = String(value).trim();
      if (trimmed) {
        params.set(key, trimmed);
      }
    }
    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    persistFiltersFromHref("jira-analytics", href);
    router.push(href);
  }

  return (
    <section className="ui-card space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="ui-form-section-title">Filtros</h2>
        <p className="ui-hint m-0">
          Período → throughput / lead / reopen. Aging e WIP usam snapshot atual.
        </p>
      </div>
      <form className="flex flex-wrap items-end gap-3" onSubmit={onSubmit}>
        <label className="ui-field">
          <span className="ui-label">Integração</span>
          <select
            name="integrationId"
            defaultValue={values.integrationId}
            className="ui-select min-w-56"
          >
            {integrations.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        {teams.length > 0 ? (
          <label className="ui-field">
            <span className="ui-label">Time</span>
            <select
              name="teamId"
              defaultValue={values.teamId}
              className="ui-select min-w-44"
            >
              <option value="">(da integração)</option>
              {teams.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="ui-field">
          <span className="ui-label">De</span>
          <input
            type="date"
            name="from"
            defaultValue={values.from}
            className="ui-input"
          />
        </label>
        <label className="ui-field">
          <span className="ui-label">Até</span>
          <input
            type="date"
            name="to"
            defaultValue={values.to}
            className="ui-input"
          />
        </label>
        <label className="ui-field">
          <span className="ui-label">Grupo de status</span>
          <select
            name="statusGroup"
            defaultValue={values.statusGroup}
            className="ui-select min-w-40"
          >
            {STATUS_GROUPS.map((row) => (
              <option key={row.value} value={row.value}>
                {row.label}
              </option>
            ))}
          </select>
        </label>
        <label className="ui-field">
          <span className="ui-label">Tipo de issue</span>
          <select
            name="issueType"
            defaultValue={values.issueType}
            className="ui-select min-w-40"
          >
            <option value="all">Todos</option>
            {issueTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="ui-field">
          <span className="ui-label">Throughput</span>
          <select
            name="bucket"
            defaultValue={values.bucket}
            className="ui-select min-w-28"
          >
            <option value="day">Por dia</option>
            <option value="week">Por semana</option>
          </select>
        </label>
        <button type="submit" className="ui-btn-secondary">
          Aplicar
        </button>
      </form>
    </section>
  );
}
