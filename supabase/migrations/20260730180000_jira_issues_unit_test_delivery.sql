-- Persist Jira custom "Entrega p/ Teste Unitário" on canonical issues
-- so Compilado materialization can use the real field instead of flow proxies.

alter table public.jira_issues
  add column if not exists unit_test_delivery_on date;

comment on column public.jira_issues.unit_test_delivery_on is
  'Jira custom field Entrega p/ Teste Unitário (via field_mappings.unit_test_delivery_on). Date-only.';

create index if not exists jira_issues_unit_test_delivery_on_idx
  on public.jira_issues (integration_id, unit_test_delivery_on);
