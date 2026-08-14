"use client";

import { AppShellMesh } from "@/components/app-shell-mesh";
import { SessionActivityGuard } from "@/components/session-activity-guard";
import { BrandMark } from "@/components/brand-mark";
import { PersonAvatar } from "@/components/person-avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/lib/auth/actions";
import { canManageTeam } from "@/lib/auth/roles";
import { getRoleLabel } from "@/lib/auth/role-labels";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/profile";
import {
  Building2,
  Cable,
  CalendarCheck2,
  CalendarDays,
  ChevronDown,
  FolderKanban,
  Home,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";

type AppChromeProps = {
  profile: Profile;
  /** Public avatar URL of the linked developer, when available. */
  avatarUrl?: string | null;
  idleMinutes?: number | null;
  children: ReactNode;
};

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Cor do ícone (mantém contraste no item ativo e no hover). */
  iconClass: string;
  match?: (pathname: string) => boolean;
};

function isActive(pathname: string, item: NavItem): boolean {
  if (item.match) {
    return item.match(pathname);
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({
  item,
  pathname,
  onClick,
  className,
}: {
  item: NavItem;
  pathname: string;
  onClick?: () => void;
  className?: string;
}) {
  const active = isActive(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      prefetch
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-150 xl:gap-2 xl:px-2.5",
        active
          ? "bg-brand-soft text-brand-foreground shadow-[var(--shadow-sm)]"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        className,
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", item.iconClass)} strokeWidth={1.9} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function AppChrome({
  profile,
  avatarUrl = null,
  idleMinutes = null,
  children,
}: AppChromeProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreMenuId = useId();
  const team = canManageTeam(profile.role);

  const contaItem: NavItem = {
    href: "/app/conta",
    label: "Conta",
    icon: UserRound,
    iconClass: "text-rose-600 dark:text-rose-400",
    match: (path) => path.startsWith("/app/conta"),
  };

  const primary: NavItem[] = [
    {
      href: "/app",
      label: "Início",
      icon: Home,
      iconClass: "text-sky-600 dark:text-sky-400",
      match: (path) => path === "/app",
    },
    ...(team
      ? [
          {
            href: "/app/gestor",
            label: "Gestor",
            icon: LayoutDashboard,
            iconClass: "text-teal-600 dark:text-teal-400",
            match: (path: string) =>
              path.startsWith("/app/gestor") &&
              !path.startsWith("/app/gestor/config/emails") &&
              !path.startsWith("/app/gestor/folha/empresas") &&
              path !== "/app/gestor/config" &&
              !path.startsWith("/app/gestor/config?") &&
              path !== "/app/gestor/config/capacidade" &&
              !path.startsWith("/app/gestor/config/capacidade?"),
          },
          {
            href: "/app/developers",
            label: "Pessoas",
            icon: Users,
            iconClass: "text-amber-600 dark:text-amber-400",
            match: (path: string) => path.startsWith("/app/developers"),
          },
          {
            href: "/app/jira",
            label: "Jira",
            icon: Cable,
            iconClass: "text-indigo-600 dark:text-indigo-400",
            match: (path: string) => path.startsWith("/app/jira"),
          },
          {
            href: "/app/stg",
            label: "STG",
            icon: CalendarCheck2,
            iconClass: "text-violet-600 dark:text-violet-400",
            match: (path: string) => path.startsWith("/app/stg"),
          },
        ]
      : [contaItem]),
  ];

  const more: NavItem[] = team
    ? [
        {
          href: "/app/gestor/config/emails",
          label: "E-mails",
          icon: Mail,
          iconClass: "text-orange-600 dark:text-orange-400",
          match: (path: string) => path.startsWith("/app/gestor/config/emails"),
        },
        {
          href: "/app/gestor/folha/empresas",
          label: "Empresas",
          icon: Building2,
          iconClass: "text-lime-600 dark:text-lime-400",
          match: (path: string) =>
            path.startsWith("/app/gestor/folha/empresas"),
        },
        {
          href: "/app/gestor/config#feriados",
          label: "Feriados",
          icon: CalendarDays,
          iconClass: "text-yellow-600 dark:text-yellow-400",
          match: (path: string) =>
            path === "/app/gestor/config" ||
            path.startsWith("/app/gestor/config?"),
        },
        {
          href: "/app/imports",
          label: "Imports",
          icon: Upload,
          iconClass: "text-cyan-600 dark:text-cyan-400",
          match: (path: string) => path.startsWith("/app/imports"),
        },
        {
          href: "/app/teams",
          label: "Times",
          icon: FolderKanban,
          iconClass: "text-emerald-600 dark:text-emerald-400",
          match: (path: string) => path.startsWith("/app/teams"),
        },
        contaItem,
      ]
    : [];

  const drawerItems = [...primary, ...more];
  const moreActive = more.some((item) => isActive(pathname, item));

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (
        moreRef.current &&
        !moreRef.current.contains(event.target as Node)
      ) {
        setMoreOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <SessionActivityGuard idleMinutes={idleMinutes} />
      <div className="app-shell-backdrop" aria-hidden>
        <AppShellMesh />
      </div>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-header shadow-[var(--shadow-sm)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3 lg:px-8">
          <Link
            href="/app"
            className="group flex min-w-0 shrink-0 items-center gap-2 rounded-[var(--radius-sm)] pr-1 transition-opacity hover:opacity-90 sm:gap-2.5"
          >
            <BrandMark size={32} className="size-8" />
            <span className="truncate text-sm font-semibold tracking-tight">
              DevPulse
            </span>
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-visible lg:flex">
            {primary.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
            {more.length > 0 ? (
              <div ref={moreRef} className="relative z-50 shrink-0">
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-150 xl:gap-1.5 xl:px-2.5",
                    moreActive || moreOpen
                      ? "bg-brand-soft text-brand-foreground shadow-[var(--shadow-sm)]"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                  aria-expanded={moreOpen}
                  aria-controls={moreMenuId}
                  aria-haspopup="menu"
                  onClick={() => setMoreOpen((value) => !value)}
                >
                  Mais
                  <ChevronDown
                    className={cn(
                      "size-3.5 shrink-0 transition-transform duration-150",
                      moreOpen ? "rotate-180" : "rotate-0",
                    )}
                    strokeWidth={1.9}
                  />
                </button>
                {moreOpen ? (
                  <div
                    id={moreMenuId}
                    role="menu"
                    className="absolute right-0 top-[calc(100%+0.4rem)] z-50 min-w-[12.5rem] rounded-[var(--radius)] border border-border/70 bg-header/95 p-1 shadow-[var(--shadow-sm)] backdrop-blur-xl"
                  >
                    {more.map((item) => {
                      const active = isActive(pathname, item);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          prefetch
                          role="menuitem"
                          onClick={() => setMoreOpen(false)}
                          className={cn(
                            "flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-sm font-medium transition-colors",
                            active
                              ? "bg-brand-soft text-brand-foreground"
                              : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                          )}
                        >
                          <Icon
                            className={cn("size-3.5 shrink-0", item.iconClass)}
                            strokeWidth={1.9}
                          />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </nav>

          <div className="relative z-10 ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link
              href="/app/conta"
              className="hidden items-center gap-2 rounded-full border border-border/70 bg-card/70 px-2.5 py-1.5 transition-colors hover:bg-muted/60 xl:flex"
              title="Abrir minha conta"
            >
              <PersonAvatar
                name={profile.full_name ?? profile.email}
                src={avatarUrl}
                size="sm"
              />
              <span className="max-w-[160px] truncate text-xs font-medium text-foreground">
                {profile.full_name ?? profile.email}
              </span>
              <span className="ui-badge">{getRoleLabel(profile.role)}</span>
            </Link>
            <ThemeToggle />
            <form action={signOut} className="hidden sm:block">
              <button type="submit" className="ui-btn-secondary">
                <LogOut className="size-3.5" strokeWidth={1.9} />
                <span className="hidden md:inline">Sair</span>
              </button>
            </form>
            <button
              type="button"
              className="ui-btn-secondary lg:hidden"
              aria-expanded={open}
              aria-label={open ? "Fechar menu" : "Abrir menu"}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>

        {open ? (
          <div className="border-t border-border/70 px-3 py-3 sm:px-6 lg:hidden">
            <div className="mb-3 flex items-center gap-3 rounded-[var(--radius-sm)] border border-border/60 bg-muted/30 px-3 py-2.5">
              <PersonAvatar
                name={profile.full_name ?? profile.email}
                src={avatarUrl}
                size="md"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {profile.full_name ?? profile.email}
                </p>
                <p className="text-xs text-muted-foreground">
                  {getRoleLabel(profile.role)}
                </p>
              </div>
            </div>
            <nav className="flex flex-col gap-1">
              {drawerItems.map((item) => {
                const active = isActive(pathname, item);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    onClick={() => setOpen(false)}
                    className={cn(
                      "inline-flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-brand-soft text-brand-foreground"
                        : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn("size-4 shrink-0", item.iconClass)}
                      strokeWidth={1.9}
                    />
                    {item.label}
                  </Link>
                );
              })}
              <form action={signOut} className="pt-2 sm:hidden">
                <button type="submit" className="ui-btn-secondary w-full">
                  <LogOut className="size-3.5" strokeWidth={1.9} />
                  Sair
                </button>
              </form>
            </nav>
          </div>
        ) : null}
      </header>

      <div className="relative z-10 flex flex-1 flex-col">{children}</div>
    </div>
  );
}
