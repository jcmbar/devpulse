import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  estimateHoursFromPersistedJiraIssue,
  jiraEstimateFieldToHours,
  jiraEstimateSecondsToHours,
  toDecimalHours,
} from "./hours.ts";

describe("jiraEstimateSecondsToHours", () => {
  it("converts 1 minute (60s) to 0.02h, not 60h", () => {
    assert.equal(jiraEstimateSecondsToHours(60), 0.02);
  });

  it("converts 1 hour (3600s) to 1h", () => {
    assert.equal(jiraEstimateSecondsToHours(3600), 1);
  });

  it("converts 15 minutes (900s) to 0.25h", () => {
    assert.equal(jiraEstimateSecondsToHours(900), 0.25);
  });

  it("keeps zero as 0h", () => {
    assert.equal(jiraEstimateSecondsToHours(0), 0);
  });

  it("returns null for empty values", () => {
    assert.equal(jiraEstimateSecondsToHours(null), null);
  });
});

describe("jiraEstimateFieldToHours", () => {
  it("treats a numeric 1-minute estimate as 60 seconds, not 1 hour", () => {
    assert.equal(jiraEstimateFieldToHours(60), 0.02);
  });

  it("reads originalEstimateSeconds from a timetracking object", () => {
    assert.equal(
      jiraEstimateFieldToHours({ originalEstimateSeconds: 60 }),
      0.02,
    );
  });

  it("parses numeric strings as seconds", () => {
    assert.equal(jiraEstimateFieldToHours("480"), 0.13);
  });
});

describe("estimateHoursFromPersistedJiraIssue", () => {
  it("recomputes from raw seconds even when the column still has the old 60x/hours bug", () => {
    assert.equal(
      estimateHoursFromPersistedJiraIssue({
        estimateHours: 60,
        originalEstimateSeconds: 60,
      }),
      0.02,
    );
  });

  it("keeps a correctly converted 1h estimate (3600s)", () => {
    assert.equal(
      estimateHoursFromPersistedJiraIssue({
        estimateHours: 1,
        originalEstimateSeconds: 3600,
      }),
      1,
    );
  });

  it("falls back to the column when raw seconds are missing", () => {
    assert.equal(
      estimateHoursFromPersistedJiraIssue({
        estimateHours: 8,
        originalEstimateSeconds: null,
      }),
      8,
    );
  });
});

describe("toDecimalHours (spreadsheet)", () => {
  it("still treats values under 1000 as hours for spreadsheet imports", () => {
    assert.equal(toDecimalHours(8), 8);
    assert.equal(toDecimalHours(60), 60);
  });
});
