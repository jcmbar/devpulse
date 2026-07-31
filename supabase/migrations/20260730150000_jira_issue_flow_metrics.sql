-- Derived analytics layer: per-issue flow metrics snapshots (recomputable).

create table if not exists public.jira_issue_flow_metrics (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.jira_integrations (id) on delete cascade,
  issue_id uuid not null references public.jira_issues (id) on delete cascade,
  -- Computation metadata
  computation_version text not null default 'flow_v1',
  computed_at timestamptz not null default timezone('utc', now()),
  source_issue_updated_at timestamptz,
  -- Core timestamps / durations (ms)
  created_at_jira timestamptz,
  resolved_at_jira timestamptz,
  is_open boolean not null default true,
  lead_time_ms bigint,
  aging_ms bigint,
  time_to_first_assignment_ms bigint,
  first_develop_at timestamptz,
  first_staging_at timestamptz,
  time_to_first_develop_ms bigint,
  time_to_first_staging_ms bigint,
  -- Counts
  reopen_count integer not null default 0,
  develop_reentry_count integer not null default 0,
  assignee_change_count integer not null default 0,
  status_transition_count integer not null default 0,
  -- Dwell maps: { "Develop": 123456, ... } durations in ms
  status_dwell_ms jsonb not null default '{}'::jsonb,
  status_group_dwell_ms jsonb not null default '{}'::jsonb,
  -- Traceability / debug
  current_status text,
  current_status_group text,
  rules_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint jira_issue_flow_metrics_issue_unique unique (issue_id),
  constraint jira_issue_flow_metrics_integration_issue_unique unique (integration_id, issue_id)
);

comment on table public.jira_issue_flow_metrics is
  'Derived flow analytics per Jira issue. Safe to wipe and recompute from events.';
comment on column public.jira_issue_flow_metrics.lead_time_ms is
  'resolved_at_jira - created_at_jira when resolved; null if still open.';
comment on column public.jira_issue_flow_metrics.reopen_count is
  'Transitions from a done-group status to a non-done status.';
comment on column public.jira_issue_flow_metrics.develop_reentry_count is
  'Entries into develop-group after the first develop exit (rework proxy).';
comment on column public.jira_issue_flow_metrics.status_dwell_ms is
  'Accumulated milliseconds spent in each raw status name.';
comment on column public.jira_issue_flow_metrics.status_group_dwell_ms is
  'Accumulated milliseconds per logical group (analysis/development/validation/done/other).';

create trigger jira_issue_flow_metrics_set_updated_at
before update on public.jira_issue_flow_metrics
for each row
execute function public.set_updated_at();

create index if not exists jira_issue_flow_metrics_integration_computed_idx
  on public.jira_issue_flow_metrics (integration_id, computed_at desc);

create index if not exists jira_issue_flow_metrics_integration_resolved_idx
  on public.jira_issue_flow_metrics (integration_id, resolved_at_jira)
  where resolved_at_jira is not null;

create index if not exists jira_issue_flow_metrics_integration_open_idx
  on public.jira_issue_flow_metrics (integration_id, is_open)
  where is_open = true;

alter table public.jira_issue_flow_metrics enable row level security;

create policy "jira_issue_flow_metrics_select_admin_gestor"
  on public.jira_issue_flow_metrics for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "jira_issue_flow_metrics_write_admin_gestor"
  on public.jira_issue_flow_metrics for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );
