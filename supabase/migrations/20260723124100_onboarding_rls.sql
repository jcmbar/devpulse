-- Minimal RLS to support /app onboarding:
-- create or link a developers row for the authenticated user.

create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "developers_select_own_or_unlinked_email"
  on public.developers
  for select
  to authenticated
  using (
    profile_id = auth.uid()
    or (
      profile_id is null
      and email is not null
      and lower(email) = lower((select p.email from public.profiles p where p.id = auth.uid()))
    )
  );

create policy "developers_insert_own"
  on public.developers
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "developers_update_own_or_link_by_email"
  on public.developers
  for update
  to authenticated
  using (
    profile_id = auth.uid()
    or (
      profile_id is null
      and email is not null
      and lower(email) = lower((select p.email from public.profiles p where p.id = auth.uid()))
    )
  )
  with check (
    profile_id = auth.uid()
  );
