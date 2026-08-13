"use client";

import {
  type ActiveListFilter,
  type JiraAccountListFilter,
  type JobTitleListFilter,
  patchAdminListSearchParams,
} from "@/lib/admin-list-query";
import { persistFiltersFromHref } from "@/lib/filters/persist-client";
import { cn } from "@/lib/utils";
import {
  DEVELOPER_JOB_TITLE_LABELS,
  DEVELOPER_JOB_TITLES,
} from "@/types/developer-compensation";
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

const JOB_TITLE_OPTIONS: ChipOption<JobTitleListFilter>[] = [
  { value: "all", label: "Todos" },
  ...DEVELOPER_JOB_TITLES.map((title) => ({
    value: title,
    label: DEVELOPER_JOB_TITLE_LABELS[title],
  })),
];

type DeveloperListColumnFiltersProps = {
  activeFilter: ActiveListFilter;
  jiraAccountFilter: JiraAccountListFilter;
  jobTitleFilter: JobTitleListFilter;
  /** Compact inline layout for FilterBar. */
  embedded?: boolean;
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
      <p className="ui-filter-bar__label">{label}</p>
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
  jobTitleFilter,
  embedded = false,
}: DeveloperListColumnFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function navigate(
    patch: {
      active?: ActiveListFilter;
      jiraId?: JiraAccountListFilter;
      jobTitle?: JobTitleListFilter;
    },
  ) {
    const params = patchAdminListSearchParams(searchParams, {
      ...patch,
      resetPage: true,
    });
    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    persistFiltersFromHref("admin-developers", href);
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <div
      className={cn(
        "flex flex-wrap gap-4 sm:gap-6",
        embedded ? "items-start" : "items-end gap-5",
      )}
    >
      <FilterChipGroup
        label="Cargo"
        value={jobTitleFilter}
        options={JOB_TITLE_OPTIONS}
        disabled={pending}
        onChange={(jobTitle) => navigate({ jobTitle })}
      />
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
