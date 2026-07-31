"use client";

import {
  type ActiveListFilter,
  type JiraAccountListFilter,
  patchAdminListSearchParams,
} from "@/lib/admin-list-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type ChipOption<T extends string> = {
  value: T;
  label: string;
};

const ACTIVE_OPTIONS: ChipOption<ActiveListFilter>[] = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
];

const JIRA_OPTIONS: ChipOption<JiraAccountListFilter>[] = [
  { value: "all", label: "Todos" },
  { value: "with", label: "Com ID" },
  { value: "without", label: "Sem ID" },
];

type DeveloperListColumnFiltersProps = {
  activeFilter: ActiveListFilter;
  jiraAccountFilter: JiraAccountListFilter;
};

function FilterChipGroup<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: ChipOption<T>[];
  disabled?: boolean;
  onChange: (next: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="ui-label">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={
                selected
                  ? "ui-btn-primary px-2.5 py-1 text-xs"
                  : "ui-btn-secondary px-2.5 py-1 text-xs"
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DeveloperListColumnFilters({
  activeFilter,
  jiraAccountFilter,
}: DeveloperListColumnFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function navigate(
    patch: {
      active?: ActiveListFilter;
      jiraId?: JiraAccountListFilter;
    },
  ) {
    const params = patchAdminListSearchParams(searchParams, {
      ...patch,
      resetPage: true,
    });
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-5">
      <FilterChipGroup
        label="Cadastro"
        value={activeFilter}
        options={ACTIVE_OPTIONS}
        disabled={pending}
        onChange={(active) => navigate({ active })}
      />
      <FilterChipGroup
        label="Jira Account ID"
        value={jiraAccountFilter}
        options={JIRA_OPTIONS}
        disabled={pending}
        onChange={(jiraId) => navigate({ jiraId })}
      />
    </div>
  );
}
