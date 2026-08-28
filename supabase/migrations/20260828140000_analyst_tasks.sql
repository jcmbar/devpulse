-- Daily work entries recorded in DevPulse by analysts.

create table if not exists public.analyst_tasks (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers (id) on delete cascade,
  description text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null default 'running',
  is_urgent boolean not null default false,
  source text not null default 'devpulse',
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint analyst_tasks_description_not_empty
    check (length(trim(description)) between 1 and 500),
  constraint analyst_tasks_status_valid
    check (status in ('running', 'completed')),
  constraint analyst_tasks_source_valid
    check (source = 'devpulse'),
  constraint analyst_tasks_time_order
    check (ended_at is null or ended_at > started_at),
  constraint analyst_tasks_status_time_consistent
    check (
      (status = 'running' and ended_at is null)
      or (status = 'completed' and ended_at is not null)
    )
);

create index if not exists analyst_tasks_developer_started_at_idx
  on public.analyst_tasks (developer_id, started_at desc)
  where deleted_at is null;

create index if not exists analyst_tasks_started_at_idx
  on public.analyst_tasks (started_at desc)
  where deleted_at is null;

create unique index if not exists analyst_tasks_one_open_per_developer_idx
  on public.analyst_tasks (developer_id)
  where status = 'running' and deleted_at is null;

create trigger analyst_tasks_set_updated_at
before update on public.analyst_tasks
for each row
execute function public.set_updated_at();

alter table public.analyst_tasks enable row level security;

create policy "analyst_tasks_select_own_or_managers"
  on public.analyst_tasks
  for select
  to authenticated
  using (
    public.is_admin_or_gestor()
    or exists (
      select 1
      from public.developers d
      where d.id = analyst_tasks.developer_id
        and d.profile_id = auth.uid()
        and d.job_title = 'analyst'
    )
  );

create policy "analyst_tasks_insert_own_or_managers"
  on public.analyst_tasks
  for insert
  to authenticated
  with check (
    public.is_admin_or_gestor()
    or exists (
      select 1
      from public.developers d
      where d.id = analyst_tasks.developer_id
        and d.profile_id = auth.uid()
        and d.job_title = 'analyst'
    )
  );

create policy "analyst_tasks_update_own_or_managers"
  on public.analyst_tasks
  for update
  to authenticated
  using (
    public.is_admin_or_gestor()
    or exists (
      select 1
      from public.developers d
      where d.id = analyst_tasks.developer_id
        and d.profile_id = auth.uid()
        and d.job_title = 'analyst'
    )
  )
  with check (
    public.is_admin_or_gestor()
    or exists (
      select 1
      from public.developers d
      where d.id = analyst_tasks.developer_id
        and d.profile_id = auth.uid()
        and d.job_title = 'analyst'
    )
  );

-- Managers can access the module; analysts are granted access by linking their
-- profile to a developer with job_title = analyst.
insert into public.profile_module_grants (
  profile_id,
  module,
  can_access,
  can_edit,
  can_delete
)
select
  p.id,
  'analistas',
  true,
  true,
  (p.role = 'admin')
from public.profiles p
where p.role in ('admin', 'gestor')
on conflict (profile_id, module) do nothing;

insert into public.profile_module_grants (
  profile_id,
  module,
  can_access,
  can_edit,
  can_delete
)
select
  d.profile_id,
  'analistas',
  true,
  true,
  false
from public.developers d
where d.profile_id is not null
  and d.job_title = 'analyst'
on conflict (profile_id, module) do nothing;
