-- Release history shown in the Versionamento module.

create table if not exists public.app_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  released_at timestamptz not null,
  release_type text not null,
  description text not null,
  commit_descriptions text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint app_releases_version_not_empty check (length(trim(version)) > 0),
  constraint app_releases_type_valid check (
    release_type in ('major', 'minor', 'patch', 'hotfix')
  ),
  constraint app_releases_description_not_empty check (
    length(trim(description)) > 0
  ),
  constraint app_releases_commits_not_empty check (
    length(trim(commit_descriptions)) > 0
  ),
  constraint app_releases_version_unique unique (version)
);

create index if not exists app_releases_released_at_idx
  on public.app_releases (released_at desc);

create trigger app_releases_set_updated_at
before update on public.app_releases
for each row
execute function public.set_updated_at();

alter table public.app_releases enable row level security;

create policy "app_releases_select_authenticated"
  on public.app_releases for select to authenticated
  using (true);

create policy "app_releases_insert_managers"
  on public.app_releases for insert to authenticated
  with check (public.is_admin_or_gestor());

create policy "app_releases_update_managers"
  on public.app_releases for update to authenticated
  using (public.is_admin_or_gestor())
  with check (public.is_admin_or_gestor());

create policy "app_releases_delete_managers"
  on public.app_releases for delete to authenticated
  using (public.is_admin_or_gestor());

-- Existing managers get access to the new module. Developers remain opt-in.
insert into public.profile_module_grants (
  profile_id,
  module,
  can_access,
  can_edit,
  can_delete
)
select
  p.id,
  'versionamento',
  true,
  true,
  (p.role = 'admin')
from public.profiles p
where p.role in ('admin', 'gestor')
on conflict (profile_id, module) do nothing;
