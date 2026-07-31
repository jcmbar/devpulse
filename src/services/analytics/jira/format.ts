export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) {
    return "—";
  }
  const days = ms / (1000 * 60 * 60 * 24);
  if (days >= 1) {
    return `${days.toFixed(1)}d`;
  }
  const hours = ms / (1000 * 60 * 60);
  if (hours >= 1) {
    return `${hours.toFixed(1)}h`;
  }
  const minutes = ms / (1000 * 60);
  return `${minutes.toFixed(0)}m`;
}
