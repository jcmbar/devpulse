-- Audit / review queue for team_id backfill (imports + developers).

create table if not exists public.team_assignment_reviews (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('import', 'developer')),
  entity_id uuid not null,
  status text not null check (
    status in ('pending', 'auto_assigned', 'manual_assigned', 'skipped')
  ),
  suggested_team_id uuid references public.teams (id) on delete set null,
  assigned_team_id uuid references public.teams (id) on delete set null,
  reason text not null,
  evidence jsonb not null default '{}'::jsonb,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint team_assignment_reviews_entity_unique unique (entity_type, entity_id)
);

create index if not exists team_assignment_reviews_status_idx
  on public.team_assignment_reviews (status, entity_type);

create index if not exists team_assignment_reviews_entity_idx
  on public.team_assignment_reviews (entity_type, entity_id);

comment on table public.team_assignment_reviews is
  'Audit trail for team_id sanitation: auto backfill, pending review, manual assignment.';

create trigger team_assignment_reviews_set_updated_at
before update on public.team_assignment_reviews
for each row
execute function public.set_updated_at();

alter table public.team_assignment_reviews enable row level security;

create policy "team_assignment_reviews_select_managers"
  on public.team_assignment_reviews
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "team_assignment_reviews_admin_gestor_write"
  on public.team_assignment_reviews
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
