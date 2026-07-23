-- Multi-team model: configurable Jira prefixes, import/developer FKs, soft archive.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  jira_key_prefix text not null,
  is_active boolean not null default true,
  -- Future Jira API integration (unused for now; do not store raw API tokens).
  jira_base_url text,
  jira_project_key text,
  jira_email text,
  jira_api_token_secret_ref text,
  jira_integration_enabled boolean not null default false,
  jira_settings jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint teams_code_unique unique (code),
  constraint teams_jira_key_prefix_unique unique (jira_key_prefix),
  constraint teams_code_format check (code ~ '^[A-Z][A-Z0-9_]*$'),
  constraint teams_prefix_format check (jira_key_prefix ~ '^[A-Z][A-Z0-9]*$')
);

comment on table public.teams is
  'Development teams. jira_key_prefix drives import routing; code is holiday/team slug.';
comment on column public.teams.jira_key_prefix is
  'Jira issue key prefix (e.g. AP, PE, ATHOS). Matched from KEY-123.';
comment on column public.teams.jira_api_token_secret_ref is
  'Reference to a secret store/env name — never store the raw API token here.';
comment on column public.teams.jira_settings is
  'Extensible JSON for future Jira integration knobs.';

create trigger teams_set_updated_at
before update on public.teams
for each row
execute function public.set_updated_at();

alter table public.teams enable row level security;

create policy "teams_select_authenticated"
  on public.teams
  for select
  to authenticated
  using (true);

create policy "teams_admin_gestor_write"
  on public.teams
  for all
  to authenticated
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

insert into public.teams (name, code, jira_key_prefix, jira_project_key, is_active)
values
  ('Prime', 'PRIME', 'AP', 'AP', true),
  ('Projetos Especiais', 'PROJETOS_ESPECIAIS', 'PE', 'PE', true),
  ('Premium', 'PREMIUM', 'ATHOS', 'ATHOS', true)
on conflict (code) do nothing;

-- Imports belong to a team; archived_at = soft retention (UI hides archived).
alter table public.imports
  add column if not exists team_id uuid references public.teams (id) on delete restrict,
  add column if not exists archived_at timestamptz;

create index if not exists imports_team_id_idx on public.imports (team_id);
create index if not exists imports_team_active_idx
  on public.imports (team_id, created_at desc)
  where status = 'completed' and archived_at is null;

comment on column public.imports.team_id is
  'Team resolved from Jira key prefix at import time.';
comment on column public.imports.archived_at is
  'Soft archive. Completed imports beyond keep-N per team are archived, not deleted.';

-- Structured team link for developers (team_code kept in sync for holiday matching).
alter table public.developers
  add column if not exists team_id uuid references public.teams (id) on delete set null;

create index if not exists developers_team_id_idx on public.developers (team_id);

comment on column public.developers.team_id is
  'Canonical team. team_code is synced from teams.code for holiday eligibility.';
