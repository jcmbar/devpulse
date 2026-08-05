import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeInvoiceAmount,
  computeMealAmount,
  computePayrollDifferential,
  computeTravelAmount,
  countPresencialDays,
  countWorkedHours,
} from "./payroll-calc.ts";

/**
 * Caso real (Leonardo, jul/2026): 8 dias presenciais de 8h + 13 dias de home
 * office de 6h = 142h. 142 × 26,00 = 3.692,00 e a base contratual é 3.120,00,
 * logo o diferencial é 572,00.
 */
const attendance = [
  ...Array.from({ length: 8 }, () => ({
    dayKind: "presencial" as const,
    hours: 8,
  })),
  ...Array.from({ length: 13 }, () => ({
    dayKind: "home" as const,
    hours: 6,
  })),
  { dayKind: "weekend" as const, hours: 0 },
  { dayKind: "holiday" as const, hours: 0 },
];

describe("payroll-calc", () => {
  it("soma horas de presencial e home office", () => {
    assert.equal(countWorkedHours(attendance), 142);
    assert.equal(countPresencialDays(attendance), 8);
  });

  it("diferencial variável desconta a base contratual", () => {
    assert.equal(
      computePayrollDifferential({
        baseType: "variable",
        baseAmount: 3120,
        hourlyRate: 26,
        attendance,
      }),
      572,
    );
  });

  it("diferencial fixo permanece zero", () => {
    assert.equal(
      computePayrollDifferential({
        baseType: "fixed",
        baseAmount: 3120,
        hourlyRate: 26,
        attendance,
      }),
      0,
    );
  });

  it("diferencial pode ser negativo em meses com menos horas", () => {
    assert.equal(
      computePayrollDifferential({
        baseType: "variable",
        baseAmount: 3120,
        hourlyRate: 26,
        attendance: [{ dayKind: "home", hours: 100 }],
      }),
      -520,
    );
  });

  it("deslocamento e refeição usam apenas dias presenciais", () => {
    const presencialDays = countPresencialDays(attendance);
    assert.equal(
      computeTravelAmount({ presencialDays, dailyTravelAmount: 13 }),
      104,
    );
    assert.equal(computeMealAmount({ presencialDays, dailyMealAmount: 25 }), 200);
  });

  it("valor da NF soma tudo e desconta o campo descontos", () => {
    assert.equal(
      computeInvoiceAmount({
        baseAmount: 3120,
        differentialAmount: 572,
        discountsAmount: 100,
        travelAmount: 104,
        mealAmount: 200,
      }),
      3896,
    );
  });
});
