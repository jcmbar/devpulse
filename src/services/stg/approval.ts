import type { JiraStatusGroup } from "@/types/jira-flow-analytics";
import type {
  StgApprovalPolicy,
  StgFinding,
  StgFindingImpact,
  StgSessionResult,
} from "@/types/stg";

export type StgFindingBlockerReason =
  | "missing_card"
  | "unmapped_or_other"
  | "unsafe_status_group";

export type StgFindingBlocker = {
  findingId: string;
  title: string;
  impact: StgFindingImpact;
  jiraKey: string | null;
  jiraStatus: string | null;
  statusGroup: JiraStatusGroup | null;
  reasons: StgFindingBlockerReason[];
};

export type EvaluateFindingBlockInput = {
  finding: Pick<
    StgFinding,
    | "id"
    | "title"
    | "impact"
    | "blocks_release"
    | "jira_key"
    | "jira_issue_id"
    | "status_group_cached"
    | "jira_status_cached"
  >;
  policy: StgApprovalPolicy;
  /** Live classification when available; falls back to status_group_cached. */
  statusGroup?: JiraStatusGroup | null;
  jiraStatus?: string | null;
  hasLinkedIssue?: boolean;
};

/**
 * Pure gate: does this finding block production under the STG policy?
 * Uses semantic groups only — callers must classify via Jira status_groups.
 */
export function evaluateFindingBlocker(
  input: EvaluateFindingBlockInput,
): StgFindingBlocker | null {
  const { finding, policy } = input;
  if (!finding.blocks_release) {
    return null;
  }
  if (!policy.blocking_impacts.includes(finding.impact)) {
    return null;
  }

  const reasons: StgFindingBlockerReason[] = [];
  const hasCard =
    input.hasLinkedIssue ??
    Boolean(finding.jira_issue_id || finding.jira_key);
  const group =
    input.statusGroup ?? finding.status_group_cached ?? null;
  const jiraStatus =
    input.jiraStatus ?? finding.jira_status_cached ?? null;

  if (!hasCard) {
    if (policy.missing_card_blocks_high) {
      reasons.push("missing_card");
    }
  } else if (group == null || group === "other") {
    if (policy.unmapped_or_other_blocks) {
      reasons.push("unmapped_or_other");
    }
  } else if (!policy.safe_status_groups.includes(group)) {
    reasons.push("unsafe_status_group");
  }

  if (reasons.length === 0) {
    return null;
  }

  return {
    findingId: finding.id,
    title: finding.title,
    impact: finding.impact,
    jiraKey: finding.jira_key,
    jiraStatus,
    statusGroup: group,
    reasons,
  };
}

export function deriveSessionResultFromBlockers(input: {
  sessionStatus: string;
  waived: boolean;
  blockers: StgFindingBlocker[];
}): StgSessionResult {
  if (input.waived) {
    return "waived";
  }
  if (
    input.sessionStatus === "draft" ||
    input.sessionStatus === "planned" ||
    input.sessionStatus === "in_progress"
  ) {
    // Surface blocked early if there are already blockers; else pending.
    return input.blockers.length > 0 ? "blocked" : "pending";
  }
  return input.blockers.length > 0 ? "blocked" : "approved";
}

export function blocksReleaseForImpact(
  impact: StgFindingImpact,
  policy: StgApprovalPolicy,
): boolean {
  return policy.blocking_impacts.includes(impact);
}
