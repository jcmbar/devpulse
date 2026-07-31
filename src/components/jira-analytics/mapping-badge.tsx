type MappingBadgeProps = {
  warning: "fuzzy" | "unmapped" | null | undefined;
};

export function MappingBadge({ warning }: MappingBadgeProps) {
  if (!warning) {
    return null;
  }
  const isUnmapped = warning === "unmapped";
  return (
    <span
      className={
        isUnmapped
          ? "ml-1 inline-flex rounded border border-danger/30 bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-danger"
          : "ml-1 inline-flex rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400"
      }
      title={
        isUnmapped
          ? "Status sem alias explícito — grupo pode ser other/impreciso"
          : "Status casou por fuzzy — confie menos no grupo até promover alias"
      }
    >
      {warning}
    </span>
  );
}
