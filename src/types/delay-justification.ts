export type DelayJustificationKind = "delay" | "rework";

export type DelayJustificationStatus = "pending" | "accepted" | "rejected";

export type DelayJustificationRequest = {
  id: string;
  import_id: string;
  jira_card_id: string | null;
  jira_key: string;
  developer_id: string;
  kind: DelayJustificationKind;
  due_on: string | null;
  unit_test_delivery_on: string | null;
  delay_days: number | null;
  requester_profile_id: string;
  developer_note: string;
  requested_at: string;
  status: DelayJustificationStatus;
  reviewer_profile_id: string | null;
  reviewer_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DelayJustificationSubmitInput = {
  importId: string;
  jiraCardId: string;
  jiraKey: string;
  developerId: string;
  kind: DelayJustificationKind;
  dueOn: string | null;
  unitTestDeliveryOn: string | null;
  delayDays: number | null;
  developerNote: string;
  requesterProfileId: string;
};

export type DelayJustificationDecisionInput = {
  requestId: string;
  decision: "accepted" | "rejected";
  reviewerNote: string;
  reviewerProfileId: string;
};

export function justificationKindLabel(kind: DelayJustificationKind): string {
  return kind === "rework" ? "Retrabalho" : "Atraso";
}
