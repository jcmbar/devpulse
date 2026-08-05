-- At most one active (pending/running) sync run per integration.
-- Used as a concurrency lock for Jira auto-sync and manual sync.

create unique index if not exists jira_sync_runs_one_active_per_integration_idx
  on public.jira_sync_runs (integration_id)
  where status in ('pending', 'running');

comment on index public.jira_sync_runs_one_active_per_integration_idx is
  'Concurrency lock: only one pending/running sync run per jira_integrations row.';
