import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isUnfilledSeedDay,
  resolveBatchTargetDays,
  resolveFillMonthDefaultPatches,
  resolveWorkweekKindPatches,
  resolveZeroWeekendPatches,
} from "./payroll-attendance-batch.ts";

describe("payroll-attendance-batch", () => {
  const days = [
    { day_on: "2026-08-03", day_kind: "home" as const, hours: 8 }, // Mon seed
    { day_on: "2026-08-04", day_kind: "presencial" as const, hours: 8 }, // Tue edited
    { day_on: "2026-08-05", day_kind: "home" as const, hours: 8 }, // Wed seed
    { day_on: "2026-08-08", day_kind: "weekend" as const, hours: 0 }, // Sat
    { day_on: "2026-08-09", day_kind: "weekend" as const, hours: 0 }, // Sun
  ];

  it("detects unfilled seed days", () => {
    assert.equal(isUnfilledSeedDay(days[0]!, 8), true);
    assert.equal(isUnfilledSeedDay(days[1]!, 8), false);
    assert.equal(isUnfilledSeedDay(days[3]!, 8), true);
  });

  it("applies home to Mon-Fri overwrite", () => {
    const patches = resolveWorkweekKindPatches({
      days,
      dayKind: "home",
      contractedHoursPerDay: 8,
    });
    assert.deepEqual(
      patches.map((p) => p.dayOn),
      ["2026-08-03", "2026-08-04", "2026-08-05"],
    );
    assert.equal(patches.every((p) => p.dayKind === "home"), true);
  });

  it("applies presencial to selected weekdays", () => {
    const patches = resolveBatchTargetDays({
      days,
      dayKind: "presencial",
      hours: 8,
      weekdays: [1, 3], // Mon, Wed
      rangeStart: null,
      rangeEnd: null,
      mode: "overwrite",
      contractedHoursPerDay: 8,
    });
    assert.deepEqual(
      patches.map((p) => p.dayOn),
      ["2026-08-03", "2026-08-05"],
    );
  });

  it("respects date range", () => {
    const patches = resolveBatchTargetDays({
      days,
      dayKind: "presencial",
      hours: 8,
      weekdays: [1, 2, 3, 4, 5],
      rangeStart: "2026-08-04",
      rangeEnd: "2026-08-05",
      mode: "overwrite",
      contractedHoursPerDay: 8,
    });
    assert.deepEqual(
      patches.map((p) => p.dayOn),
      ["2026-08-04", "2026-08-05"],
    );
  });

  it("fill_unfilled skips edited days", () => {
    const patches = resolveBatchTargetDays({
      days,
      dayKind: "presencial",
      hours: 8,
      weekdays: [1, 2, 3, 4, 5],
      rangeStart: null,
      rangeEnd: null,
      mode: "fill_unfilled",
      contractedHoursPerDay: 8,
    });
    assert.deepEqual(
      patches.map((p) => p.dayOn),
      ["2026-08-03", "2026-08-05"],
    );
  });

  it("fill month default resets weekend and weekdays", () => {
    const patches = resolveFillMonthDefaultPatches({
      days: [
        { day_on: "2026-08-03", day_kind: "presencial", hours: 4 },
        { day_on: "2026-08-08", day_kind: "home", hours: 8 },
      ],
      contractedHoursPerDay: 8,
    });
    assert.deepEqual(patches, [
      { dayOn: "2026-08-03", dayKind: "home", hours: 8 },
      { dayOn: "2026-08-08", dayKind: "weekend", hours: 0 },
    ]);
  });

  it("fill month default marks weekday holidays", () => {
    const patches = resolveFillMonthDefaultPatches({
      days: [
        { day_on: "2026-09-07", day_kind: "home", hours: 8 }, // Mon holiday
        { day_on: "2026-09-08", day_kind: "home", hours: 8 }, // Tue
      ],
      contractedHoursPerDay: 8,
      holidayDates: new Set(["2026-09-07"]),
    });
    assert.deepEqual(patches, [
      { dayOn: "2026-09-07", dayKind: "holiday", hours: 0 },
      { dayOn: "2026-09-08", dayKind: "home", hours: 8 },
    ]);
  });

  it("zeros weekends", () => {
    const patches = resolveZeroWeekendPatches({ days });
    assert.deepEqual(
      patches.map((p) => p.dayOn),
      ["2026-08-08", "2026-08-09"],
    );
    assert.equal(patches.every((p) => p.hours === 0), true);
  });
});
