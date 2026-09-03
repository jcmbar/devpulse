import "server-only";

import {
  compareClosingToFolha,
  type ClosingFolhaCompareResult,
  type ClosingValuesSide,
} from "@/lib/metrics/closing-folha-compare";
import {
  getMonthlyClosingById,
  listMonthlyClosingPresenceDays,
} from "@/services/monthly-closings";
import {
  getPayrollItemForDeveloperMonth,
  listPayrollMealDaysForItem,
  listPayrollOffDaysForItem,
  listPayrollMakeupDaysForItem,
  listPayrollPresencialDaysForItem,
} from "@/services/payroll";
import type { MonthlyClosing } from "@/types/monthly-closing";
import type { PayrollClosingItem } from "@/types/payroll-closing";

export type ClosingFolhaComparePayload = {
  compare: ClosingFolhaCompareResult;
  userSide: ClosingValuesSide | null;
  folhaSide: ClosingValuesSide | null;
  folhaItem: PayrollClosingItem | null;
};

function closingToSide(
  closing: MonthlyClosing,
  travelDays: string[],
  mealDays: string[],
  absenceDays: string[],
  makeupDays: string[],
): ClosingValuesSide {
  return {
    travelAmount: closing.travel_amount,
    mealAmount: closing.meal_amount,
    differentialAmount: closing.differential_amount,
    invoiceAmount: closing.invoice_amount,
    dailyTravelAmount: closing.compensation_daily_travel_amount,
    dailyMealAmount: closing.compensation_daily_meal_amount,
    travelDays,
    mealDays,
    absenceDays,
    makeupDays,
  };
}

function folhaToSide(
  item: PayrollClosingItem,
  travelDays: string[],
  mealDays: string[],
  absenceDays: string[],
  makeupDays: string[],
): ClosingValuesSide {
  return {
    travelAmount: item.travel_amount,
    mealAmount: item.meal_amount,
    differentialAmount: item.differential_amount,
    invoiceAmount: item.invoice_amount,
    dailyTravelAmount: item.daily_travel_amount,
    dailyMealAmount: item.daily_meal_amount,
    travelDays,
    mealDays,
    absenceDays,
    makeupDays,
  };
}

export async function loadClosingFolhaCompare(
  closing: MonthlyClosing,
): Promise<ClosingFolhaComparePayload> {
  const hasClosingValues = closing.values_submitted_at != null;
  const compareAbsences = closing.consider_jira_hours_snapshot === false;

  const [presenceDays, folhaItem] = await Promise.all([
    hasClosingValues
      ? listMonthlyClosingPresenceDays(closing.id)
      : Promise.resolve([]),
    getPayrollItemForDeveloperMonth({
      developerId: closing.developer_id,
      yearMonth: closing.year_month,
    }),
  ]);

  const travelDays = presenceDays
    .filter((row) => row.kind === "travel")
    .map((row) => row.day_on);
  const mealDays = presenceDays
    .filter((row) => row.kind === "meal")
    .map((row) => row.day_on);
  const absenceDays = presenceDays
    .filter((row) => row.kind === "absence")
    .map((row) => row.day_on);
  const makeupDays = presenceDays
    .filter((row) => row.kind === "makeup")
    .map((row) => row.day_on);

  const userSide = hasClosingValues
    ? closingToSide(closing, travelDays, mealDays, absenceDays, makeupDays)
    : null;

  let folhaSide: ClosingValuesSide | null = null;
  if (folhaItem) {
    const [folhaTravel, folhaMeal, folhaAbsence, folhaMakeup] =
      await Promise.all([
        listPayrollPresencialDaysForItem(folhaItem.id),
        listPayrollMealDaysForItem(folhaItem.id),
        listPayrollOffDaysForItem(folhaItem.id),
        listPayrollMakeupDaysForItem(folhaItem.id),
      ]);
    folhaSide = folhaToSide(
      folhaItem,
      folhaTravel,
      folhaMeal,
      folhaAbsence,
      folhaMakeup,
    );
  }

  const compare = compareClosingToFolha({
    closing: userSide,
    folha: folhaSide,
    hasClosingValues,
    compareAbsences,
  });

  return { compare, userSide, folhaSide, folhaItem };
}

export async function assertClosingValuesMatchFolha(
  closingId: string,
): Promise<void> {
  const closing = await getMonthlyClosingById(closingId);
  if (!closing) {
    throw new Error("Fechamento não encontrado.");
  }

  const { compare } = await loadClosingFolhaCompare(closing);
  if (!compare.blocksDecision) {
    return;
  }

  if (!compare.hasFolha) {
    throw new Error(
      "Não há linha na Folha para esta pessoa/mês. Ajuste a Folha antes de aprovar ou finalizar.",
    );
  }

  throw new Error(
    "Há divergências entre os valores do envio (usuário) e a Folha (gestor). Corrija antes de aprovar ou finalizar.",
  );
}

/** Compact Folha × envio status for the in-review queue. */
export type ClosingFolhaListStatus = "ok" | "mismatch" | "n/a";

export function toClosingFolhaListStatus(
  compare: ClosingFolhaCompareResult,
): ClosingFolhaListStatus {
  if (!compare.hasClosingValues) {
    return "n/a";
  }
  if (compare.blocksDecision || compare.hasMismatch) {
    return "mismatch";
  }
  return "ok";
}

export async function loadClosingFolhaListStatuses(
  closings: MonthlyClosing[],
): Promise<Record<string, ClosingFolhaListStatus>> {
  if (closings.length === 0) {
    return {};
  }

  const results = await Promise.all(
    closings.map(async (closing) => {
      try {
        const { compare } = await loadClosingFolhaCompare(closing);
        return [closing.id, toClosingFolhaListStatus(compare)] as const;
      } catch (error) {
        console.error(
          "[closing-folha-compare] list status failed:",
          closing.id,
          error,
        );
        return [closing.id, "n/a" as const] as const;
      }
    }),
  );

  return Object.fromEntries(results);
}
