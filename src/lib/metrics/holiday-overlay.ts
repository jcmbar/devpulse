/** Visual-only holiday overlay shared by Folha, fechamento and config preview. */

export type HolidayOverlayEntry = {
  date: string;
  name: string;
};

export type HolidayOverlay = {
  dates: ReadonlySet<string>;
  byDate: ReadonlyMap<string, string>;
};

export function toHolidayOverlay(
  entries: ReadonlyArray<HolidayOverlayEntry>,
): HolidayOverlay {
  const byDate = new Map<string, string>();
  for (const entry of entries) {
    if (!byDate.has(entry.date)) {
      byDate.set(entry.date, entry.name);
    }
  }
  return { dates: new Set(byDate.keys()), byDate };
}

export function holidayOverlayFromByDate(
  byDate: ReadonlyMap<string, string>,
): HolidayOverlay {
  return { dates: new Set(byDate.keys()), byDate };
}

/** Rose tint for calendar cells — informational only. */
export const HOLIDAY_OVERLAY_CELL_CLASS =
  "border-rose-500/40 bg-rose-500/15 text-rose-900/80 dark:text-rose-100/80";

export const HOLIDAY_OVERLAY_RING_CLASS = "ring-2 ring-rose-500/45";
