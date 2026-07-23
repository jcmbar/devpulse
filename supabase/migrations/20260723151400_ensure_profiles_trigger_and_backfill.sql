-- Ensure auth.users → public.profiles automation exists and backfill gaps.
-- Users created before the trigger (or if the trigger was missing) leave
-- Authentication populated while public.profiles stays empty — breaking link UI.

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
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    selected_role
  )
  on conflict (id) do update
    set
      email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- Backfill profiles for auth users that never got a row.
insert into public.profiles (id, email, full_name, role)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name'
  ),
  case
    when u.raw_user_meta_data ->> 'role' in ('admin', 'gestor', 'dev')
      then (u.raw_user_meta_data ->> 'role')::public.user_role
    else 'dev'::public.user_role
  end
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
);
