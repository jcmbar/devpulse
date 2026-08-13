/** Professional job title on developers — not profiles.role (auth). */
export const DEVELOPER_JOB_TITLES = ["developer", "analyst"] as const;

export type DeveloperJobTitle = (typeof DEVELOPER_JOB_TITLES)[number];

export const DEVELOPER_JOB_TITLE_LABELS: Record<DeveloperJobTitle, string> = {
  developer: "Desenvolvedor",
  analyst: "Analista",
};

export function isDeveloperJobTitle(value: string): value is DeveloperJobTitle {
  return (DEVELOPER_JOB_TITLES as readonly string[]).includes(value);
}

export function getJobTitleLabel(value: string | null | undefined): string {
  if (value && isDeveloperJobTitle(value)) {
    return DEVELOPER_JOB_TITLE_LABELS[value];
  }
  return value?.trim() || "—";
}

export const COMPENSATION_BASE_TYPES = ["fixed", "variable"] as const;

export type CompensationBaseType = (typeof COMPENSATION_BASE_TYPES)[number];

export const COMPENSATION_BASE_TYPE_LABELS: Record<
  CompensationBaseType,
  string
> = {
  fixed: "Fixo",
  variable: "Variável",
};

export function isCompensationBaseType(
  value: string,
): value is CompensationBaseType {
  return (COMPENSATION_BASE_TYPES as readonly string[]).includes(value);
}

export type DeveloperCompensation = {
  id: string;
  developer_id: string;
  base_amount: number;
  base_type: CompensationBaseType;
  hourly_rate: number | null;
  contracted_hours_per_day: number;
  contracted_hours_per_month: number;
  daily_travel_amount: number;
  daily_meal_amount: number;
  /** Cobrar comprovante PIX de reembolso de refeição após finalize. */
  require_meal_pix_receipt: boolean;
  /**
   * Quando true, diferença Jira vs horas/mês contratadas vai ao banco
   * (sem ajuste monetário na NF).
   */
  time_bank_enabled: boolean;
  /**
   * Fixo only: when true, NF uses Jira deficit/time bank; when false,
   * uses absence days × h/day × rate (ignores Jira). Variable always uses Jira.
   */
  consider_jira_hours: boolean;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  is_current: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type UpsertCurrentCompensationInput = {
  developerId: string;
  baseAmount: number;
  baseType: CompensationBaseType;
  hourlyRate: number | null;
  contractedHoursPerDay: number;
  contractedHoursPerMonth: number;
  dailyTravelAmount: number;
  dailyMealAmount: number;
  requireMealPixReceipt?: boolean;
  timeBankEnabled?: boolean;
  /** Fixo only; variable always treats Jira as on. Default true. */
  considerJiraHours?: boolean;
  currency?: string;
  effectiveFrom?: string;
  notes?: string | null;
};
