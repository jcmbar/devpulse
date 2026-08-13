import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeClosingSubmitValues } from "./closing-submit-values.ts";

describe("computeClosingSubmitValues (nova fórmula)", () => {
  const base = {
    hourlyRate: 50,
    contractedHoursPerDay: 6,
    contractedHoursPerMonth: 160,
    dailyTravelAmount: 20,
    dailyMealAmount: 14,
    travelDays: ["2026-08-13", "2026-08-14", "2026-08-15"],
    mealDays: ["2026-08-14", "2026-08-15"],
    workedHours: 160,
  };

  it("fixo sem banco: base − déficit + desloc + refeição", () => {
    const result = computeClosingSubmitValues({
      ...base,
      baseType: "fixed",
      baseAmount: 3120,
      workedHours: 150,
      timeBankEnabled: false,
    });
    assert.equal(result.jiraDeficitAmount, 500); // 10 × 50
    assert.equal(result.presencialExtraAmount, 0);
    assert.equal(result.travelAmount, 60);
    assert.equal(result.mealAmount, 28);
    assert.equal(result.differentialAmount, -500);
    assert.equal(result.invoiceAmount, 3120 - 500 + 60 + 28);
    assert.equal(result.timeBankHoursDelta, -10);
  });

  it("fixo com banco: sem desconto monetário; Δ vai ao banco", () => {
    const result = computeClosingSubmitValues({
      ...base,
      baseType: "fixed",
      baseAmount: 3120,
      workedHours: 150,
      timeBankEnabled: true,
    });
    assert.equal(result.jiraDeficitAmount, 0);
    assert.equal(result.timeBankHoursDelta, -10);
    assert.equal(result.invoiceAmount, 3120 + 60 + 28);
  });

  it("variável 6h: inclui excedente 2h × dias deslocamento", () => {
    const result = computeClosingSubmitValues({
      ...base,
      baseType: "variable",
      baseAmount: 3120,
      workedHours: 160,
      timeBankEnabled: false,
    });
    assert.equal(result.presencialExtraAmount, 300); // 3 × 2 × 50
    assert.equal(result.jiraDeficitAmount, 0);
    assert.equal(result.invoiceAmount, 3120 + 300 + 60 + 28);
  });

  it("variável 8h: sem excedente presencial", () => {
    const result = computeClosingSubmitValues({
      ...base,
      baseType: "variable",
      baseAmount: 3120,
      contractedHoursPerDay: 8,
      workedHours: 160,
    });
    assert.equal(result.presencialExtraAmount, 0);
    assert.equal(result.invoiceAmount, 3120 + 60 + 28);
  });

  it("variável 6h com banco e déficit: extra em dinheiro, déficit no banco", () => {
    const result = computeClosingSubmitValues({
      ...base,
      baseType: "variable",
      baseAmount: 3120,
      workedHours: 150,
      timeBankEnabled: true,
    });
    assert.equal(result.jiraDeficitAmount, 0);
    assert.equal(result.presencialExtraAmount, 300);
    assert.equal(result.timeBankHoursDelta, -10);
    assert.equal(result.invoiceAmount, 3120 + 300 + 60 + 28);
  });
});
