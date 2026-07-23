"use client";

import { TeamSelect } from "@/components/team-select";
import { patchAdminListSearchParams } from "@/lib/admin-list-query";
import {
  TEAM_FILTER_PARAM,
  TEAM_FILTER_UNASSIGNED,
} from "@/lib/teams/team-filter";
import type { Team } from "@/types/team";
import { Filter } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type TeamFilterFormProps = {
  teams: Team[];
  defaultTeamId?: string | null;
  includeUnassigned?: boolean;
  className?: string;
};

export function TeamFilterForm({
  teams,
  defaultTeamId = "",
  includeUnassigned = true,
  className = "flex flex-wrap items-end gap-3",
}: TeamFilterFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const current = defaultTeamId ?? "";

  function applyTeamFilter(nextTeamId: string) {
    const params = patchAdminListSearchParams(searchParams, {
      teamId: nextTeamId,
      resetPage: true,
    });
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        applyTeamFilter(String(formData.get(TEAM_FILTER_PARAM) ?? "").trim());
      }}
    >
      <label className="ui-field">
        <span className="ui-label">Time</span>
        <TeamSelect
          key={current || "all"}
          id={TEAM_FILTER_PARAM}
          name={TEAM_FILTER_PARAM}
          teams={teams}
          defaultValue={current}
          includeEmpty
          emptyLabel="Todos os times"
          extraOptions={
            includeUnassigned
              ? [
                  {
                    value: TEAM_FILTER_UNASSIGNED,
                    label: "Sem time (legado)",
                  },
                ]
              : []
          }
          className="ui-select min-w-56"
        />
      </label>
      <button type="submit" disabled={pending} className="ui-btn-secondary">
        <Filter className="size-3.5" strokeWidth={1.9} />
        {pending ? "Filtrando..." : "Filtrar"}
      </button>
    </form>
  );
}
