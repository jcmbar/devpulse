import "server-only";

export {
  DEFAULT_STG_APPROVAL_POLICY,
  parseStgApprovalPolicy,
  normalizeJiraKey,
} from "@/services/stg/constants";

export {
  evaluateFindingBlocker,
  deriveSessionResultFromBlockers,
  blocksReleaseForImpact,
} from "@/services/stg/approval";
export type {
  StgFindingBlocker,
  StgFindingBlockerReason,
  EvaluateFindingBlockInput,
} from "@/services/stg/approval";

export {
  ensureStgTeamDefaults,
  getStgTeamDefaults,
  updateStgTeamDefaults,
  listStgModulesWithScenarios,
  upsertStgModule,
  upsertStgScenario,
  listStgDefaultParticipants,
  setStgDefaultParticipant,
  removeStgDefaultParticipant,
  suggestStgSessionParticipants,
} from "@/services/stg/catalog";

export { resolveStgJiraIssueForTeam } from "@/services/stg/jira-status";
export type { ResolvedStgJiraIssue } from "@/services/stg/jira-status";

export {
  listStgSessions,
  getStgSession,
  getStgSessionDetail,
  openStgSession,
  updateStgScenarioRunStatus,
  updateStgSessionStatus,
  waiveStgSession,
  recalculateStgSessionResult,
  computeStgCoverage,
} from "@/services/stg/sessions";
export type { StgSessionDetail } from "@/services/stg/sessions";

export {
  upsertStgFinding,
  deleteStgFinding,
  refreshStgFindingJiraStatus,
} from "@/services/stg/findings";
export type { UpsertStgFindingInput } from "@/services/stg/findings";
