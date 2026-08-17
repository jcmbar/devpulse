import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pickLatestJustifications,
  planJustificationCopies,
  type JustificationCopySource,
} from "./delay-justification-copy.ts";

function source(
  overrides: Partial<JustificationCopySource> &
    Pick<JustificationCopySource, "jira_key" | "status" | "requested_at">,
): JustificationCopySource {
  return {
    developer_id: "dev-1",
    kind: "delay",
    developer_note: "nota",
    requester_profile_id: "profile-1",
    reviewer_profile_id: null,
    reviewer_note: null,
    reviewed_at: null,
    due_on: "2026-08-01",
    unit_test_delivery_on: "2026-08-10",
    delay_days: 2,
    ...overrides,
  };
}

describe("delay-justification-copy", () => {
  it("prefers accepted over later pending for the same card", () => {
    const latest = pickLatestJustifications([
      source({
        jira_key: "AP-1",
        status: "accepted",
        requested_at: "2026-08-17T13:00:00.000Z",
      }),
      source({
        jira_key: "AP-1",
        status: "pending",
        requested_at: "2026-08-17T14:00:00.000Z",
      }),
    ]);
    assert.equal(latest.length, 1);
    assert.equal(latest[0]?.status, "accepted");
  });

  it("prefers a rejection over an older pending on the same card", () => {
    const latest = pickLatestJustifications([
      source({
        jira_key: "AP-7748",
        status: "pending",
        requested_at: "2026-08-17T13:20:47.000Z",
      }),
      source({
        jira_key: "AP-7748",
        status: "rejected",
        requested_at: "2026-08-17T13:25:07.000Z",
        reviewer_note: "não acatar",
        reviewed_at: "2026-08-17T13:25:07.000Z",
      }),
    ]);
    assert.equal(latest[0]?.status, "rejected");
  });

  it("copies from an older lote when the dest card still exists", () => {
    const plan = planJustificationCopies({
      sourceRows: [
        source({
          jira_key: "ap-7697",
          status: "accepted",
          requested_at: "2026-08-17T13:21:12.000Z",
          reviewer_profile_id: "gestor-1",
          reviewer_note: "ok",
          reviewed_at: "2026-08-17T13:22:00.000Z",
        }),
      ],
      destCards: [
        {
          id: "card-new",
          jira_key: "AP-7697",
          developer_id: "dev-1",
          due_on: "2026-08-01",
          unit_test_delivery_on: "2026-08-10",
          delay_days: 2,
        },
      ],
      destExisting: [],
    });
    assert.equal(plan.inserts.length, 1);
    assert.equal(plan.inserts[0]?.jira_card_id, "card-new");
    assert.equal(plan.inserts[0]?.status, "accepted");
    assert.equal(plan.skippedNoCard, 0);
  });

  it("updates a dest pending row when history has an accepted decision", () => {
    const plan = planJustificationCopies({
      sourceRows: [
        source({
          jira_key: "AP-1",
          status: "accepted",
          requested_at: "2026-08-17T13:30:00.000Z",
          reviewer_note: "acatada",
          reviewed_at: "2026-08-17T13:31:00.000Z",
          reviewer_profile_id: "gestor-1",
        }),
      ],
      destCards: [
        {
          id: "card-new",
          jira_key: "AP-1",
          developer_id: "dev-1",
          due_on: null,
          unit_test_delivery_on: null,
          delay_days: null,
        },
      ],
      destExisting: [
        {
          id: "row-pending",
          developer_id: "dev-1",
          jira_key: "AP-1",
          kind: "delay",
          status: "pending",
          requested_at: "2026-08-17T13:00:00.000Z",
        },
      ],
    });
    assert.equal(plan.inserts.length, 0);
    assert.equal(plan.updates.length, 1);
    assert.equal(plan.updates[0]?.id, "row-pending");
    assert.equal(plan.updates[0]?.status, "accepted");
  });

  it("keeps delay and rework as separate identities", () => {
    const plan = planJustificationCopies({
      sourceRows: [
        source({
          jira_key: "AP-7677",
          kind: "delay",
          status: "accepted",
          requested_at: "2026-08-10T20:36:12.000Z",
        }),
        source({
          jira_key: "AP-7677",
          kind: "rework",
          status: "accepted",
          requested_at: "2026-08-10T20:36:18.000Z",
        }),
      ],
      destCards: [
        {
          id: "card-new",
          jira_key: "AP-7677",
          developer_id: "dev-1",
          due_on: null,
          unit_test_delivery_on: null,
          delay_days: null,
        },
      ],
      destExisting: [],
    });
    assert.equal(plan.inserts.length, 2);
  });

  it("still copies when the dest card is on another assignee", () => {
    const plan = planJustificationCopies({
      sourceRows: [
        source({
          jira_key: "AP-2",
          status: "pending",
          requested_at: "2026-08-17T13:00:00.000Z",
        }),
      ],
      destCards: [
        {
          id: "card-other",
          jira_key: "AP-2",
          developer_id: "dev-2",
          due_on: null,
          unit_test_delivery_on: null,
          delay_days: null,
        },
      ],
      destExisting: [],
    });
    assert.equal(plan.inserts.length, 1);
    assert.equal(plan.inserts[0]?.developer_id, "dev-1");
    assert.equal(plan.inserts[0]?.jira_card_id, "card-other");
  });
});
