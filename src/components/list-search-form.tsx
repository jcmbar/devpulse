"use client";

import {
  SEARCH_PARAM,
  patchAdminListSearchParams,
} from "@/lib/admin-list-query";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type ListSearchFormProps = {
  defaultQuery?: string;
  placeholder?: string;
  className?: string;
};

export function ListSearchForm({
  defaultQuery = "",
  placeholder = "Buscar…",
  className = "flex flex-wrap items-end gap-3",
}: ListSearchFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const current = defaultQuery;

  function applySearch(nextQ: string) {
    const params = patchAdminListSearchParams(searchParams, {
      q: nextQ,
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
        applySearch(String(formData.get(SEARCH_PARAM) ?? ""));
      }}
    >
      <label className="ui-field">
        <span className="ui-label">Busca</span>
        <div className="relative min-w-56">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.9}
          />
          <input
            key={current || "empty"}
            id={SEARCH_PARAM}
            name={SEARCH_PARAM}
            type="search"
            defaultValue={current}
            placeholder={placeholder}
            maxLength={120}
            className="ui-input pl-9"
          />
        </div>
      </label>
      <button type="submit" disabled={pending} className="ui-btn-secondary">
        {pending ? "Buscando..." : "Buscar"}
      </button>
      {current ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => applySearch("")}
          className="ui-btn-ghost"
        >
          <X className="size-3.5" strokeWidth={1.9} />
          Limpar
        </button>
      ) : null}
    </form>
  );
}
