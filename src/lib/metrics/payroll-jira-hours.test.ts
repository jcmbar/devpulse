import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeContractedHoursDelta } from "./payroll-calc.ts";

describe("computeContractedHoursDelta", () => {
  it("mostra déficit quando Jira fica abaixo do contratado", () => {
    assert.equal(
      computeContractedHoursDelta({
        jiraHours: 100,
        contractedHoursPerMonth: 120,
      }),
      -20,
    );
  });

  it("mostra excedente quando Jira ultrapassa o contratado", () => {
    assert.equal(
      computeContractedHoursDelta({
        jiraHours: 140,
        contractedHoursPerMonth: 120,
      }),
      20,
    );
  });

  it("zera quando bate o mínimo", () => {
    assert.equal(
      computeContractedHoursDelta({
        jiraHours: 120,
        contractedHoursPerMonth: 120,
      }),
      0,
    );
  });
});
