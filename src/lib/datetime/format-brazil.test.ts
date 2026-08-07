import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDateBrazil,
  formatDateTimeBrazil,
  formatTimeBrazil,
  parseInstant,
} from "./format-brazil.ts";

describe("parseInstant", () => {
  it("parses ISO with Z as UTC", () => {
    const date = parseInstant("2026-08-07T12:06:02.000Z");
    assert.ok(date);
    assert.equal(date.toISOString(), "2026-08-07T12:06:02.000Z");
  });

  it("treats naive timestamp as UTC", () => {
    const date = parseInstant("2026-08-07T12:06:02");
    assert.ok(date);
    assert.equal(date.toISOString(), "2026-08-07T12:06:02.000Z");
  });
});

describe("formatDateTimeBrazil", () => {
  it("converts UTC noon-ish to America/Sao_Paulo (UTC−3, no DST in 2026)", () => {
    // 12:06:02Z → 09:06:02 in São Paulo
    assert.equal(
      formatDateTimeBrazil("2026-08-07T12:06:02.000Z"),
      "07/08/2026, 09:06:02",
    );
  });

  it("formats date-only and time-only variants", () => {
    assert.equal(formatDateBrazil("2026-08-07T12:06:02.000Z"), "07/08/2026");
    assert.equal(formatTimeBrazil("2026-08-07T12:06:02.000Z"), "09:06:02");
  });

  it("returns fallback for invalid input", () => {
    assert.equal(formatDateTimeBrazil(null), "—");
    assert.equal(formatDateTimeBrazil("not-a-date", "n/d"), "n/d");
  });
});
