"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

type ClientListPaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

export function ClientListPagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: ClientListPaginationProps) {
  if (total === 0) {
    return null;
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-[var(--radius)] border border-border/60 bg-card/60 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">
          {from}–{to}
        </span>{" "}
        de <span className="tabular-nums">{total}</span>
        {totalPages > 1 ? (
          <>
            {" "}
            · página{" "}
            <span className="font-medium text-foreground tabular-nums">
              {page}
            </span>{" "}
            de <span className="tabular-nums">{totalPages}</span>
          </>
        ) : null}
      </p>
      {totalPages > 1 ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="ui-btn-secondary"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="size-3.5" strokeWidth={2} />
            Anterior
          </button>
          <button
            type="button"
            className="ui-btn-secondary"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Próxima
            <ChevronRight className="size-3.5" strokeWidth={2} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Client-side slice helper for growing in-panel lists. */
export function useClientPagedItems<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const slice = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, pageSize, safePage],
  );

  return {
    page: safePage,
    setPage,
    totalPages,
    total,
    pageSize,
    items: slice,
  };
}
