"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/lib/auth/actions";
import { canManageTeam } from "@/lib/auth/roles";
import { getRoleLabel } from "@/lib/auth/role-labels";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/profile";
import {
  Activity,
  FolderKanban,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Upload,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType, type ReactNode, type SVGProps } from "react";

type AppChromeProps = {
  profile: Profile;
  children: ReactNode;
};

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  match?: (pathname: string) => boolean;
};

function isActive(pathname: string, item: NavItem): boolean {
  if (item.match) {
    return item.match(pathname);
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AppChrome({ profile, children }: AppChromeProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const team = canManageTeam(profile.role);

  const items: NavItem[] = [
    {
      href: "/app",
      label: "Início",
      icon: Home,
      match: (path) => path === "/app",
    },
    ...(team
      ? [
          {
            href: "/app/gestor",
            label: "Gestor",
            icon: LayoutDashboard,
            match: (path: string) => path.startsWith("/app/gestor"),
          },
          {
            href: "/app/developers",
            label: "Developers",
            icon: Users,
            match: (path: string) => path.startsWith("/app/developers"),
          },
          {
            href: "/app/imports",
            label: "Imports",
            icon: Upload,
            match: (path: string) => path.startsWith("/app/imports"),
          },
          {
            href: "/app/teams",
            label: "Times",
            icon: FolderKanban,
            match: (path: string) => path.startsWith("/app/teams"),
          },
        ]
      : []),
  ];

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-header shadow-[var(--shadow-sm)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link
            href="/app"
            className="group flex shrink-0 items-center gap-2.5 rounded-[var(--radius-sm)] pr-1 transition-opacity hover:opacity-90"
          >
            <span className="inline-flex size-8 items-center justify-center rounded-[0.6rem] bg-brand text-brand-on shadow-[var(--shadow-glow)]">
              <Activity className="size-4" strokeWidth={2.25} />
            </span>
            <span className="text-sm font-semibold tracking-tight">
              DevPulse
            </span>
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center gap-1 md:flex">
            {items.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-150",
                    active
                      ? "bg-brand-soft text-brand-foreground shadow-[var(--shadow-sm)]"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5 opacity-80" strokeWidth={1.9} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 lg:flex">
              <span className="max-w-[160px] truncate text-xs font-medium text-foreground">
                {profile.full_name ?? profile.email}
              </span>
              <span className="ui-badge">{getRoleLabel(profile.role)}</span>
            </div>
            <ThemeToggle />
            <form action={signOut} className="hidden sm:block">
              <button type="submit" className="ui-btn-secondary">
                <LogOut className="size-3.5" strokeWidth={1.9} />
                Sair
              </button>
            </form>
            <button
              type="button"
              className="ui-btn-secondary md:hidden"
              aria-expanded={open}
              aria-label={open ? "Fechar menu" : "Abrir menu"}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>

        {open ? (
          <div className="border-t border-border/70 px-4 py-3 md:hidden">
            <nav className="flex flex-col gap-1">
              {items.map((item) => {
                const active = isActive(pathname, item);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "inline-flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-brand-soft text-brand-foreground"
                        : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 opacity-80" strokeWidth={1.9} />
                    {item.label}
                  </Link>
                );
              })}
              <form action={signOut} className="pt-2">
                <button type="submit" className="ui-btn-secondary w-full">
                  <LogOut className="size-3.5" strokeWidth={1.9} />
                  Sair
                </button>
              </form>
            </nav>
          </div>
        ) : null}
      </header>

      <div className="relative z-0 flex flex-1 flex-col">{children}</div>
    </div>
  );
}
