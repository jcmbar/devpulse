/**
 * Closed-day lock for analyst task mutations (America/Sao_Paulo calendar day).
 * Non-managers cannot alter apontamentos once the local day has ended.
 */

/** Keep in sync with APP_DISPLAY_TIME_ZONE in format-brazil.ts */
const DISPLAY_TIME_ZONE = "America/Sao_Paulo";

export const ANALYST_CLOSED_DAY_MESSAGE =
  "Não é mais possível alterar apontamentos de um dia encerrado. Solicite a alteração ao gestor.";

export function localDateIsoFromInstant(
  instant: string | Date,
  timeZone: string = DISPLAY_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant instanceof Date ? instant : new Date(instant));
}

export function todayLocalDateIso(
  now: Date = new Date(),
  timeZone: string = DISPLAY_TIME_ZONE,
): string {
  return localDateIsoFromInstant(now, timeZone);
}

/** True when dateIso is strictly before today in the display timezone. */
export function isAnalystTaskDayClosed(
  dateIso: string,
  todayIso: string = todayLocalDateIso(),
): boolean {
  return dateIso < todayIso;
}

export function assertCanMutateAnalystTaskDay(input: {
  isManager: boolean;
  taskDayIso: string;
  todayIso?: string;
}): void {
  if (input.isManager) {
    return;
  }
  const today = input.todayIso ?? todayLocalDateIso();
  if (isAnalystTaskDayClosed(input.taskDayIso, today)) {
    throw new Error(ANALYST_CLOSED_DAY_MESSAGE);
  }
}

/**
 * Non-managers may still pause/resume/complete an active timer that started
 * yesterday (overnight continuity). Edit/delete of past completed days stay locked.
 */
export function canOperateActiveAnalystTimer(input: {
  isManager: boolean;
  status: string;
  taskDayIso: string;
  todayIso?: string;
}): boolean {
  if (input.isManager) {
    return true;
  }
  if (input.status === "running" || input.status === "paused") {
    return true;
  }
  const today = input.todayIso ?? todayLocalDateIso();
  return !isAnalystTaskDayClosed(input.taskDayIso, today);
}
