"use client";

import { persistFiltersFromHref } from "@/lib/filters/persist-client";
import type { FilterScope } from "@/lib/filters/persist";
import { TEAM_FILTER_PARAM } from "@/lib/teams/team-filter";
import type { Team } from "@/types/team";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type GestorTeamFilterProps = {
  basePath: string;
  teams: Team[];
  /** Selected team id, or empty for “Exibir todos”. */
  selectedTeamId: string | null;
  preservedParams?: Record<string, string | undefined>;
  /** Compact control for FilterBar. */
  embedded?: boolean;
  persistScope?: FilterScope;
  /**
   * When true, changing the select navigates immediately.
   * Default false — change locally and apply via a parent form / Aplicar.
   */
  applyOnChange?: boolean;
  /** Associate with a parent `<form id=…>` for native submit. */
  form?: string;
  id?: string;
};

function buildHref(
  basePath: string,
  teamId: string | null,
  preservedParams?: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  if (teamId) {
    params.set(TEAM_FILTER_PARAM, teamId);
  }
  for (const [key, value] of Object.entries(preservedParams ?? {})) {
    if (value && key !== TEAM_FILTER_PARAM) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function GestorTeamFilter({
  basePath,
  teams,
  selectedTeamId,
  preservedParams,
  embedded = false,
  persistScope,
  applyOnChange = false,
  form,
  id = "gestor-team",
}: GestorTeamFilterProps) {
  const router = useRouter();
  const serverValue = selectedTeamId ?? "";
  const [draft, setDraft] = useState(serverValue);

  useEffect(() => {
    setDraft(serverValue);
  }, [serverValue]);

  const select = (
    <select
      id={id}
      name={TEAM_FILTER_PARAM}
      form={form}
      value={draft}
      onChange={(event) => {
        const next = event.target.value.trim() || null;
        setDraft(next ?? "");
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
      aria-label="Time"
    >
      <option value="">Exibir todos</option>
      {teams.map((team) => (
        <option key={team.id} value={team.id}>
          {team.name}
          {team.jira_key_prefix ? ` (${team.jira_key_prefix})` : ""}
          {!team.is_active ? " · inativo" : ""}
        </option>
      ))}
    </select>
  );

  if (embedded) {
    return select;
  }

  return (
    <div className="ui-card space-y-3 px-4 py-3">
      <label className="ui-field" htmlFor={id}>
        <span className="ui-label">Time</span>
        {select}
      </label>
    </div>
  );
}
