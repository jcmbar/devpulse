-- Fix infinite recursion on profiles RLS.
-- profiles_admin_gestor_select queried public.profiles inside a profiles policy,
-- which re-entered RLS evaluation forever.

create or replace function public.is_admin_or_gestor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'gestor')
  );
$$;

comment on function public.is_admin_or_gestor() is
  'RLS helper: reads caller role with SECURITY DEFINER to avoid profiles policy recursion.';

revoke all on function public.is_admin_or_gestor() from public;
grant execute on function public.is_admin_or_gestor() to authenticated;

drop policy if exists "profiles_admin_gestor_select" on public.profiles;

create policy "profiles_admin_gestor_select"
  on public.profiles
  for select
  to authenticated
  using (public.is_admin_or_gestor());
