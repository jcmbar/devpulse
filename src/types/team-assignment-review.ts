export type TeamAssignmentEntityType = "import" | "developer";

export type TeamAssignmentStatus =
  | "pending"
  | "auto_assigned"
  | "manual_assigned"
  | "skipped";

export type TeamAssignmentReview = {
  id: string;
  entity_type: TeamAssignmentEntityType;
  entity_id: string;
  status: TeamAssignmentStatus;
  suggested_team_id: string | null;
  assigned_team_id: string | null;
  reason: string;
  evidence: Record<string, unknown>;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TeamInferenceDecision =
  | {
      outcome: "assign";
      teamId: string;
      teamName: string;
      reason: string;
      evidence: Record<string, unknown>;
    }
  | {
      outcome: "pending";
      suggestedTeamId: string | null;
      reason: string;
      evidence: Record<string, unknown>;
    }
  | {
      outcome: "skip";
      reason: string;
      evidence: Record<string, unknown>;
    };
