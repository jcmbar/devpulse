import Link from "next/link";
import { adminListHref } from "@/lib/admin-list-query";
import { ChevronLeft, ChevronRight } from "lucide-react";

type ListPaginationProps = {
  pathname: string;
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  teamId?: string | null;
  q?: string | null;
};

export function ListPagination({
  pathname,
  page,
  totalPages,
  total,
  pageSize,
  teamId,
  q,
}: ListPaginationProps) {
  if (total === 0) {
    return null;
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const prevHref =
    page > 1
      ? adminListHref(pathname, { teamId, q, page: page - 1 })
      : null;
  const nextHref =
    page < totalPages
      ? adminListHref(pathname, { teamId, q, page: page + 1 })
      : null;

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-border/60 bg-card/60 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
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
          {prevHref ? (
            <Link href={prevHref} className="ui-btn-secondary">
              <ChevronLeft className="size-3.5" strokeWidth={2} />
              Anterior
            </Link>
          ) : (
            <span className="ui-btn-secondary opacity-45">
              <ChevronLeft className="size-3.5" strokeWidth={2} />
              Anterior
            </span>
          )}
          {nextHref ? (
            <Link href={nextHref} className="ui-btn-secondary">
              Próxima
              <ChevronRight className="size-3.5" strokeWidth={2} />
            </Link>
          ) : (
            <span className="ui-btn-secondary opacity-45">
              Próxima
              <ChevronRight className="size-3.5" strokeWidth={2} />
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
