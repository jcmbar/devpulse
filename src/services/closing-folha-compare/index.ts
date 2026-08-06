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
  };
}

function folhaToSide(
  item: PayrollClosingItem,
  presencialDays: string[],
): ClosingValuesSide {
  // Folha calcula deslocamento e refeição sobre os mesmos dias presenciais.
  return {
    travelAmount: item.travel_amount,
    mealAmount: item.meal_amount,
    differentialAmount: item.differential_amount,
    invoiceAmount: item.invoice_amount,
    dailyTravelAmount: item.daily_travel_amount,
    dailyMealAmount: item.daily_meal_amount,
    travelDays: presencialDays,
    mealDays: presencialDays,
  };
}

export async function loadClosingFolhaCompare(
  closing: MonthlyClosing,
): Promise<ClosingFolhaComparePayload> {
  const hasClosingValues = closing.values_submitted_at != null;

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

  const userSide = hasClosingValues
    ? closingToSide(closing, travelDays, mealDays)
    : null;

  let folhaSide: ClosingValuesSide | null = null;
  if (folhaItem) {
    const presencialDays = await listPayrollPresencialDaysForItem(folhaItem.id);
    folhaSide = folhaToSide(folhaItem, presencialDays);
  }

  const compare = compareClosingToFolha({
    closing: userSide,
    folha: folhaSide,
    hasClosingValues,
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
