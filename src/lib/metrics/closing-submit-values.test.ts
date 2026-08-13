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

  it("Fixo + Jira ON sem banco: base − déficit + desloc + refeição", () => {
    const result = computeClosingSubmitValues({
      ...base,
      baseType: "fixed",
      baseAmount: 3120,
      workedHours: 150,
      timeBankEnabled: false,
      considerJiraHours: true,
    });
    assert.equal(result.jiraDeficitAmount, 500); // 10 × 50
    assert.equal(result.absenceAmount, 0);
    assert.equal(result.presencialExtraAmount, 0);
    assert.equal(result.travelAmount, 60);
    assert.equal(result.mealAmount, 28);
    assert.equal(result.differentialAmount, -500);
    assert.equal(result.invoiceAmount, 3120 - 500 + 60 + 28);
    assert.equal(result.timeBankHoursDelta, -10);
    assert.equal(result.considerJiraHours, true);
  });

  it("Fixo + Jira ON com banco: sem desconto monetário; Δ vai ao banco", () => {
    const result = computeClosingSubmitValues({
      ...base,
      baseType: "fixed",
      baseAmount: 3120,
      workedHours: 150,
      timeBankEnabled: true,
      considerJiraHours: true,
    });
    assert.equal(result.jiraDeficitAmount, 0);
    assert.equal(result.absenceAmount, 0);
    assert.equal(result.timeBankHoursDelta, -10);
    assert.equal(result.invoiceAmount, 3120 + 60 + 28);
  });

  it("Fixo + Jira OFF: desconto por faltas × h/dia × R$/h; ignora Jira", () => {
    const result = computeClosingSubmitValues({
      ...base,
      baseType: "fixed",
      baseAmount: 3120,
      workedHours: 0,
      timeBankEnabled: false,
      considerJiraHours: false,
      absenceDays: ["2026-08-06", "2026-08-07"],
    });
    assert.equal(result.jiraDeficitAmount, 0);
    assert.equal(result.timeBankHoursDelta, 0);
    assert.equal(result.absenceDeclaredCount, 2);
    assert.equal(result.makeupDaysCount, 0);
    assert.equal(result.absenceDaysCount, 2);
    assert.equal(result.absenceAmount, 600); // 2 × 6 × 50
    assert.equal(result.differentialAmount, -600);
    assert.equal(result.invoiceAmount, 3120 - 600 + 60 + 28);
    assert.equal(result.considerJiraHours, false);
  });

  it("Fixo + Jira OFF: compensação quita falta 1:1 (saldo líquido)", () => {
    const result = computeClosingSubmitValues({
      ...base,
      baseType: "fixed",
      baseAmount: 3120,
      workedHours: 0,
      considerJiraHours: false,
      absenceDays: ["2026-08-03", "2026-08-04"],
      makeupDays: ["2026-08-08"],
    });
    assert.equal(result.absenceDeclaredCount, 2);
    assert.equal(result.makeupDaysCount, 1);
    assert.equal(result.absenceDaysCount, 1);
    assert.equal(result.absenceAmount, 300); // 1 × 6 × 50
    assert.equal(result.invoiceAmount, 3120 - 300 + 60 + 28);
  });

  it("Fixo + Jira OFF: compensações ≥ faltas zeram desconto", () => {
    const result = computeClosingSubmitValues({
      ...base,
      baseType: "fixed",
      baseAmount: 3120,
      workedHours: 0,
      considerJiraHours: false,
      absenceDays: ["2026-08-03"],
      makeupDays: ["2026-08-08", "2026-08-09"],
    });
    assert.equal(result.absenceDaysCount, 0);
    assert.equal(result.absenceAmount, 0);
    assert.equal(result.invoiceAmount, 3120 + 60 + 28);
  });

  it("Fixo + Jira OFF: dia em falta e compensação conta só como falta", () => {
    const result = computeClosingSubmitValues({
      ...base,
      baseType: "fixed",
      baseAmount: 3120,
      workedHours: 0,
      considerJiraHours: false,
      absenceDays: ["2026-08-03"],
      makeupDays: ["2026-08-03"],
    });
    assert.equal(result.absenceDeclaredCount, 1);
    assert.equal(result.makeupDaysCount, 0);
    assert.equal(result.absenceDaysCount, 1);
    assert.equal(result.absenceAmount, 300);
  });

  it("Fixo + Jira OFF sem faltas: base + desloc + refeição", () => {
    const result = computeClosingSubmitValues({
      ...base,
      baseType: "fixed",
      baseAmount: 3120,
      workedHours: 0,
      considerJiraHours: false,
      absenceDays: [],
    });
    assert.equal(result.absenceAmount, 0);
    assert.equal(result.jiraDeficitAmount, 0);
    assert.equal(result.invoiceAmount, 3120 + 60 + 28);
  });

  it("variável ignora considerJiraHours=false e usa Jira", () => {
    const result = computeClosingSubmitValues({
      ...base,
      baseType: "variable",
      baseAmount: 3120,
      workedHours: 150,
      considerJiraHours: false,
      timeBankEnabled: false,
      absenceDays: ["2026-08-06"],
    });
    assert.equal(result.considerJiraHours, true);
    assert.equal(result.jiraDeficitAmount, 500);
    assert.equal(result.absenceAmount, 0);
    assert.equal(result.presencialExtraAmount, 300); // 3 × 2 × 50
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
    assert.equal(result.timeBankHoursDelta, -10);
    assert.equal(result.presencialExtraAmount, 300);
    assert.equal(result.invoiceAmount, 3120 + 300 + 60 + 28);
  });
});
