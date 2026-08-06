import {
  computeInvoiceAmount,
  computeMealAmount,
  computeTravelAmount,
  roundMoney,
} from "@/lib/metrics/payroll-calc";
import type { CompensationBaseType } from "@/types/developer-compensation";

export type ClosingSubmitValuesInput = {
  baseType: CompensationBaseType;
  baseAmount: number;
  hourlyRate: number | null;
  dailyTravelAmount: number;
  dailyMealAmount: number;
  /** Jira "horas realizadas" no mês do fechamento (Folha uses attendance; here we snapshot delivery hours). */
  workedHours: number;
  travelDays: string[];
  mealDays: string[];
};

export type ClosingSubmitValuesResult = {
  travelPresencialDays: number;
  mealPresencialDays: number;
  travelAmount: number;
  mealAmount: number;
  differentialAmount: number;
  invoiceAmount: number;
  workedHoursSnapshot: number;
  compensationBaseAmount: number;
  compensationBaseType: CompensationBaseType;
  compensationHourlyRate: number | null;
  compensationDailyTravelAmount: number;
  compensationDailyMealAmount: number;
};

/**
 * Amounts frozen on monthly closing submit.
 * Travel/meal: same Folha formulas (days × daily rate).
 * Differential (variable): (workedHours × hourlyRate) − base — same structure as Folha,
 * using closing Jira hours until Folha attendance exists.
 * Invoice: base + differential + travel + meal (discounts 0 at submit).
 */
export function computeClosingSubmitValues(
  input: ClosingSubmitValuesInput,
): ClosingSubmitValuesResult {
  const travelDays = uniqueIsoDates(input.travelDays);
  const mealDays = uniqueIsoDates(input.mealDays);
  const travelPresencialDays = travelDays.length;
  const mealPresencialDays = mealDays.length;
  const dailyTravel = Math.max(0, input.dailyTravelAmount);
  const dailyMeal = Math.max(0, input.dailyMealAmount);
  const baseAmount = Number.isFinite(input.baseAmount) ? input.baseAmount : 0;
  const workedHours =
    Number.isFinite(input.workedHours) && input.workedHours > 0
      ? Math.round(input.workedHours * 100) / 100
      : 0;

  const travelAmount = computeTravelAmount({
    presencialDays: travelPresencialDays,
    dailyTravelAmount: dailyTravel,
  });
  const mealAmount = computeMealAmount({
    presencialDays: mealPresencialDays,
    dailyMealAmount: dailyMeal,
  });

  let differentialAmount = 0;
  if (input.baseType === "variable") {
    const rate = input.hourlyRate;
    if (rate != null && Number.isFinite(rate) && rate >= 0) {
      const workedAmount = roundMoney(workedHours * rate);
      differentialAmount = roundMoney(workedAmount - baseAmount);
    }
  }

  const invoiceAmount = computeInvoiceAmount({
    baseAmount,
    differentialAmount,
    discountsAmount: 0,
    travelAmount,
    mealAmount,
  });

  return {
    travelPresencialDays,
    mealPresencialDays,
    travelAmount,
    mealAmount,
    differentialAmount,
    invoiceAmount,
    workedHoursSnapshot: workedHours,
    compensationBaseAmount: baseAmount,
    compensationBaseType: input.baseType,
    compensationHourlyRate: input.hourlyRate,
    compensationDailyTravelAmount: dailyTravel,
    compensationDailyMealAmount: dailyMeal,
  };
}

function uniqueIsoDates(values: string[]): string[] {
  const set = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      set.add(trimmed);
    }
  }
  return [...set].sort();
}

export function formatClosingMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
