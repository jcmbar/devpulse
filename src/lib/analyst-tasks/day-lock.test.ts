import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANALYST_CLOSED_DAY_MESSAGE,
  assertCanMutateAnalystTaskDay,
  canOperateActiveAnalystTimer,
  isAnalystTaskDayClosed,
  localDateIsoFromInstant,
} from "./day-lock.ts";

describe("isAnalystTaskDayClosed", () => {
  it("locks days before today", () => {
    assert.equal(isAnalystTaskDayClosed("2026-09-04", "2026-09-05"), true);
    assert.equal(isAnalystTaskDayClosed("2026-09-05", "2026-09-05"), false);
    assert.equal(isAnalystTaskDayClosed("2026-09-06", "2026-09-05"), false);
  });
});

describe("localDateIsoFromInstant", () => {
  it("uses America/Sao_Paulo calendar day", () => {
    assert.equal(
      localDateIsoFromInstant("2026-09-05T02:30:00.000Z"),
      "2026-09-04",
    );
  });
});

describe("assertCanMutateAnalystTaskDay", () => {
  it("allows managers on closed days", () => {
    assert.doesNotThrow(() =>
      assertCanMutateAnalystTaskDay({
        isManager: true,
        taskDayIso: "2026-09-04",
        todayIso: "2026-09-05",
      }),
    );
  });

  it("blocks non-managers on closed days", () => {
    assert.throws(
      () =>
        assertCanMutateAnalystTaskDay({
          isManager: false,
          taskDayIso: "2026-09-04",
          todayIso: "2026-09-05",
        }),
      (error: unknown) =>
        error instanceof Error && error.message === ANALYST_CLOSED_DAY_MESSAGE,
    );
  });
});

describe("canOperateActiveAnalystTimer", () => {
  it("allows pause/complete of overnight running tasks", () => {
    assert.equal(
      canOperateActiveAnalystTimer({
        isManager: false,
        status: "running",
        taskDayIso: "2026-09-04",
        todayIso: "2026-09-05",
      }),
      true,
    );
  });

  it("blocks edit path for completed closed-day tasks", () => {
    assert.equal(
      canOperateActiveAnalystTimer({
        isManager: false,
        status: "completed",
        taskDayIso: "2026-09-04",
        todayIso: "2026-09-05",
      }),
      false,
    );
  });
});
