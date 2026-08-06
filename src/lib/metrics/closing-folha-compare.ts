import { formatClosingMoney } from "@/lib/metrics/closing-submit-values";

export type ClosingValuesSide = {
  travelAmount: number | null;
  mealAmount: number | null;
  differentialAmount: number | null;
  invoiceAmount: number | null;
  dailyTravelAmount: number | null;
  dailyMealAmount: number | null;
  travelDays: string[];
  mealDays: string[];
};

export type ClosingFolhaCompareField =
  | "travelAmount"
  | "mealAmount"
  | "differentialAmount"
  | "invoiceAmount"
  | "dailyRates"
  | "travelDays"
  | "mealDays";

export const CLOSING_FOLHA_COMPARE_FIELD_LABELS: Record<
  ClosingFolhaCompareField,
  string
> = {
  travelAmount: "Deslocamento",
  mealAmount: "Refeição",
  differentialAmount: "Diferencial",
  invoiceAmount: "Total NF",
  dailyRates: "Diárias",
  travelDays: "Dias — Deslocamento",
  mealDays: "Dias — Refeição",
};

export type ClosingFolhaCompareResult = {
  hasFolha: boolean;
  hasClosingValues: boolean;
  mismatches: ClosingFolhaCompareField[];
  hasMismatch: boolean;
  /** True when approve/finalize must be blocked. */
  blocksDecision: boolean;
};

function sameMoney(a: number | null, b: number | null): boolean {
  if (a == null && b == null) {
    return true;
  }
  if (a == null || b == null) {
    return false;
  }
  return Math.abs(a - b) < 0.005;
}

function normalizeDays(days: string[]): string[] {
  return [...new Set(days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
}

function sameDaySet(a: string[], b: string[]): boolean {
  const left = normalizeDays(a);
  const right = normalizeDays(b);
  if (left.length !== right.length) {
    return false;
  }
  return left.every((day, index) => day === right[index]);
}

export function compareClosingToFolha(input: {
  closing: ClosingValuesSide | null;
  folha: ClosingValuesSide | null;
  /** Closing has values_submitted_at (or equivalent). */
  hasClosingValues: boolean;
}): ClosingFolhaCompareResult {
  const hasFolha = input.folha != null;
  const hasClosingValues = input.hasClosingValues && input.closing != null;

  if (!hasClosingValues) {
    return {
      hasFolha,
      hasClosingValues: false,
      mismatches: [],
      hasMismatch: false,
      blocksDecision: false,
    };
  }

  if (!hasFolha || !input.closing || !input.folha) {
    return {
      hasFolha: false,
      hasClosingValues: true,
      mismatches: [
        "travelAmount",
        "mealAmount",
        "differentialAmount",
        "invoiceAmount",
        "dailyRates",
        "travelDays",
        "mealDays",
      ],
      hasMismatch: true,
      blocksDecision: true,
    };
  }

  const mismatches: ClosingFolhaCompareField[] = [];
  const user = input.closing;
  const folha = input.folha;

  if (!sameMoney(user.travelAmount, folha.travelAmount)) {
    mismatches.push("travelAmount");
  }
  if (!sameMoney(user.mealAmount, folha.mealAmount)) {
    mismatches.push("mealAmount");
  }
  if (!sameMoney(user.differentialAmount, folha.differentialAmount)) {
    mismatches.push("differentialAmount");
  }
  if (!sameMoney(user.invoiceAmount, folha.invoiceAmount)) {
    mismatches.push("invoiceAmount");
  }
  if (
    !sameMoney(user.dailyTravelAmount, folha.dailyTravelAmount) ||
    !sameMoney(user.dailyMealAmount, folha.dailyMealAmount)
  ) {
    mismatches.push("dailyRates");
  }
  if (!sameDaySet(user.travelDays, folha.travelDays)) {
    mismatches.push("travelDays");
  }
  if (!sameDaySet(user.mealDays, folha.mealDays)) {
    mismatches.push("mealDays");
  }

  return {
    hasFolha: true,
    hasClosingValues: true,
    mismatches,
    hasMismatch: mismatches.length > 0,
    blocksDecision: mismatches.length > 0,
  };
}

export function formatCompareDays(days: string[]): string {
  const normalized = normalizeDays(days);
  if (normalized.length === 0) {
    return "—";
  }
  return normalized
    .map((day) => `${day.slice(8, 10)}/${day.slice(5, 7)}`)
    .join(", ");
}

export function formatCompareDailyRates(side: ClosingValuesSide): string {
  return `Desloc. ${formatClosingMoney(side.dailyTravelAmount)} · Ref. ${formatClosingMoney(side.dailyMealAmount)}`;
}

export function formatCompareMoneyWithDays(input: {
  amount: number | null;
  dayCount: number;
}): string {
  return `${input.dayCount} dia(s) · ${formatClosingMoney(input.amount)}`;
}
