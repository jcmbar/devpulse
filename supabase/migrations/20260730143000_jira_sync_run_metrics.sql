-- Observability for hardened Jira sync runs (metrics JSON, no behavior change to upserts).

alter table public.jira_sync_runs
  add column if not exists metrics jsonb not null default '{}'::jsonb;

comment on column public.jira_sync_runs.metrics is
  'Operational counters: stop_reason, tokens_seen, pages_repeated, issues_reprocessed, worklogs_fetched, etc.';
