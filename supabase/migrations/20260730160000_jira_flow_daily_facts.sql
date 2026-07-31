-- Flow analytics v2 phase 1: materialized daily facts + recompute run audit.
-- Source of truth remains jira_issue_status_events; these tables are derived only.

-- ---------------------------------------------------------------------------
-- Recompute runs (analytics pipeline observability — not Jira sync)
-- ---------------------------------------------------------------------------

create table if not exists public.jira_flow_recompute_runs (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.jira_integrations (id) on delete cascade,
  kind text not null default 'daily_facts',
  mode text not null default 'range',
  status text not null default 'pending',
  trigger_source text not null default 'manual',
  from_day date,
  to_day date,
  started_at timestamptz,
  finished_at timestamptz,
  rules_hash text,
  computation_version text not null default 'flow_v1',
  metrics jsonb not null default '{}'::jsonb,
  error_message text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint jira_flow_recompute_runs_kind_check
    check (kind in ('daily_facts', 'issue_metrics')),
  constraint jira_flow_recompute_runs_mode_check
    check (mode in ('full', 'range', 'incremental')),
  constraint jira_flow_recompute_runs_status_check
    check (status in ('pending', 'running', 'success', 'error'))
);

comment on table public.jira_flow_recompute_runs is
  'Audit log for analytics recompute pipelines (daily facts / issue metrics). Separate from jira_sync_runs.';

create trigger jira_flow_recompute_runs_set_updated_at
before update on public.jira_flow_recompute_runs
for each row
execute function public.set_updated_at();

create index if not exists jira_flow_recompute_runs_integration_created_idx
  on public.jira_flow_recompute_runs (integration_id, created_at desc);

create index if not exists jira_flow_recompute_runs_status_idx
  on public.jira_flow_recompute_runs (status)
  where status in ('pending', 'running');

-- ---------------------------------------------------------------------------
-- Daily facts (WIP / CFD building blocks — UTC calendar days)
-- ---------------------------------------------------------------------------

create table if not exists public.jira_flow_daily_facts (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.jira_integrations (id) on delete cascade,
  day date not null,
  status_group text not null,
  -- Empty string = unknown / null issue_type (keeps unique key simple).
  issue_type text not null default '',
  wip_count integer not null default 0,
  arrived_count integer not null default 0,
  departed_count integer not null default 0,
  resolved_count integer not null default 0,
  rules_hash text not null,
  computation_version text not null default 'flow_v1',
  computed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint jira_flow_daily_facts_natural_key
    unique (integration_id, day, status_group, issue_type),
  constraint jira_flow_daily_facts_status_group_check
    check (status_group in ('analysis', 'development', 'validation', 'done', 'other')),
  constraint jira_flow_daily_facts_counts_nonneg_check
    check (
      wip_count >= 0
      and arrived_count >= 0
      and departed_count >= 0
      and resolved_count >= 0
    )
);

comment on table public.jira_flow_daily_facts is
  'Materialized per-day flow facts for CFD/WIP history. Rebuildable from status events + issues. Day boundaries are UTC.';
comment on column public.jira_flow_daily_facts.day is
  'UTC calendar day (inclusive). WIP is measured at 23:59:59.999Z of this day.';
comment on column public.jira_flow_daily_facts.wip_count is
  'Open issues in this status_group at end of day (excludes done / already resolved as-of EOD).';
comment on column public.jira_flow_daily_facts.arrived_count is
  'Transitions into this status_group during the UTC day (from a different group).';
comment on column public.jira_flow_daily_facts.departed_count is
  'Transitions out of this status_group during the UTC day (to a different group).';
comment on column public.jira_flow_daily_facts.resolved_count is
  'Issues whose resolved_at_jira falls on this UTC day, attributed to status_group at resolve time.';
comment on column public.jira_flow_daily_facts.rules_hash is
  'Stable hash of status mapping used for this row. Mismatch vs current mapping ⇒ rebuild.';
comment on column public.jira_flow_daily_facts.issue_type is
  'jira_issues.issue_type; empty string when null/blank.';

create trigger jira_flow_daily_facts_set_updated_at
before update on public.jira_flow_daily_facts
for each row
execute function public.set_updated_at();

-- Primary dashboard read path: series by integration + day range
create index if not exists jira_flow_daily_facts_integration_day_idx
  on public.jira_flow_daily_facts (integration_id, day);

create index if not exists jira_flow_daily_facts_integration_day_group_idx
  on public.jira_flow_daily_facts (integration_id, day, status_group);

create index if not exists jira_flow_daily_facts_rules_hash_idx
  on public.jira_flow_daily_facts (integration_id, rules_hash);

-- ---------------------------------------------------------------------------
-- RLS (admin / gestor — same pattern as other jira_* analytics tables)
-- ---------------------------------------------------------------------------

alter table public.jira_flow_recompute_runs enable row level security;
alter table public.jira_flow_daily_facts enable row level security;

create policy "jira_flow_recompute_runs_select_admin_gestor"
  on public.jira_flow_recompute_runs for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "jira_flow_recompute_runs_write_admin_gestor"
  on public.jira_flow_recompute_runs for all to authenticated
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

create policy "jira_flow_daily_facts_select_admin_gestor"
  on public.jira_flow_daily_facts for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "jira_flow_daily_facts_write_admin_gestor"
  on public.jira_flow_daily_facts for all to authenticated
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
