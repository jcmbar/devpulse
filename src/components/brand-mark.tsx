import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  size?: number;
  priority?: boolean;
};

/** Official DevPulse mark (D+P pulse). */
export function BrandMark({
  className,
  size = 32,
  priority = false,
}: BrandMarkProps) {
  return (
    <Image
      src="/devpulse-mark.png"
      alt="DevPulse"
      width={size}
      height={size}
      priority={priority}
      className={cn(
        "rounded-[0.65rem] shadow-[var(--shadow-sm)] ring-1 ring-border/40",
        className,
      )}
    />
  );
}
