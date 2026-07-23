const WEEKDAY_LABELS: Record<number, string> = {
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
  7: "Domingo",
};

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday] ?? `Dia ${weekday}`;
}
