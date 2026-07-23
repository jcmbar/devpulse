-- Admin/gestor can fully manage developers and look up profiles to link.

create policy "developers_admin_gestor_update"
  on public.developers
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'gestor')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'gestor')
    )
  );

create policy "profiles_admin_gestor_select"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'gestor')
    )
  );
