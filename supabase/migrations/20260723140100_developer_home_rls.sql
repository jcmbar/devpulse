-- Developers can list completed import periods and read their own cards.

create policy "imports_select_completed"
  on public.imports
  for select
  to authenticated
  using (status = 'completed');

create policy "jira_cards_select_own_developer"
  on public.jira_cards
  for select
  to authenticated
  using (
    developer_id in (
      select d.id
      from public.developers d
      where d.profile_id = auth.uid()
    )
  );
