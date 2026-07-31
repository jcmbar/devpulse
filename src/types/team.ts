export type Team = {
  id: string;
  name: string;
  code: string;
  /**
   * Operational Jira key prefix for import routing (e.g. AP from AP-123).
   * Owned by Times — not connection config.
   */
  jira_key_prefix: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** Organizational write — connection/sync lives on `jira_integrations`. */
export type TeamWriteInput = {
  name: string;
  code: string;
  jiraKeyPrefix: string;
  isActive: boolean;
  notes?: string | null;
};

/** Read-only link shown on Times — data from jira_integrations. */
export type TeamJiraIntegrationSummary = {
  integrationId: string;
  name: string;
  isEnabled: boolean;
  projectKeys: string[];
  baseUrl: string;
};
