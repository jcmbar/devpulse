import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertLaunchedIdentity,
  buildWorkIntervalsForDay,
  localDatesSpannedByInterval,
  resolveSimultaneityAlertLevel,
  summarizeDaySimultaneity,
  summarizeTasksForDay,
  SIMULTANEITY_ALERT_THRESHOLDS,
} from "./simultaneous-hours.ts";

/** Helpers: wall times as ISO with Brazil offset. */
function sp(date: string, time: string): string {
  return `${date}T${time}${time.includes("+") || time.includes("-") ? "" : "-03:00"}`;
}

describe("resolveSimultaneityAlertLevel", () => {
  it("maps threshold bands exactly", () => {
    assert.equal(resolveSimultaneityAlertLevel(null), "none");
    assert.equal(resolveSimultaneityAlertLevel(0), "none");
    assert.equal(resolveSimultaneityAlertLevel(0.01), "low");
    assert.equal(resolveSimultaneityAlertLevel(SIMULTANEITY_ALERT_THRESHOLDS.low), "low");
    assert.equal(
      resolveSimultaneityAlertLevel(SIMULTANEITY_ALERT_THRESHOLDS.low + 0.01),
      "attention",
    );
    assert.equal(
      resolveSimultaneityAlertLevel(SIMULTANEITY_ALERT_THRESHOLDS.attention),
      "attention",
    );
    assert.equal(
      resolveSimultaneityAlertLevel(SIMULTANEITY_ALERT_THRESHOLDS.attention + 0.01),
      "high",
    );
    assert.equal(
      resolveSimultaneityAlertLevel(SIMULTANEITY_ALERT_THRESHOLDS.high),
      "high",
    );
    assert.equal(
      resolveSimultaneityAlertLevel(SIMULTANEITY_ALERT_THRESHOLDS.high + 0.01),
      "critical",
    );
  });
});

