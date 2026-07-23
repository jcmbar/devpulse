export type CapacityWeekdayHours = {
  weekday: number;
  hours_per_day: number;
};

export type DeveloperMonthlyCapacity = {
  id: string;
  developer_id: string;
  year: number;
  month: number;
  required_hours: number;
  notes: string | null;
};

export type CapacitySource =
  | "override"
  | "team_default"
  | "mixed"
  | "missing";

export type CapacityMonthContribution = {
  yearMonth: string;
  hours: number;
  source: "override" | "team_default";
};

export type AppliedHolidaySummary = {
  date: string;
  name: string;
  scope: string;
  regionCode: string;
  reason: string;
  hoursExcluded: number;
};

export type ResolvedDeveloperCapacity = {
  developerId: string;
  requiredHours: number | null;
  source: CapacitySource;
  /** First month touched by the period (YYYY-MM), for config deep-links. */
  primaryYearMonth: string | null;
  spansMultipleMonths: boolean;
  segments: CapacityMonthContribution[];
  appliedHolidays: AppliedHolidaySummary[];
  holidayHoursExcluded: number;
};
