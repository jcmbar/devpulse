-- Allow admin/gestor to run spreadsheet imports and manage related rows.

create policy "imports_admin_gestor_select"
  on public.imports
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

create policy "imports_admin_gestor_insert"
  on public.imports
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'gestor')
    )
  );

create policy "imports_admin_gestor_update"
  on public.imports
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

create policy "jira_cards_admin_gestor_select"
  on public.jira_cards
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

create policy "jira_cards_admin_gestor_insert"
  on public.jira_cards
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'gestor')
    )
  );

-- Import may create developers from the "responsável" column.
create policy "developers_admin_gestor_select"
  on public.developers
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

create policy "developers_admin_gestor_insert"
  on public.developers
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'gestor')
    )
  );
