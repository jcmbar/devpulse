-- Allow admin/gestor to delete developers (UI also uses service role for Auth cleanup).

create policy "developers_admin_gestor_delete"
  on public.developers
  for delete
  to authenticated
  using (public.is_admin_or_gestor());
