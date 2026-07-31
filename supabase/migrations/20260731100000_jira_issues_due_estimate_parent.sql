-- Expand jira_issues for Compilado parity fields from explicit de/para.
alter table public.jira_issues
  add column if not exists due_on date,
  add column if not exists estimate_hours numeric,
  add column if not exists parent_key text;

comment on column public.jira_issues.due_on is
  'Mapped due date (field_mappings.due_on). Date-only.';
comment on column public.jira_issues.estimate_hours is
  'Mapped original estimate converted to hours (field_mappings.estimate_hours).';
comment on column public.jira_issues.parent_key is
  'Mapped parent/epic issue key (field_mappings.parent_key).';

create index if not exists jira_issues_due_on_idx
  on public.jira_issues (integration_id, due_on);

create index if not exists jira_issues_parent_key_idx
  on public.jira_issues (integration_id, parent_key);
