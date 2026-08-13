import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { jiraEstimateSecondsToHours, toDecimalHours } from "./hours.ts";

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

describe("toDecimalHours (spreadsheet)", () => {
  it("still treats values under 1000 as hours for spreadsheet imports", () => {
    assert.equal(toDecimalHours(8), 8);
    assert.equal(toDecimalHours(60), 60);
  });
});
