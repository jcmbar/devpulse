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
        "mx-auto flex w-full flex-1 flex-col gap-4 px-3 py-4 sm:gap-5 sm:px-6 sm:py-6 lg:gap-6 lg:px-8 lg:py-7",
        SIZE_CLASS[size],
        className,
      )}
    >
      {children}
    </div>
  );
}
