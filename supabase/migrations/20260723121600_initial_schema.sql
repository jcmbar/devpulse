-- DevPulse initial schema
-- Replaces the JIRA-linked productivity spreadsheet with structured data.
-- RLS is enabled with minimal bootstrap policies; role-based rules come later.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'gestor', 'dev');

create type public.import_status as enum (
  'pending',
  'processing',
  'completed',
  'failed'
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- Auth users extended with app role and display data.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'dev',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index profiles_role_idx on public.profiles (role);
create index profiles_email_idx on public.profiles (email);

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

comment on table public.profiles is
  'App profile linked 1:1 with auth.users. Roles: admin, gestor, dev.';

-- Keep profile in sync when a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_role public.user_role := 'dev';
begin
  if new.raw_user_meta_data ->> 'role' in ('admin', 'gestor', 'dev') then
    selected_role := (new.raw_user_meta_data ->> 'role')::public.user_role;
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    selected_role
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- developers
-- People tracked for productivity (may or may not have a login profile yet).
-- ---------------------------------------------------------------------------
create table public.developers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles (id) on delete set null,
  full_name text not null,
  email text,
  jira_account_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index developers_profile_id_idx on public.developers (profile_id);
create index developers_email_idx on public.developers (email);
create index developers_is_active_idx on public.developers (is_active);

create trigger developers_set_updated_at
before update on public.developers
for each row
execute function public.set_updated_at();

comment on table public.developers is
  'Developer entities for personal areas and JIRA ownership. Optional link to profiles.';

-- ---------------------------------------------------------------------------
-- imports
-- Each JIRA (or spreadsheet) import run for a given period.
-- ---------------------------------------------------------------------------
create table public.imports (
  id uuid primary key default gen_random_uuid(),
  imported_by uuid references public.profiles (id) on delete set null,
  period_start date not null,
  period_end date not null,
  source text not null default 'jira',
  status public.import_status not null default 'pending',
  source_label text,
  records_count integer not null default 0,
  notes text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint imports_period_valid check (period_end >= period_start)
);

create index imports_period_idx on public.imports (period_start, period_end);
create index imports_status_idx on public.imports (status);
create index imports_imported_by_idx on public.imports (imported_by);

create trigger imports_set_updated_at
before update on public.imports
for each row
execute function public.set_updated_at();

comment on table public.imports is
  'Import batches from JIRA (or legacy spreadsheet) scoped to a period.';

-- ---------------------------------------------------------------------------
-- jira_cards
-- Individual cards/issues imported for productivity analysis.
-- ---------------------------------------------------------------------------
create table public.jira_cards (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.imports (id) on delete cascade,
  developer_id uuid references public.developers (id) on delete set null,
  jira_key text not null,
  parent_key text,
  parent_id uuid references public.jira_cards (id) on delete set null,
  summary text,
  status text,
  categories text[] not null default '{}',
  estimate_hours numeric(12, 2),
  time_spent_hours numeric(12, 2),
  difference_hours numeric(12, 2),
  delay_days numeric(10, 2),
  started_on date,
  due_on date,
  completed_on date,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint jira_cards_unique_per_import unique (import_id, jira_key)
);

create index jira_cards_import_id_idx on public.jira_cards (import_id);
create index jira_cards_developer_id_idx on public.jira_cards (developer_id);
create index jira_cards_jira_key_idx on public.jira_cards (jira_key);
create index jira_cards_parent_key_idx on public.jira_cards (parent_key);
create index jira_cards_status_idx on public.jira_cards (status);
create index jira_cards_categories_idx on public.jira_cards using gin (categories);

create trigger jira_cards_set_updated_at
before update on public.jira_cards
for each row
execute function public.set_updated_at();

comment on table public.jira_cards is
  'JIRA cards imported per batch. Stores spreadsheet-equivalent fields plus raw payload.';
comment on column public.jira_cards.developer_id is 'Responsible developer (responsável).';
comment on column public.jira_cards.difference_hours is
  'Difference between estimate and time spent, as provided by the source.';
comment on column public.jira_cards.delay_days is
  'Delay relative to due date / expected completion, as provided by the source.';
comment on column public.jira_cards.raw_payload is
  'Original imported row/payload for traceability and future field mapping.';

-- ---------------------------------------------------------------------------
-- productivity_snapshots
-- Consolidated metrics per developer and period.
-- ---------------------------------------------------------------------------
create table public.productivity_snapshots (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers (id) on delete cascade,
  import_id uuid references public.imports (id) on delete set null,
  period_start date not null,
  period_end date not null,
  cards_count integer not null default 0,
  completed_cards_count integer not null default 0,
  delayed_cards_count integer not null default 0,
  total_estimate_hours numeric(12, 2) not null default 0,
  total_time_spent_hours numeric(12, 2) not null default 0,
  total_difference_hours numeric(12, 2) not null default 0,
  total_delay_days numeric(12, 2) not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint productivity_snapshots_period_valid check (period_end >= period_start),
  constraint productivity_snapshots_unique_period
    unique (developer_id, period_start, period_end)
);

create index productivity_snapshots_developer_id_idx
  on public.productivity_snapshots (developer_id);
create index productivity_snapshots_import_id_idx
  on public.productivity_snapshots (import_id);
create index productivity_snapshots_period_idx
  on public.productivity_snapshots (period_start, period_end);

create trigger productivity_snapshots_set_updated_at
before update on public.productivity_snapshots
for each row
execute function public.set_updated_at();

comment on table public.productivity_snapshots is
  'Period metrics per developer for reports. Extra metrics can live in metrics JSON.';

-- ---------------------------------------------------------------------------
-- Row Level Security (prepared, intentionally minimal)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.developers enable row level security;
alter table public.imports enable row level security;
alter table public.jira_cards enable row level security;
alter table public.productivity_snapshots enable row level security;

-- Bootstrap: authenticated users can read/update their own profile.
-- Future policies (role-based):
--   - admin: full access
--   - gestor: read developers/cards/snapshots under their scope
--   - dev: read own developer area, own cards and snapshots
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Intentionally no broad policies yet on developers / imports / jira_cards /
-- productivity_snapshots. Service role (server imports & admin jobs) bypasses RLS.
-- Add role-aware policies before exposing these tables to the browser client.
