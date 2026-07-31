-- Jira Cloud read-sync MVP: integrations, sync runs, normalized issues/events/worklogs.
-- Read-only API consumption. No write-back to Jira.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'jira_sync_run_status') then
    create type public.jira_sync_run_status as enum (
      'pending',
      'running',
      'completed',
      'partial',
      'failed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'jira_sync_run_mode') then
    create type public.jira_sync_run_mode as enum (
      'full',
      'incremental'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Integrations (connection + sync cursor; token stays in env via secret_ref)
-- ---------------------------------------------------------------------------

create table if not exists public.jira_integrations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete restrict,
  name text not null,
  base_url text not null,
  email text not null,
  api_token_secret_ref text not null,
  is_enabled boolean not null default false,
  project_keys text[] not null default '{}'::text[],
  jql_extra text,
  sync_window_days integer not null default 90,
  safety_overlap_minutes integer not null default 15,
  include_worklogs boolean not null default true,
  include_changelog boolean not null default true,
  -- Watermark for incremental sync (Jira issue.updated).
  sync_cursor_updated_at timestamptz,
  last_successful_sync_at timestamptz,
  -- Extensible: story_points_field, custom field ids, etc.
  field_mappings jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint jira_integrations_team_unique unique (team_id),
  constraint jira_integrations_base_url_https check (base_url ~* '^https://'),
  constraint jira_integrations_secret_ref_format check (
    api_token_secret_ref ~ '^[A-Z][A-Z0-9_]*$'
  ),
  constraint jira_integrations_window_positive check (sync_window_days between 1 and 730),
  constraint jira_integrations_overlap_nonneg check (safety_overlap_minutes between 0 and 1440)
);

comment on table public.jira_integrations is
  'Jira Cloud connection per team. Raw API tokens live in env named by api_token_secret_ref.';
comment on column public.jira_integrations.sync_cursor_updated_at is
  'Highest issue.updated successfully processed (minus safety overlap on next run).';
comment on column public.jira_integrations.field_mappings is
  'Maps logical fields to Jira custom field ids, e.g. {"story_points":"customfield_10016"}.';

create trigger jira_integrations_set_updated_at
before update on public.jira_integrations
for each row
execute function public.set_updated_at();

create index if not exists jira_integrations_enabled_idx
  on public.jira_integrations (is_enabled)
  where is_enabled = true;

-- ---------------------------------------------------------------------------
-- Sync runs (audit + observability)
-- ---------------------------------------------------------------------------

create table if not exists public.jira_sync_runs (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.jira_integrations (id) on delete cascade,
  mode public.jira_sync_run_mode not null,
  status public.jira_sync_run_status not null default 'pending',
  trigger_source text not null default 'manual',
  started_at timestamptz,
  finished_at timestamptz,
  cursor_from timestamptz,
  cursor_to timestamptz,
  jql text,
  issues_fetched integer not null default 0,
  issues_upserted integer not null default 0,
  status_events_upserted integer not null default 0,
  assignee_events_upserted integer not null default 0,
  worklogs_upserted integer not null default 0,
  pages_fetched integer not null default 0,
  api_requests integer not null default 0,
  error_message text,
  error_details jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.jira_sync_runs is
  'One execution of a Jira read sync. Safe to re-run; upserts are idempotent.';

create trigger jira_sync_runs_set_updated_at
before update on public.jira_sync_runs
for each row
execute function public.set_updated_at();

create index if not exists jira_sync_runs_integration_created_idx
  on public.jira_sync_runs (integration_id, created_at desc);

create index if not exists jira_sync_runs_status_idx
  on public.jira_sync_runs (status);

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

create table if not exists public.jira_projects (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.jira_integrations (id) on delete cascade,
  jira_id text not null,
  key text not null,
  name text not null,
  style text,
  last_synced_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint jira_projects_integration_jira_id_unique unique (integration_id, jira_id),
  constraint jira_projects_integration_key_unique unique (integration_id, key)
);

create trigger jira_projects_set_updated_at
before update on public.jira_projects
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Issues (canonical)
-- ---------------------------------------------------------------------------

create table if not exists public.jira_issues (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.jira_integrations (id) on delete cascade,
  project_id uuid references public.jira_projects (id) on delete set null,
  jira_id text not null,
  jira_key text not null,
  summary text,
  issue_type text,
  status text,
  status_category text,
  priority text,
  labels text[] not null default '{}'::text[],
  assignee_account_id text,
  assignee_display_name text,
  reporter_account_id text,
  story_points numeric,
  created_at_jira timestamptz,
  updated_at_jira timestamptz,
  resolved_at_jira timestamptz,
  content_hash text,
  raw_payload jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint jira_issues_integration_jira_id_unique unique (integration_id, jira_id),
  constraint jira_issues_integration_jira_key_unique unique (integration_id, jira_key)
);

comment on table public.jira_issues is
  'Normalized Jira issues for analytics. Independent from spreadsheet jira_cards batches.';

create trigger jira_issues_set_updated_at
before update on public.jira_issues
for each row
execute function public.set_updated_at();

create index if not exists jira_issues_integration_updated_idx
  on public.jira_issues (integration_id, updated_at_jira desc);

create index if not exists jira_issues_assignee_idx
  on public.jira_issues (integration_id, assignee_account_id);

create index if not exists jira_issues_status_idx
  on public.jira_issues (integration_id, status);

-- ---------------------------------------------------------------------------
-- Status / assignee timeline events (from changelog)
-- ---------------------------------------------------------------------------

create table if not exists public.jira_issue_status_events (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.jira_integrations (id) on delete cascade,
  issue_id uuid not null references public.jira_issues (id) on delete cascade,
  jira_changelog_id text not null,
  from_status text,
  to_status text,
  from_status_id text,
  to_status_id text,
  changed_at timestamptz not null,
  author_account_id text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint jira_issue_status_events_unique
    unique (integration_id, jira_changelog_id, from_status_id, to_status_id, changed_at)
);

create index if not exists jira_issue_status_events_issue_idx
  on public.jira_issue_status_events (issue_id, changed_at);

create table if not exists public.jira_issue_assignee_events (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.jira_integrations (id) on delete cascade,
  issue_id uuid not null references public.jira_issues (id) on delete cascade,
  jira_changelog_id text not null,
  from_account_id text,
  to_account_id text,
  from_display_name text,
  to_display_name text,
  changed_at timestamptz not null,
  author_account_id text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint jira_issue_assignee_events_unique
    unique (integration_id, jira_changelog_id, from_account_id, to_account_id, changed_at)
);

create index if not exists jira_issue_assignee_events_issue_idx
  on public.jira_issue_assignee_events (issue_id, changed_at);

-- ---------------------------------------------------------------------------
-- Worklogs (optional collection)
-- ---------------------------------------------------------------------------

create table if not exists public.jira_worklogs (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.jira_integrations (id) on delete cascade,
  issue_id uuid not null references public.jira_issues (id) on delete cascade,
  jira_worklog_id text not null,
  author_account_id text,
  author_display_name text,
  time_spent_seconds integer not null default 0,
  started_at timestamptz,
  created_at_jira timestamptz,
  updated_at_jira timestamptz,
  comment_text text,
  raw_payload jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint jira_worklogs_integration_worklog_unique
    unique (integration_id, jira_worklog_id)
);

create trigger jira_worklogs_set_updated_at
before update on public.jira_worklogs
for each row
execute function public.set_updated_at();

create index if not exists jira_worklogs_issue_idx
  on public.jira_worklogs (issue_id, started_at);

-- ---------------------------------------------------------------------------
-- RLS (admin/gestor manage; authenticated read for now — tighten later)
-- ---------------------------------------------------------------------------

alter table public.jira_integrations enable row level security;
alter table public.jira_sync_runs enable row level security;
alter table public.jira_projects enable row level security;
alter table public.jira_issues enable row level security;
alter table public.jira_issue_status_events enable row level security;
alter table public.jira_issue_assignee_events enable row level security;
alter table public.jira_worklogs enable row level security;

create policy "jira_integrations_select_admin_gestor"
  on public.jira_integrations for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "jira_integrations_write_admin_gestor"
  on public.jira_integrations for all to authenticated
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

create policy "jira_sync_runs_select_admin_gestor"
  on public.jira_sync_runs for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "jira_sync_runs_write_admin_gestor"
  on public.jira_sync_runs for all to authenticated
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

create policy "jira_projects_select_admin_gestor"
  on public.jira_projects for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "jira_projects_write_admin_gestor"
  on public.jira_projects for all to authenticated
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

create policy "jira_issues_select_admin_gestor"
  on public.jira_issues for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "jira_issues_write_admin_gestor"
  on public.jira_issues for all to authenticated
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

create policy "jira_issue_status_events_select_admin_gestor"
  on public.jira_issue_status_events for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "jira_issue_status_events_write_admin_gestor"
  on public.jira_issue_status_events for all to authenticated
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

create policy "jira_issue_assignee_events_select_admin_gestor"
  on public.jira_issue_assignee_events for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "jira_issue_assignee_events_write_admin_gestor"
  on public.jira_issue_assignee_events for all to authenticated
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

create policy "jira_worklogs_select_admin_gestor"
  on public.jira_worklogs for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "jira_worklogs_write_admin_gestor"
  on public.jira_worklogs for all to authenticated
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
