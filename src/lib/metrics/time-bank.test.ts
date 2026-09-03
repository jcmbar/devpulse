import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeTimeBankBalanceBeforeClosing,
  entryTypeFromSignedMinutes,
  formatHoursAsTimeBank,
  formatTimeBankMinutes,
  parseTimeBankInputToMinutes,
  projectTimeBankLedger,
} from "./time-bank.ts";

describe("time-bank helpers", () => {
  it("formats signed balances in HH:mm", () => {
    assert.equal(formatTimeBankMinutes(150), "+02h30");
    assert.equal(formatTimeBankMinutes(-195), "-03h15");
    assert.equal(formatTimeBankMinutes(0), "00h00");
    assert.equal(formatHoursAsTimeBank(168, { signed: false }), "168h00");
  });

  it("parses HH:mm and decimal inputs into minutes", () => {
    const hhmm = parseTimeBankInputToMinutes("02:30");
    assert.deepEqual(hhmm, { ok: true, minutes: 150 });

    const decimal = parseTimeBankInputToMinutes("2,5");
    assert.deepEqual(decimal, { ok: true, minutes: 150 });
  });

  it("derives entry type and absolute minutes from signed deltas", () => {
    assert.deepEqual(entryTypeFromSignedMinutes(120), {
      entryType: "credit",
      minutesAmount: 120,
    });
    assert.deepEqual(entryTypeFromSignedMinutes(-45), {
      entryType: "debit",
      minutesAmount: 45,
    });
    assert.equal(entryTypeFromSignedMinutes(0), null);
  });

  it("projects running balances and marks reverted manual entries", () => {
    const projected = projectTimeBankLedger([
      {
        id: "a",
        developer_id: "dev-1",
        year_month: "2026-08",
        entry_date: "2026-08-31",
        entry_type: "credit",
        source: "monthly_closing",
        minutes_amount: 120,
        monthly_closing_id: "closing-1",
        closing_sequence: 1,
        description: "Fechamento agosto",
        created_by: "user-1",
        created_by_name: "Gestor",
        created_at: "2026-08-31T12:00:00.000Z",
        reversed_entry_id: null,
        metadata_json: null,
      },
      {
        id: "b",
        developer_id: "dev-1",
        year_month: "2026-09",
        entry_date: "2026-09-05",
        entry_type: "debit",
        source: "manual_adjustment",
        minutes_amount: 30,
        monthly_closing_id: null,
        closing_sequence: null,
        description: "Ajuste manual",
        created_by: "user-2",
        created_by_name: "Admin",
        created_at: "2026-09-05T12:00:00.000Z",
        reversed_entry_id: null,
        metadata_json: null,
      },
      {
        id: "c",
        developer_id: "dev-1",
        year_month: "2026-09",
        entry_date: "2026-09-06",
        entry_type: "credit",
        source: "reversal",
        minutes_amount: 30,
        monthly_closing_id: null,
        closing_sequence: null,
        description: "Reversão ajuste manual",
        created_by: "user-2",
        created_by_name: "Admin",
        created_at: "2026-09-06T12:00:00.000Z",
        reversed_entry_id: "b",
        metadata_json: null,
      },
    ]);

    assert.equal(projected[0].balance_after_minutes, 120);
    assert.equal(projected[1].balance_after_minutes, 90);
    assert.equal(projected[2].balance_after_minutes, 120);
    assert.equal(projected[1].status, "reverted");
    assert.equal(projected[1].can_reverse, false);
    assert.equal(projected[2].status, "active");
  });

  it("computes the balance before the current closing and resolves the recorded entry", () => {
    const projected = projectTimeBankLedger([
      {
        id: "entry-1",
        developer_id: "dev-1",
        year_month: "2026-07",
        entry_date: "2026-07-31",
        entry_type: "credit",
        source: "monthly_closing",
        minutes_amount: 60,
        monthly_closing_id: "closing-jul",
        closing_sequence: 1,
        description: "Julho",
        created_by: "user-1",
        created_by_name: "Gestor",
        created_at: "2026-07-31T12:00:00.000Z",
        reversed_entry_id: null,
        metadata_json: null,
      },
      {
        id: "entry-2",
        developer_id: "dev-1",
        year_month: "2026-08",
        entry_date: "2026-08-10",
        entry_type: "debit",
        source: "manual_adjustment",
        minutes_amount: 15,
        monthly_closing_id: null,
        closing_sequence: null,
        description: "Ajuste agosto",
        created_by: "user-2",
        created_by_name: "Admin",
        created_at: "2026-08-10T12:00:00.000Z",
        reversed_entry_id: null,
        metadata_json: null,
      },
      {
        id: "entry-3",
        developer_id: "dev-1",
        year_month: "2026-08",
        entry_date: "2026-08-31",
        entry_type: "credit",
        source: "monthly_closing",
        minutes_amount: 120,
        monthly_closing_id: "closing-aug",
        closing_sequence: 2,
        description: "Agosto",
        created_by: "user-1",
        created_by_name: "Gestor",
        created_at: "2026-08-31T12:00:00.000Z",
        reversed_entry_id: null,
        metadata_json: null,
      },
    ]);

    const context = computeTimeBankBalanceBeforeClosing(projected, {
      yearMonth: "2026-08",
      monthlyClosingId: "closing-aug",
      closingSequence: 2,
    });

    assert.equal(context.balanceBeforeClosingMinutes, 45);
    assert.equal(context.recordedEntry?.id, "entry-3");
  });
});
