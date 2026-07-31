import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSyncWindow,
  formatJiraDateTime,
  resolveJiraJqlTimeZone,
} from "./build-jql.ts";

/**
 * Regression for AP-7677:
 * Card updated 2026-07-31T10:01:31-0500 (= 15:01:31Z).
 * Cursor ~15:00:30Z. UTC wall-clock JQL used `updated >= "15:00"` which the
 * site interpreted as 15:00 *local* (−0500), skipping the card. Site-TZ
 * formatting keeps the bound at 10:00 local so 10:01 is included.
 */
describe("formatJiraDateTime (JQL site timezone)", () => {
  it("formats cursor in America/Chicago instead of UTC wall-clock", () => {
    const cursorIso = "2026-07-31T15:00:30.147Z";
    const utcWall = formatJiraDateTime(cursorIso, "UTC");
    const chicago = formatJiraDateTime(cursorIso, "America/Chicago");

    assert.equal(utcWall, "2026-07-31 15:00");
    assert.equal(chicago, "2026-07-31 10:00");
  });

  it("keeps AP-7677 updated inside the incremental window (Chicago)", () => {
    const cardUpdatedIso = "2026-07-31T15:01:31.224Z"; // 10:01 -0500
    const cursorIso = "2026-07-31T15:00:30.147Z";

    const cardLocal = formatJiraDateTime(cardUpdatedIso, "America/Chicago");
    const wrongBound = formatJiraDateTime(cursorIso, "UTC");
    const rightBound = formatJiraDateTime(cursorIso, "America/Chicago");

    assert.equal(cardLocal, "2026-07-31 10:01");
    // Lexicographic compare works for equal-length yyyy-MM-dd HH:mm.
    assert.equal(cardLocal >= wrongBound, false, "UTC wall-clock excludes card");
    assert.equal(cardLocal >= rightBound, true, "site TZ includes card");
  });

  it("formats Sao Paulo offset correctly", () => {
    // 15:01Z = 12:01 in America/Sao_Paulo (UTC−3, no DST in 2026).
    assert.equal(
      formatJiraDateTime("2026-07-31T15:01:31.224Z", "America/Sao_Paulo"),
      "2026-07-31 12:01",
    );
  });
});

describe("resolveJiraJqlTimeZone", () => {
  it("accepts valid IANA zones and falls back for invalid", () => {
    assert.equal(resolveJiraJqlTimeZone("America/Chicago"), "America/Chicago");
    assert.equal(resolveJiraJqlTimeZone("Not/AZone"), "America/Sao_Paulo");
    assert.equal(resolveJiraJqlTimeZone(null), "America/Sao_Paulo");
  });
});

describe("buildSyncWindow JQL", () => {
  const baseIntegration = {
    id: "00000000-0000-0000-0000-000000000001",
    team_id: "00000000-0000-0000-0000-000000000002",
    name: "test",
    base_url: "https://example.atlassian.net",
    email: "bot@example.com",
    api_token_secret_ref: "JIRA_TOKEN",
    is_enabled: true,
    project_keys: ["AP"],
    jql_extra: null,
    include_changelog: true,
    include_worklogs: true,
    sync_window_days: 90,
    safety_overlap_minutes: 15,
    sync_cursor_updated_at: "2026-07-31T15:00:30.147Z",
    last_successful_sync_at: null,
    field_mappings: {},
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  };

  it("serializes incremental updated bound in the provided timezone", () => {
    const window = buildSyncWindow(baseIntegration as never, {
      timeZone: "America/Chicago",
    });
    assert.equal(window.mode, "incremental");
    assert.equal(window.jqlTimeZone, "America/Chicago");
    // cursor 15:00Z − 15min overlap = 14:45Z → 09:45 Chicago
    assert.match(window.jql, /updated >= "2026-07-31 09:45"/);
    assert.match(window.jql, /ORDER BY updated ASC, key ASC$/);
  });
});
