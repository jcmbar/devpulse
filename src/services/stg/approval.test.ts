import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveSessionResultFromBlockers,
  evaluateFindingBlocker,
} from "./approval.ts";
import { DEFAULT_STG_APPROVAL_POLICY } from "./constants.ts";
import type { StgFinding } from "../../types/stg.ts";

function finding(
  overrides: Partial<StgFinding> & Pick<StgFinding, "id" | "title" | "impact">,
): StgFinding {
  return {
    session_id: "s1",
    session_scenario_id: null,
    description: null,
    found_by_developer_id: "d1",
    blocks_release: true,
    jira_key: null,
    jira_issue_id: null,
    status_group_cached: null,
    jira_status_cached: null,
    notes: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("stg approval engine", () => {
  it("blocks high impact without card", () => {
    const blocker = evaluateFindingBlocker({
      finding: finding({
        id: "1",
        title: "bug",
        impact: "high",
        blocks_release: true,
      }),
      policy: DEFAULT_STG_APPROVAL_POLICY,
      hasLinkedIssue: false,
    });
    assert.ok(blocker);
    assert.ok(blocker.reasons.includes("missing_card"));
  });

  it("does not block high in safe group done", () => {
    const blocker = evaluateFindingBlocker({
      finding: finding({
        id: "2",
        title: "bug",
        impact: "high",
        blocks_release: true,
        jira_key: "AP-1",
        jira_issue_id: "issue-1",
      }),
      policy: DEFAULT_STG_APPROVAL_POLICY,
      hasLinkedIssue: true,
      statusGroup: "done",
      jiraStatus: "Finalizado",
    });
    assert.equal(blocker, null);
  });

  it("blocks high in development group", () => {
    const blocker = evaluateFindingBlocker({
      finding: finding({
        id: "3",
        title: "bug",
        impact: "high",
        blocks_release: true,
        jira_key: "AP-2",
        jira_issue_id: "issue-2",
      }),
      policy: DEFAULT_STG_APPROVAL_POLICY,
      hasLinkedIssue: true,
      statusGroup: "development",
      jiraStatus: "Develop",
    });
    assert.ok(blocker);
    assert.ok(blocker.reasons.includes("unsafe_status_group"));
  });

  it("blocks unmapped/other fail-closed", () => {
    const blocker = evaluateFindingBlocker({
      finding: finding({
        id: "4",
        title: "bug",
        impact: "high",
        blocks_release: true,
        jira_key: "AP-3",
        jira_issue_id: "issue-3",
      }),
      policy: DEFAULT_STG_APPROVAL_POLICY,
      hasLinkedIssue: true,
      statusGroup: "other",
      jiraStatus: "Status Novo",
    });
    assert.ok(blocker);
    assert.ok(blocker.reasons.includes("unmapped_or_other"));
  });

  it("does not block low impact", () => {
    const blocker = evaluateFindingBlocker({
      finding: finding({
        id: "5",
        title: "nit",
        impact: "low",
        blocks_release: false,
      }),
      policy: DEFAULT_STG_APPROVAL_POLICY,
      hasLinkedIssue: false,
    });
    assert.equal(blocker, null);
  });

  it("derives waived and blocked results", () => {
    assert.equal(
      deriveSessionResultFromBlockers({
        sessionStatus: "reviewing",
        waived: true,
        blockers: [],
      }),
      "waived",
    );
    assert.equal(
      deriveSessionResultFromBlockers({
        sessionStatus: "reviewing",
        waived: false,
        blockers: [
          {
            findingId: "1",
            title: "x",
            impact: "high",
            jiraKey: null,
            jiraStatus: null,
            statusGroup: null,
            reasons: ["missing_card"],
          },
        ],
      }),
      "blocked",
    );
    assert.equal(
      deriveSessionResultFromBlockers({
        sessionStatus: "reviewing",
        waived: false,
        blockers: [],
      }),
      "approved",
    );
  });
});
