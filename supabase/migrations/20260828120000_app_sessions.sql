-- Track authenticated browser sessions for the People administration view.
-- Session activity is written server-side; raw session identifiers never leave
-- the httpOnly cookie or are exposed to the client.

create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint app_sessions_dates_consistent check (
    ended_at is null or ended_at >= started_at
  )
);

create index if not exists app_sessions_profile_last_seen_idx
  on public.app_sessions (profile_id, last_seen_at desc);

alter table public.app_sessions enable row level security;

create policy "app_sessions_select_admin_gestor"
  on public.app_sessions for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );
