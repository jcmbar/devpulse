"use client";

import { useTheme, type Theme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={cn(
          "inline-flex h-9 items-center rounded-full border border-border/80 bg-card/80 p-0.5 shadow-[var(--shadow-sm)]",
          className,
        )}
        aria-hidden
      >
        <span className="size-8 rounded-full" />
        <span className="size-8 rounded-full" />
        <span className="size-8 rounded-full" />
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Tema"
      className={cn(
        "inline-flex h-9 items-center rounded-full border border-border/80 bg-card/80 p-0.5 shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            title={option.label}
            aria-label={option.label}
            aria-pressed={active}
            onClick={() => setTheme(option.value)}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,box-shadow,transform] duration-150",
              active
                ? "bg-brand-soft text-brand-foreground shadow-[var(--shadow-sm)]"
                : "hover:text-foreground active:scale-95",
            )}
          >
            <Icon className="size-3.5" strokeWidth={1.9} />
          </button>
        );
      })}
    </div>
  );
}
