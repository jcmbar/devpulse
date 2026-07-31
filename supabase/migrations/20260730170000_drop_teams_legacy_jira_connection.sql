-- Drop legacy Jira connection placeholders from teams.
-- Source of truth for connection/sync/analytics is public.jira_integrations.
-- Kept: teams.jira_key_prefix (import routing / operational team link).

comment on column public.teams.jira_key_prefix is
  'Jira issue key prefix (e.g. AP, PE, ATHOS). Matched from KEY-123. Organizational routing only — not connection config.';

alter table public.teams
  drop column if exists jira_base_url,
  drop column if exists jira_project_key,
  drop column if exists jira_email,
  drop column if exists jira_api_token_secret_ref,
  drop column if exists jira_integration_enabled,
  drop column if exists jira_settings;

comment on table public.teams is
  'Development teams. jira_key_prefix drives import routing; connection/sync live on jira_integrations.';
