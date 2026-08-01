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
      className="flex flex-wrap gap-1 border-b border-border pb-px"
      aria-label="Seções"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "rounded-t-[var(--radius-sm)] px-3 py-2 text-sm font-medium transition-colors",
            tab.active
              ? "border-b-2 border-brand text-foreground"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
          aria-current={tab.active ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
