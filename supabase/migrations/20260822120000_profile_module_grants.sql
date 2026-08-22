-- Per-profile module grants (Access / Edit / Delete matrix).
-- profiles.role remains the coarse ceiling for RLS (synced on save).

create table if not exists public.profile_module_grants (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  module text not null,
  can_access boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (profile_id, module),
  constraint profile_module_grants_edit_implies_access
    check (not can_edit or can_access),
  constraint profile_module_grants_delete_implies_edit
    check (not can_delete or can_edit)
);

create index if not exists profile_module_grants_module_idx
  on public.profile_module_grants (module);

comment on table public.profile_module_grants is
  'Per-user module privileges (access/edit/delete). Catalog of module keys lives in app code.';

create trigger profile_module_grants_set_updated_at
before update on public.profile_module_grants
for each row
execute function public.set_updated_at();

alter table public.profile_module_grants enable row level security;

-- Own grants: read only.
create policy "profile_module_grants_select_own"
  on public.profile_module_grants
  for select
  to authenticated
  using (profile_id = auth.uid());

-- Managers: full read of all grants.
create policy "profile_module_grants_select_managers"
  on public.profile_module_grants
  for select
  to authenticated
  using (public.is_admin_or_gestor());

create policy "profile_module_grants_insert_managers"
  on public.profile_module_grants
  for insert
  to authenticated
  with check (public.is_admin_or_gestor());

create policy "profile_module_grants_update_managers"
  on public.profile_module_grants
  for update
  to authenticated
  using (public.is_admin_or_gestor())
  with check (public.is_admin_or_gestor());

create policy "profile_module_grants_delete_managers"
  on public.profile_module_grants
  for delete
  to authenticated
  using (public.is_admin_or_gestor());

-- Backfill from profiles.role for current catalog modules.
-- admin → access+edit+delete; gestor → access+edit; dev → no rows.
insert into public.profile_module_grants (
  profile_id,
  module,
  can_access,
  can_edit,
  can_delete
)
select
  p.id,
  m.module,
  true,
  true,
  (p.role = 'admin')
from public.profiles p
cross join (
  values
    ('gestor'),
    ('pessoas'),
    ('jira'),
    ('stg'),
    ('emails'),
    ('empresas'),
    ('feriados'),
    ('imports'),
    ('times')
) as m(module)
where p.role in ('admin', 'gestor')
on conflict (profile_id, module) do nothing;
