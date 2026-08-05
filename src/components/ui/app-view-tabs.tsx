import Link from "next/link";
import { cn } from "@/lib/utils";

export type AppViewTab = {
  href: string;
  label: string;
  active: boolean;
};

export function AppViewTabs({ tabs }: { tabs: AppViewTab[] }) {
  return (
    <nav
      className="flex w-fit max-w-full flex-wrap gap-1 rounded-[var(--radius-sm)] border border-border bg-card/70 p-1 shadow-[var(--shadow-sm)]"
      aria-label="Seções"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "rounded-[calc(var(--radius-sm)-2px)] px-3 py-2 text-sm font-medium transition-[background-color,color,box-shadow] duration-150",
            tab.active
              ? "bg-brand text-brand-on shadow-[var(--shadow-sm)]"
              : "text-muted-foreground hover:bg-brand-soft hover:text-brand-foreground",
          )}
          aria-current={tab.active ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
