export type HolidayScope = "national" | "state" | "city" | "team";

export type Holiday = {
  id: string;
  holiday_on: string;
  name: string;
  scope: HolidayScope;
  region_code: string;
  is_active: boolean;
};

export const HOLIDAY_SCOPE_LABELS: Record<HolidayScope, string> = {
  national: "Nacional",
  state: "Estadual",
  city: "Municipal",
  team: "Time / região",
};
