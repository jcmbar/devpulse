import type { JiraStatusGroup } from "@/types/jira-flow-analytics";
import type { StgApprovalPolicy, StgFindingImpact } from "@/types/stg";

export const STG_SAFE_STATUS_GROUPS_DEFAULT: JiraStatusGroup[] = [
  "done",
  "validation",
];

export const STG_BLOCKING_IMPACTS_DEFAULT: StgFindingImpact[] = ["high"];

export const DEFAULT_STG_APPROVAL_POLICY: StgApprovalPolicy = {
  safe_status_groups: [...STG_SAFE_STATUS_GROUPS_DEFAULT],
  blocking_impacts: [...STG_BLOCKING_IMPACTS_DEFAULT],
  missing_card_blocks_high: true,
  unmapped_or_other_blocks: true,
};

const VALID_GROUPS = new Set<JiraStatusGroup>([
  "analysis",
  "development",
  "validation",
  "done",
  "other",
]);

const VALID_IMPACTS = new Set<StgFindingImpact>(["low", "medium", "high"]);

/**
 * Normalize policy JSON from DB. Never accepts literal Jira status names —
 * only semantic groups.
 */
export function parseStgApprovalPolicy(raw: unknown): StgApprovalPolicy {
  const base = { ...DEFAULT_STG_APPROVAL_POLICY };
  if (!raw || typeof raw !== "object") {
    return base;
  }
  const obj = raw as Record<string, unknown>;

  if (Array.isArray(obj.safe_status_groups)) {
    const groups = obj.safe_status_groups
      .map(String)
      .filter((g): g is JiraStatusGroup =>
        VALID_GROUPS.has(g as JiraStatusGroup),
      );
    if (groups.length > 0) {
      base.safe_status_groups = groups;
    }
  }

  if (Array.isArray(obj.blocking_impacts)) {
    const impacts = obj.blocking_impacts
      .map(String)
      .filter((i): i is StgFindingImpact =>
        VALID_IMPACTS.has(i as StgFindingImpact),
      );
    if (impacts.length > 0) {
      base.blocking_impacts = impacts;
    }
  }

  if (typeof obj.missing_card_blocks_high === "boolean") {
    base.missing_card_blocks_high = obj.missing_card_blocks_high;
  }
  if (typeof obj.unmapped_or_other_blocks === "boolean") {
    base.unmapped_or_other_blocks = obj.unmapped_or_other_blocks;
  }

  return base;
}

export function normalizeJiraKey(raw: string | null | undefined): string | null {
  if (raw == null) {
    return null;
  }
  const trimmed = raw.trim().toUpperCase().replace(/\s+/g, "");
  return trimmed.length > 0 ? trimmed : null;
}
