"use client";

import type { Team } from "@/types/team";

type TeamSelectProps = {
  id?: string;
  name?: string;
  teams: Team[];
  defaultValue?: string | null;
  required?: boolean;
  includeEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
  /** When true, only active teams (still shows current inactive if selected). */
  activeOnly?: boolean;
  /**
   * `id` → persist team_id (default).
   * `code` → persist teams.code (e.g. holidays.region_code for scope=team).
   */
  valueMode?: "id" | "code";
  /** Extra options after the empty option (e.g. unassigned filter). */
  extraOptions?: Array<{ value: string; label: string }>;
};

export function TeamSelect({
  id = "teamId",
  name = "teamId",
  teams,
  defaultValue = "",
  required = false,
  includeEmpty = true,
  emptyLabel = "Sem time",
  className = "ui-select",
  activeOnly = false,
  valueMode = "id",
  extraOptions = [],
}: TeamSelectProps) {
  const current = defaultValue ?? "";
  const options = teams.filter((team) => {
    if (!activeOnly) {
      return true;
    }
    const optionValue = valueMode === "code" ? team.code : team.id;
    return team.is_active || optionValue === current;
  });

  return (
    <select
      id={id}
      name={name}
      required={required}
      defaultValue={current}
      className={className}
    >
      {includeEmpty ? (
        <option value="">{emptyLabel}</option>
      ) : (
        <option value="" disabled>
          {emptyLabel}
        </option>
      )}
      {extraOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {options.map((team) => {
        const value = valueMode === "code" ? team.code : team.id;
        return (
          <option key={team.id} value={value}>
            {team.name} ({team.jira_key_prefix})
            {!team.is_active ? " · inativo" : ""}
          </option>
        );
      })}
    </select>
  );
}
