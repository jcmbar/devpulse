"use client";

import { persistFiltersFromHref } from "@/lib/filters/persist-client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Team } from "@/types/team";

type JiraTeamContextSelectProps = {
  teams: Team[];
  value: string;
};

/**
 * Changes the server-rendered Jira context. This is intentionally not just a
 * form field: selecting a team reloads its integration and all operations.
 */
export function JiraTeamContextSelect({
  teams,
  value,
}: JiraTeamContextSelectProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      id="jira-team-context"
      value={value}
      disabled={pending}
      className="ui-select min-w-56"
      aria-label="Time em contexto"
      onChange={(event) => {
        const teamId = event.target.value;
        const href = `/app/jira?teamId=${encodeURIComponent(teamId)}`;
        persistFiltersFromHref("jira-admin", href);
        startTransition(() => {
          router.push(href);
        });
      }}
    >
      {teams.map((team) => (
        <option key={team.id} value={team.id}>
          {team.name} ({team.jira_key_prefix})
          {!team.is_active ? " · inativo" : ""}
        </option>
      ))}
    </select>
  );
}
