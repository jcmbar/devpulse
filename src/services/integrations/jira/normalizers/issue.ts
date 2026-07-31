import { createHash } from "crypto";
import {
  DEVPULSE_JIRA_FIELD_CATALOG,
  type JiraFieldMappingSource,
  type JiraLogicalFieldKey,
  type ResolvedJiraFieldMappings,
} from "@/lib/jira/field-mappings";
import type { JiraFieldMappings } from "@/types/jira-integration";

export type RawJiraIssue = {
  id?: string;
  key?: string;
  fields?: Record<string, unknown>;
  changelog?: {
    histories?: RawJiraChangelogHistory[];
  };
};

export type RawJiraChangelogHistory = {
  id?: string;
  created?: string;
  author?: { accountId?: string };
  items?: Array<{
    field?: string;
    fieldId?: string;
    from?: string | null;
    fromString?: string | null;
    to?: string | null;
    toString?: string | null;
  }>;
};

export type NormalizedJiraIssue = {
  jiraId: string;
  jiraKey: string;
  summary: string | null;
  issueType: string | null;
  status: string | null;
  statusCategory: string | null;
  priority: string | null;
  labels: string[];
  assigneeAccountId: string | null;
  assigneeDisplayName: string | null;
  reporterAccountId: string | null;
  storyPoints: number | null;
  projectJiraId: string | null;
  projectKey: string | null;
  projectName: string | null;
  createdAtJira: string | null;
  updatedAtJira: string | null;
  resolvedAtJira: string | null;
  /** Date-only from mapped Entrega p/ Teste Unitário. */
  unitTestDeliveryOn: string | null;
  dueOn: string | null;
  estimateHours: number | null;
  parentKey: string | null;
  contentHash: string;
  rawPayload: Record<string, unknown>;
  fieldMappingSources?: Partial<
    Record<JiraLogicalFieldKey, JiraFieldMappingSource>
  >;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readNestedName(value: unknown): string | null {
  const obj = asRecord(value);
  return asString(obj?.name) ?? asString(obj?.value);
}

function mappedFieldId(
  mappings: JiraFieldMappings,
  key: JiraLogicalFieldKey,
): string | null {
  const id = mappings[key]?.trim();
  return id || null;
}

function readMappedRaw(
  raw: RawJiraIssue,
  fields: Record<string, unknown>,
  mappings: JiraFieldMappings,
  key: JiraLogicalFieldKey,
): unknown {
  const fieldId = mappedFieldId(mappings, key);
  if (!fieldId) {
    return undefined;
  }
  if (fieldId === "key") {
    return raw.key;
  }
  if (fieldId === "id") {
    return raw.id;
  }
  return fields[fieldId];
}

/**
 * Jira date custom fields usually arrive as `YYYY-MM-DD` or ISO datetime.
 * Returns date-only when parseable.
 */
export function readJiraDateOnly(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    if (trimmed.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
  }
  return null;
}

function readUser(value: unknown): {
  accountId: string | null;
  displayName: string | null;
} {
  const user = asRecord(value);
  return {
    accountId: asString(user?.accountId),
    displayName: asString(user?.displayName),
  };
}

function readStatus(value: unknown): {
  name: string | null;
  category: string | null;
} {
  const status = asRecord(value);
  const statusCategory = asRecord(status?.statusCategory);
  return {
    name: readNestedName(status),
    category:
      asString(statusCategory?.key) ?? readNestedName(statusCategory),
  };
}

function readLabels(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => asString(item))
    .filter((v): v is string => Boolean(v));
}

function readProject(value: unknown): {
  jiraId: string | null;
  key: string | null;
  name: string | null;
} {
  const project = asRecord(value);
  return {
    jiraId: asString(project?.id),
    key: asString(project?.key),
    name: asString(project?.name),
  };
}

function readParentKey(value: unknown): string | null {
  const parent = asRecord(value);
  return asString(parent?.key) ?? asString(value);
}

function readEstimateHours(value: unknown): number | null {
  const seconds = asNumber(value);
  if (seconds == null) {
    return null;
  }
  // Jira original estimate is seconds; also accept values already in hours (< 1000).
  if (seconds >= 1000) {
    return Math.round((seconds / 3600) * 100) / 100;
  }
  return Math.round(seconds * 100) / 100;
}

function readIssueType(value: unknown): string | null {
  const issueType = asRecord(value);
  return readNestedName(issueType) ?? asString(issueType?.id);
}

