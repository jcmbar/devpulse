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
import { useEffect, useState, useTransition } from "react";

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
  const [draftActive, setDraftActive] = useState(activeFilter);
  const [draftJira, setDraftJira] = useState(jiraAccountFilter);
  const [draftJobTitle, setDraftJobTitle] = useState(jobTitleFilter);

  useEffect(() => {
    setDraftActive(activeFilter);
    setDraftJira(jiraAccountFilter);
    setDraftJobTitle(jobTitleFilter);
  }, [activeFilter, jiraAccountFilter, jobTitleFilter]);

  const dirty =
    draftActive !== activeFilter ||
    draftJira !== jiraAccountFilter ||
    draftJobTitle !== jobTitleFilter;

  function apply() {
    const params = patchAdminListSearchParams(searchParams, {
      active: draftActive,
      jiraId: draftJira,
      jobTitle: draftJobTitle,
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
        value={draftJobTitle}
        options={JOB_TITLE_OPTIONS}
        disabled={pending}
        onChange={setDraftJobTitle}
      />
      <FilterChipGroup
        label="Status"
        value={draftActive}
        options={ACTIVE_OPTIONS}
        disabled={pending}
        onChange={setDraftActive}
      />
      <FilterChipGroup
        label="Jira Account ID"
        value={draftJira}
        options={JIRA_OPTIONS}
        disabled={pending}
        onChange={setDraftJira}
      />
      <div className="flex items-end">
        <button
          type="button"
          className="ui-btn-primary px-3 py-1.5 text-xs"
          disabled={pending || !dirty}
          onClick={apply}
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}
