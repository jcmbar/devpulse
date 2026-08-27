import { cn } from "@/lib/utils";

type PersonAvatarProps = {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
};

const SIZE_CLASS = {
  sm: "size-7 text-[10px]",
  md: "size-9 text-xs",
  lg: "size-12 text-sm",
  xl: "size-14 text-base",
  "2xl": "size-16 text-lg",
} as const;

function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`.toUpperCase();
}

export function PersonAvatar({
  name,
  src,
  size = "md",
  className,
}: PersonAvatarProps) {
  const initials = initialsFromName(name);
  const url = src?.trim() || null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-muted font-semibold tracking-wide text-muted-foreground",
        SIZE_CLASS[size],
        className,
      )}
      title={name}
      aria-hidden={url ? undefined : true}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- public Supabase URL; avoid remotePatterns churn
        <img
          src={url}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span>{initials}</span>
      )}
    </span>
  );
}
