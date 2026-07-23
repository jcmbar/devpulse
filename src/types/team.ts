export type Team = {
  id: string;
  name: string;
  code: string;
  jira_key_prefix: string;
  is_active: boolean;
  jira_base_url: string | null;
  jira_project_key: string | null;
  jira_email: string | null;
  jira_api_token_secret_ref: string | null;
  jira_integration_enabled: boolean;
  jira_settings: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TeamWriteInput = {
  name: string;
  code: string;
  jiraKeyPrefix: string;
  isActive: boolean;
  jiraBaseUrl?: string | null;
  jiraProjectKey?: string | null;
  jiraEmail?: string | null;
  jiraApiTokenSecretRef?: string | null;
  jiraIntegrationEnabled?: boolean;
  notes?: string | null;
};