export function normalizeJiraIssue(
  raw: RawJiraIssue,
  mappings: JiraFieldMappings = {},
  resolution?: Pick<ResolvedJiraFieldMappings, "sources" | "projectKey">,
): NormalizedJiraIssue | null {
  const fields = asRecord(raw.fields) ?? {};

  const jiraIdRaw = readMappedRaw(raw, fields, mappings, "jira_id");
  const jiraKeyRaw = readMappedRaw(raw, fields, mappings, "jira_key");
  const jiraId = asString(jiraIdRaw) ?? asString(raw.id);
  const jiraKey = asString(jiraKeyRaw) ?? asString(raw.key);
  if (!jiraId || !jiraKey) {
    return null;
  }

  const statusRaw = readMappedRaw(raw, fields, mappings, "status");
  const statusParsed = readStatus(statusRaw);
  const assignee = readUser(readMappedRaw(raw, fields, mappings, "assignee"));
  const reporter = readUser(readMappedRaw(raw, fields, mappings, "reporter"));
  const project = readProject(readMappedRaw(raw, fields, mappings, "project"));
  const issueType = readIssueType(
    readMappedRaw(raw, fields, mappings, "issue_type"),
  );
  const priority = readNestedName(
    readMappedRaw(raw, fields, mappings, "priority"),
  );
  const labels = readLabels(readMappedRaw(raw, fields, mappings, "labels"));
  const storyPoints = asNumber(
    readMappedRaw(raw, fields, mappings, "story_points"),
  );
  const unitTestDeliveryOn = readJiraDateOnly(
    readMappedRaw(raw, fields, mappings, "unit_test_delivery_on"),
  );
  const dueOn = readJiraDateOnly(readMappedRaw(raw, fields, mappings, "due_on"));
  const estimateHours = readEstimateHours(
    readMappedRaw(raw, fields, mappings, "estimate_hours"),
  );
  const parentKey = readParentKey(
    readMappedRaw(raw, fields, mappings, "parent_key"),
  );
  const createdAtJira = asString(
    readMappedRaw(raw, fields, mappings, "created_at_jira"),
  );
  const updatedAtJira = asString(
    readMappedRaw(raw, fields, mappings, "updated_at_jira"),
  );
  const resolvedAtJira = asString(
    readMappedRaw(raw, fields, mappings, "resolved_at_jira"),
  );
  const summary = asString(readMappedRaw(raw, fields, mappings, "summary"));

  const projectKey = project.key;

  const fieldMappingResolutionFields: Record<string, unknown> = {};
  for (const meta of DEVPULSE_JIRA_FIELD_CATALOG) {
    const jiraFieldId = meta.linkedToKey
      ? (mappings[meta.linkedToKey] ?? null)
      : (mappings[meta.key] ?? null);
    fieldMappingResolutionFields[meta.key] = {
      jira_field_id: jiraFieldId,
      source: resolution?.sources?.[meta.key] ?? "none",
    };
  }
  fieldMappingResolutionFields.unit_test_delivery_on = {
    ...(fieldMappingResolutionFields.unit_test_delivery_on as object),
    value: unitTestDeliveryOn,
  };
  fieldMappingResolutionFields.story_points = {
    ...(fieldMappingResolutionFields.story_points as object),
    value: storyPoints,
  };
  fieldMappingResolutionFields.due_on = {
    ...(fieldMappingResolutionFields.due_on as object),
    value: dueOn,
  };
  fieldMappingResolutionFields.estimate_hours = {
    ...(fieldMappingResolutionFields.estimate_hours as object),
    value: estimateHours,
  };
  fieldMappingResolutionFields.parent_key = {
    ...(fieldMappingResolutionFields.parent_key as object),
    value: parentKey,
  };

  const fieldMappingResolution = {
    project_key: resolution?.projectKey ?? projectKey,
    sources: resolution?.sources ?? {},
    fields: fieldMappingResolutionFields,
  };

  const normalized: Omit<NormalizedJiraIssue, "contentHash"> & {
    contentHash?: string;
  } = {
    jiraId,
    jiraKey,
    summary,
    issueType,
    status: statusParsed.name,
    statusCategory: statusParsed.category,
    priority,
    labels,
    assigneeAccountId: assignee.accountId,
    assigneeDisplayName: assignee.displayName,
    reporterAccountId: reporter.accountId,
    storyPoints,
    projectJiraId: project.jiraId,
    projectKey,
    projectName: project.name,
    createdAtJira,
    updatedAtJira,
    resolvedAtJira,
    unitTestDeliveryOn,
    dueOn,
    estimateHours,
    parentKey,
    fieldMappingSources: resolution?.sources,
    rawPayload: {
      id: jiraId,
      key: jiraKey,
      fields,
      field_mapping_resolution: fieldMappingResolution,
    },
  };

  const hashSource = JSON.stringify({
    summary: normalized.summary,
    status: normalized.status,
    assignee: normalized.assigneeAccountId,
    updated: normalized.updatedAtJira,
    labels: normalized.labels,
    storyPoints: normalized.storyPoints,
    priority: normalized.priority,
    unitTestDeliveryOn: normalized.unitTestDeliveryOn,
    dueOn: normalized.dueOn,
    estimateHours: normalized.estimateHours,
    parentKey: normalized.parentKey,
  });
  normalized.contentHash = createHash("sha256")
    .update(hashSource)
    .digest("hex")
    .slice(0, 32);

  return normalized as NormalizedJiraIssue;
}