describe("summarizeTasksForDay", () => {
  it("no overlap: launched = realized, conflict = 0", () => {
    const day = "2026-09-04";
    const summary = summarizeTasksForDay(
      [
        {
          id: "a",
          startedAt: sp(day, "09:00:00"),
          endedAt: sp(day, "12:00:00"),
        },
        {
          id: "b",
          startedAt: sp(day, "13:00:00"),
          endedAt: sp(day, "18:00:00"),
        },
      ],
      day,
    );
    assert.equal(summary.launchedHours, 8);
    assert.equal(summary.realizedHours, 8);
    assert.equal(summary.conflictHours, 0);
    assert.equal(summary.windows.length, 0);
    assert.equal(assertLaunchedIdentity(summary), true);
  });

  it("simple overlap: 09–12 and 11–14 → 6 launched, 5 realized, 1 conflict", () => {
    const day = "2026-09-04";
    const summary = summarizeTasksForDay(
      [
        {
          id: "a",
          startedAt: sp(day, "09:00:00"),
          endedAt: sp(day, "12:00:00"),
        },
        {
          id: "b",
          startedAt: sp(day, "11:00:00"),
          endedAt: sp(day, "14:00:00"),
        },
      ],
      day,
    );
    assert.equal(summary.launchedHours, 6);
    assert.equal(summary.realizedHours, 5);
    assert.equal(summary.conflictHours, 1);
    assert.equal(summary.windows.length, 1);
    assert.equal(summary.windows[0]?.maxConcurrency, 2);
    assert.deepEqual(summary.windows[0]?.taskIds, ["a", "b"]);
    assert.equal(assertLaunchedIdentity(summary), true);
  });

  it("adjacent intervals do not conflict", () => {
    const day = "2026-09-04";
    const summary = summarizeTasksForDay(
      [
        {
          id: "a",
          startedAt: sp(day, "09:00:00"),
          endedAt: sp(day, "10:00:00"),
        },
        {
          id: "b",
          startedAt: sp(day, "10:00:00"),
          endedAt: sp(day, "11:00:00"),
        },
      ],
      day,
    );
    assert.equal(summary.launchedHours, 2);
    assert.equal(summary.realizedHours, 2);
    assert.equal(summary.conflictHours, 0);
    assert.equal(summary.windows.length, 0);
  });

  it("triple overlap 30 minutes → 0.5 realized and 1.0 conflict", () => {
    const day = "2026-09-04";
    const summary = summarizeTasksForDay(
      [
        {
          id: "a",
          startedAt: sp(day, "10:00:00"),
          endedAt: sp(day, "10:30:00"),
        },
        {
          id: "b",
          startedAt: sp(day, "10:00:00"),
          endedAt: sp(day, "10:30:00"),
        },
        {
          id: "c",
          startedAt: sp(day, "10:00:00"),
          endedAt: sp(day, "10:30:00"),
        },
      ],
      day,
    );
    assert.equal(summary.launchedHours, 1.5);
    assert.equal(summary.realizedHours, 0.5);
    assert.equal(summary.conflictHours, 1);
    assert.equal(summary.windows[0]?.maxConcurrency, 3);
    assert.deepEqual(summary.windows[0]?.taskIds, ["a", "b", "c"]);
    assert.equal(assertLaunchedIdentity(summary), true);
  });

  it("task fully contained in another", () => {
    const day = "2026-09-04";
    const summary = summarizeTasksForDay(
      [
        {
          id: "outer",
          startedAt: sp(day, "09:00:00"),
          endedAt: sp(day, "12:00:00"),
        },
        {
          id: "inner",
          startedAt: sp(day, "10:00:00"),
          endedAt: sp(day, "11:00:00"),
        },
      ],
      day,
    );
    assert.equal(summary.launchedHours, 4);
    assert.equal(summary.realizedHours, 3);
    assert.equal(summary.conflictHours, 1);
    assert.equal(summary.windows.length, 1);
    assert.equal(summary.windows[0]?.startMinutes, 10 * 60);
    assert.equal(summary.windows[0]?.endMinutes, 11 * 60);
  });

  it("splits a midnight-crossing task across America/Sao_Paulo days", () => {
    const startedAt = "2026-09-04T22:00:00-03:00";
    const endedAt = "2026-09-05T02:00:00-03:00";
    assert.deepEqual(localDatesSpannedByInterval(startedAt, endedAt), [
      "2026-09-04",
      "2026-09-05",
    ]);

    const day1 = summarizeTasksForDay(
      [{ id: "night", startedAt, endedAt }],
      "2026-09-04",
    );
    const day2 = summarizeTasksForDay(
      [{ id: "night", startedAt, endedAt }],
      "2026-09-05",
    );
    assert.equal(day1.launchedHours, 2);
    assert.equal(day1.realizedHours, 2);
    assert.equal(day2.launchedHours, 2);
    assert.equal(day2.realizedHours, 2);
    assert.equal(day1.conflictHours, 0);
    assert.equal(day2.conflictHours, 0);
  });

  it("ignores invalid tasks (missing end, end <= start)", () => {
    const day = "2026-09-04";
    const summary = summarizeTasksForDay(
      [
        {
          id: "bad-order",
          startedAt: sp(day, "12:00:00"),
          endedAt: sp(day, "11:00:00"),
        },
        {
          id: "equal",
          startedAt: sp(day, "12:00:00"),
          endedAt: sp(day, "12:00:00"),
        },
        {
          id: "ok",
          startedAt: sp(day, "09:00:00"),
          endedAt: sp(day, "10:00:00"),
        },
      ],
      day,
    );
    assert.equal(summary.launchedHours, 1);
    assert.equal(summary.realizedHours, 1);
    assert.equal(summary.conflictHours, 0);
  });

  it("applies proportional pause scale like computeAnalystTaskMetrics", () => {
    const day = "2026-09-04";
    // 2h wall, 1h paused → scale 0.5 → 1h launched
    const summary = summarizeTasksForDay(
      [
        {
          id: "paused",
          startedAt: sp(day, "09:00:00"),
          endedAt: sp(day, "11:00:00"),
          totalPausedMs: 60 * 60 * 1000,
        },
      ],
      day,
    );
    assert.equal(summary.launchedHours, 1);
    assert.equal(summary.realizedHours, 1);
    assert.equal(summary.conflictHours, 0);

    const intervals = buildWorkIntervalsForDay(
      [
        {
          id: "paused",
          startedAt: sp(day, "09:00:00"),
          endedAt: sp(day, "11:00:00"),
          totalPausedMs: 60 * 60 * 1000,
        },
      ],
      day,
    );
    assert.equal(intervals[0]?.scale, 0.5);

    // Overlap with a second full task on the same 2h wall:
    // launched = 1 + 2 = 3; realized = integral min(1, 0.5+1) = 2; conflict = 1
    const overlapped = summarizeTasksForDay(
      [
        {
          id: "paused",
          startedAt: sp(day, "09:00:00"),
          endedAt: sp(day, "11:00:00"),
          totalPausedMs: 60 * 60 * 1000,
        },
        {
          id: "full",
          startedAt: sp(day, "09:00:00"),
          endedAt: sp(day, "11:00:00"),
        },
      ],
      day,
    );
    assert.equal(overlapped.launchedHours, 3);
    assert.equal(overlapped.realizedHours, 2);
    assert.equal(overlapped.conflictHours, 1);
    assert.equal(assertLaunchedIdentity(overlapped), true);
  });

  it("percent is null/zero-path when realizedHours is zero", () => {
    const day = "2026-09-04";
    const summary = summarizeTasksForDay([], day);
    assert.equal(summary.realizedHours, 0);
    assert.equal(summary.simultaneityPercent, null);
    assert.equal(summary.alertLevel, "none");
  });

  it("keeps launched = realized + conflict identity", () => {
    const day = "2026-09-04";
    const summary = summarizeDaySimultaneity(
      buildWorkIntervalsForDay(
        [
          {
            id: "a",
            startedAt: sp(day, "09:00:00"),
            endedAt: sp(day, "12:30:00"),
          },
          {
            id: "b",
            startedAt: sp(day, "11:15:00"),
            endedAt: sp(day, "14:00:00"),
          },
          {
            id: "c",
            startedAt: sp(day, "11:45:00"),
            endedAt: sp(day, "12:15:00"),
          },
        ],
        day,
      ),
      day,
    );
    assert.equal(assertLaunchedIdentity(summary), true);
    assert.ok((summary.simultaneityPercent ?? 0) > 0);
  });
});
