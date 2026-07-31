-- Per-project Jira → DevPulse field mappings (inherits from integration.field_mappings).

alter table public.jira_projects
  add column if not exists field_mappings jsonb not null default '{}'::jsonb;

comment on column public.jira_projects.field_mappings is
  'Project-specific logical→Jira field ids. Overrides jira_integrations.field_mappings when set per key.';
