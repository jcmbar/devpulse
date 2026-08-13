import "server-only";

import {
  classifyStatusDetailed,
  resolveStatusGroupMapping,
} from "@/services/analytics/jira/status-mapping";
import { listJiraIntegrations } from "@/services/integrations/jira";
import { normalizeJiraKey } from "@/services/stg/constants";
import { createClient } from "@/lib/supabase/server";
import type { JiraStatusGroup } from "@/types/jira-flow-analytics";

export type ResolvedStgJiraIssue = {
  integrationId: string;
  issueId: string;
  jiraKey: string;
  status: string | null;
  statusGroup: JiraStatusGroup;
  matchedBy: string;
};

/**
 * Resolve a Jira key for a team using the team's integration and
 * existing status_groups mapping. Does not invent aliases in STG.
 */
export async function resolveStgJiraIssueForTeam(input: {
  teamId: string;
  jiraKey: string;
}): Promise<ResolvedStgJiraIssue | null> {
  const key = normalizeJiraKey(input.jiraKey);
  if (!key) {
    return null;
  }

  const integrations = await listJiraIntegrations();
  const integration =
    integrations.find((row) => row.team_id === input.teamId) ?? null;
  if (!integration) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jira_issues")
    .select("id, jira_key, status")
    .eq("integration_id", integration.id)
    .eq("jira_key", key)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao resolver issue Jira: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  const mapping = resolveStatusGroupMapping(integration.settings);
  const classification = classifyStatusDetailed(data.status, mapping);

  return {
    integrationId: integration.id,
    issueId: String(data.id),
    jiraKey: String(data.jira_key),
    status: (data.status as string | null) ?? null,
    statusGroup: classification.group,
    matchedBy: classification.matchedBy,
  };
}
