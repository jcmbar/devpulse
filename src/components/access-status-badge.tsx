import type { DeveloperAccessKind } from "@/services/auth/developer-access";

const BADGE_STYLES: Record<DeveloperAccessKind, string> = {
  no_access: "border-border/70 bg-muted/70 text-muted-foreground",
  invite_pending:
    "border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  active:
    "border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
};

type AccessStatusBadgeProps = {
  kind: DeveloperAccessKind;
  label: string;
  title?: string;
};

export function AccessStatusBadge({
  kind,
  label,
  title,
}: AccessStatusBadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${BADGE_STYLES[kind]}`}
    >
      {label}
    </span>
  );
}
