import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const SIZE_CLASS = {
  sm: "max-w-lg",
  md: "max-w-2xl",
  lg: "max-w-5xl",
  xl: "max-w-7xl",
  full: "max-w-[1600px]",
} as const;

export type PageShellSize = keyof typeof SIZE_CLASS;

type PageShellProps = {
  children: ReactNode;
  size?: PageShellSize;
  className?: string;
};

export function PageShell({
  children,
  size = "xl",
  className,
}: PageShellProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-1 flex-col gap-7 px-4 py-7 sm:gap-8 sm:px-6 sm:py-9 lg:gap-9 lg:px-8",
        SIZE_CLASS[size],
        className,
      )}
    >
      {children}
    </div>
  );
}
