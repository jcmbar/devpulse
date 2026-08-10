import { PageShell } from "@/components/page-shell";

function SkeletonBar({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[var(--radius-sm)] bg-muted/80 ${className ?? ""}`}
    />
  );
}

/**
 * Immediate navigation feedback for `/app/**` route transitions.
 * Keeps AppChrome visible (layout); only the page slot shows this.
 */
export function AppRouteLoading({
  label = "Carregando…",
}: {
  label?: string;
}) {
  return (
    <PageShell size="full">
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="space-y-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <SkeletonBar className="h-3 w-24" />
            <SkeletonBar className="h-7 w-52 sm:w-72" />
            <SkeletonBar className="h-3 w-64 max-w-full sm:w-96" />
          </div>
          <div className="flex items-center gap-2 rounded-full border border-brand/25 bg-brand-soft/60 px-3 py-1.5 text-xs font-medium text-brand-foreground">
            <span
              className="size-1.5 shrink-0 animate-pulse rounded-full bg-brand"
              aria-hidden
            />
            {label}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <SkeletonBar className="h-9 w-28" />
          <SkeletonBar className="h-9 w-24" />
          <SkeletonBar className="h-9 w-32" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="ui-dashboard-panel space-y-3 p-4"
            >
              <SkeletonBar className="h-3 w-20" />
              <SkeletonBar className="h-8 w-28" />
              <SkeletonBar className="h-3 w-36" />
            </div>
          ))}
        </div>

        <div className="ui-dashboard-panel space-y-3 p-4">
          <SkeletonBar className="h-4 w-40" />
          <SkeletonBar className="h-3 w-full" />
          <SkeletonBar className="h-3 w-[92%]" />
          <SkeletonBar className="h-3 w-[78%]" />
          <SkeletonBar className="mt-4 h-40 w-full" />
        </div>

        <span className="sr-only">{label}</span>
      </div>
    </PageShell>
  );
}
