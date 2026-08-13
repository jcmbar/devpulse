-- STG Day V1: multi-team catalog, sessions (with snapshot), runs, findings.
-- Approval policy uses semantic status groups only; Jira aliases live in
-- jira_integrations.settings.status_groups (not duplicated here).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.stg_session_status as enum (
    'draft',
    'planned',
    'in_progress',
    'reviewing',
    'closed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.stg_session_result as enum (
    'pending',
    'approved',
    'blocked',
    'waived'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.stg_participation as enum (
    'required',
    'optional',
    'excluded'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.stg_default_participant_role as enum (
    'required',
    'optional'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.stg_run_status as enum (
    'pending',
    'done',
    'skipped'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.stg_finding_impact as enum (
    'low',
    'medium',
    'high'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table if not exists public.stg_modules (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint stg_modules_team_name_unique unique (team_id, name)
);

comment on table public.stg_modules is
  'STG Day catalog modules per team (reusable across sessions).';

create trigger stg_modules_set_updated_at
before update on public.stg_modules
for each row
execute function public.set_updated_at();

create index if not exists stg_modules_team_idx
  on public.stg_modules (team_id, sort_order, name);

create table if not exists public.stg_scenarios (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.stg_modules (id) on delete cascade,
  name text not null,
  summary text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint stg_scenarios_module_name_unique unique (module_id, name)
);

comment on table public.stg_scenarios is
  'Reusable test scenarios under a team module.';

create trigger stg_scenarios_set_updated_at
before update on public.stg_scenarios
for each row
execute function public.set_updated_at();

create index if not exists stg_scenarios_module_idx
  on public.stg_scenarios (module_id, sort_order, name);

create table if not exists public.stg_team_defaults (
  team_id uuid primary key references public.teams (id) on delete cascade,
  default_environment text not null default 'staging',
  -- Semantic groups only. Example:
  -- {
  --   "safe_status_groups": ["done", "validation"],
  --   "blocking_impacts": ["high"],
  --   "missing_card_blocks_high": true,
  --   "unmapped_or_other_blocks": true
  -- }
  approval_policy jsonb not null default '{
    "safe_status_groups": ["done", "validation"],
    "blocking_impacts": ["high"],
    "missing_card_blocks_high": true,
    "unmapped_or_other_blocks": true
  }'::jsonb,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.stg_team_defaults is
  'Per-team STG defaults. approval_policy uses JiraStatusGroup names only — never literal status aliases.';
comment on column public.stg_team_defaults.approval_policy is
  'STG release gate over semantic groups; aliases live in jira_integrations.settings.status_groups.';

create trigger stg_team_defaults_set_updated_at
before update on public.stg_team_defaults
for each row
execute function public.set_updated_at();

create table if not exists public.stg_default_participants (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  developer_id uuid not null references public.developers (id) on delete cascade,
  role public.stg_default_participant_role not null default 'required',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint stg_default_participants_team_dev_unique unique (team_id, developer_id)
);

create trigger stg_default_participants_set_updated_at
before update on public.stg_default_participants
for each row
execute function public.set_updated_at();

create index if not exists stg_default_participants_team_idx
  on public.stg_default_participants (team_id);

-- ---------------------------------------------------------------------------
-- Sessions + snapshots
-- ---------------------------------------------------------------------------

create table if not exists public.stg_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete restrict,
  scheduled_on date not null,
  version_label text not null,
  environment text not null default 'staging',
  status public.stg_session_status not null default 'planned',
  result public.stg_session_result not null default 'pending',
  scope_notes text,
  approval_policy_snapshot jsonb not null,
  waive_reason text,
  waived_by uuid references public.profiles (id) on delete set null,
  waived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint stg_sessions_team_date_version_unique
    unique (team_id, scheduled_on, version_label),
  constraint stg_sessions_version_label_nonempty
    check (char_length(trim(version_label)) > 0),
  constraint stg_sessions_waive_consistent check (
    (result <> 'waived' and waive_reason is null and waived_by is null and waived_at is null)
    or (result = 'waived' and waive_reason is not null)
  )
);

comment on table public.stg_sessions is
  'One STG Day event per team/date/version. Snapshots freeze catalog + policy at open.';

create trigger stg_sessions_set_updated_at
before update on public.stg_sessions
for each row
execute function public.set_updated_at();

create index if not exists stg_sessions_team_scheduled_idx
  on public.stg_sessions (team_id, scheduled_on desc);

create index if not exists stg_sessions_result_idx
  on public.stg_sessions (team_id, result, status);

create table if not exists public.stg_session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.stg_sessions (id) on delete cascade,
  developer_id uuid not null references public.developers (id) on delete restrict,
  participation public.stg_participation not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint stg_session_participants_unique unique (session_id, developer_id)
);

create trigger stg_session_participants_set_updated_at
before update on public.stg_session_participants
for each row
execute function public.set_updated_at();

create index if not exists stg_session_participants_session_idx
  on public.stg_session_participants (session_id);

create table if not exists public.stg_session_scenarios (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.stg_sessions (id) on delete cascade,
  module_name text not null,
  scenario_name text not null,
  summary text,
  source_scenario_id uuid references public.stg_scenarios (id) on delete set null,
  sort_order integer not null default 0,
  is_included boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint stg_session_scenarios_unique
    unique (session_id, module_name, scenario_name)
);

create trigger stg_session_scenarios_set_updated_at
before update on public.stg_session_scenarios
for each row
execute function public.set_updated_at();

create index if not exists stg_session_scenarios_session_idx
  on public.stg_session_scenarios (session_id, sort_order);

create table if not exists public.stg_scenario_runs (
  id uuid primary key default gen_random_uuid(),
  session_scenario_id uuid not null
    references public.stg_session_scenarios (id) on delete cascade,
  developer_id uuid not null references public.developers (id) on delete restrict,
  status public.stg_run_status not null default 'pending',
  completed_at timestamptz,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint stg_scenario_runs_unique unique (session_scenario_id, developer_id)
);

comment on table public.stg_scenario_runs is
  'Execution cell: one participant × one included session scenario.';

create trigger stg_scenario_runs_set_updated_at
before update on public.stg_scenario_runs
for each row
execute function public.set_updated_at();

create index if not exists stg_scenario_runs_scenario_idx
  on public.stg_scenario_runs (session_scenario_id);

create index if not exists stg_scenario_runs_developer_idx
  on public.stg_scenario_runs (developer_id, status);

create table if not exists public.stg_findings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.stg_sessions (id) on delete cascade,
  session_scenario_id uuid references public.stg_session_scenarios (id) on delete set null,
  title text not null,
  description text,
  found_by_developer_id uuid not null references public.developers (id) on delete restrict,
  impact public.stg_finding_impact not null default 'medium',
  blocks_release boolean not null default false,
  jira_key text,
  jira_issue_id uuid references public.jira_issues (id) on delete set null,
  -- Cached semantic group from classifyStatusGroup at last evaluation (audit).
  status_group_cached text,
  jira_status_cached text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint stg_findings_title_nonempty check (char_length(trim(title)) > 0)
);

comment on table public.stg_findings is
  'STG findings. Release blocking uses impact + Jira status group (via existing status_groups mapping).';

create trigger stg_findings_set_updated_at
before update on public.stg_findings
for each row
execute function public.set_updated_at();

create index if not exists stg_findings_session_idx
  on public.stg_findings (session_id, impact);

create index if not exists stg_findings_jira_key_idx
  on public.stg_findings (jira_key)
  where jira_key is not null;

create index if not exists stg_findings_jira_issue_idx
  on public.stg_findings (jira_issue_id)
  where jira_issue_id is not null;

-- ---------------------------------------------------------------------------
-- Seed defaults for existing teams
-- ---------------------------------------------------------------------------

insert into public.stg_team_defaults (team_id)
select t.id
from public.teams t
where t.is_active = true
on conflict (team_id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS (admin/gestor — same pattern as Jira admin module for V1)
-- ---------------------------------------------------------------------------

alter table public.stg_modules enable row level security;
alter table public.stg_scenarios enable row level security;
alter table public.stg_team_defaults enable row level security;
alter table public.stg_default_participants enable row level security;
alter table public.stg_sessions enable row level security;
alter table public.stg_session_participants enable row level security;
alter table public.stg_session_scenarios enable row level security;
alter table public.stg_scenario_runs enable row level security;
alter table public.stg_findings enable row level security;

create policy "stg_modules_select_admin_gestor"
  on public.stg_modules for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "stg_modules_write_admin_gestor"
  on public.stg_modules for all to authenticated
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

create policy "stg_scenarios_select_admin_gestor"
  on public.stg_scenarios for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "stg_scenarios_write_admin_gestor"
  on public.stg_scenarios for all to authenticated
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

create policy "stg_team_defaults_select_admin_gestor"
  on public.stg_team_defaults for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "stg_team_defaults_write_admin_gestor"
  on public.stg_team_defaults for all to authenticated
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

create policy "stg_default_participants_select_admin_gestor"
  on public.stg_default_participants for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "stg_default_participants_write_admin_gestor"
  on public.stg_default_participants for all to authenticated
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

create policy "stg_sessions_select_admin_gestor"
  on public.stg_sessions for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "stg_sessions_write_admin_gestor"
  on public.stg_sessions for all to authenticated
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

create policy "stg_session_participants_select_admin_gestor"
  on public.stg_session_participants for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "stg_session_participants_write_admin_gestor"
  on public.stg_session_participants for all to authenticated
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

create policy "stg_session_scenarios_select_admin_gestor"
  on public.stg_session_scenarios for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "stg_session_scenarios_write_admin_gestor"
  on public.stg_session_scenarios for all to authenticated
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

create policy "stg_scenario_runs_select_admin_gestor"
  on public.stg_scenario_runs for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "stg_scenario_runs_write_admin_gestor"
  on public.stg_scenario_runs for all to authenticated
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

create policy "stg_findings_select_admin_gestor"
  on public.stg_findings for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "stg_findings_write_admin_gestor"
  on public.stg_findings for all to authenticated
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
