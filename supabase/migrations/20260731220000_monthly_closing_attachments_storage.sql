-- Phase 2: storage bucket for monthly closing PDFs + manager attachment policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'monthly-closing-attachments',
  'monthly-closing-attachments',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update
set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: {closing_id}/{type}.pdf  (type = invoice_pdf | boleto_pdf)

create policy "monthly_closing_storage_select_own_or_managers"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'monthly-closing-attachments'
    and exists (
      select 1
      from public.monthly_closings c
      where c.id::text = (storage.foldername(name))[1]
        and (
          exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role in ('admin', 'gestor')
          )
          or c.developer_id in (
            select d.id from public.developers d where d.profile_id = auth.uid()
          )
        )
    )
  );

create policy "monthly_closing_storage_insert_own_closed"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'monthly-closing-attachments'
    and exists (
      select 1
      from public.monthly_closings c
      where c.id::text = (storage.foldername(name))[1]
        and c.status = 'closed'
        and c.developer_id in (
          select d.id from public.developers d where d.profile_id = auth.uid()
        )
    )
  );

create policy "monthly_closing_storage_update_own_closed"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'monthly-closing-attachments'
    and exists (
      select 1
      from public.monthly_closings c
      where c.id::text = (storage.foldername(name))[1]
        and c.status = 'closed'
        and c.developer_id in (
          select d.id from public.developers d where d.profile_id = auth.uid()
        )
    )
  )
  with check (
    bucket_id = 'monthly-closing-attachments'
    and exists (
      select 1
      from public.monthly_closings c
      where c.id::text = (storage.foldername(name))[1]
        and c.status = 'closed'
        and c.developer_id in (
          select d.id from public.developers d where d.profile_id = auth.uid()
        )
    )
  );

-- Managers may update attachment validation flags.
create policy "monthly_closing_attachments_managers_update"
  on public.monthly_closing_attachments
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

-- Developers may replace their own attachment metadata while closed.
create policy "monthly_closing_attachments_update_own_closed"
  on public.monthly_closing_attachments
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.monthly_closings c
      where c.id = monthly_closing_id
        and c.status = 'closed'
        and c.developer_id in (
          select d.id from public.developers d where d.profile_id = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.monthly_closings c
      where c.id = monthly_closing_id
        and c.status = 'closed'
        and c.developer_id in (
          select d.id from public.developers d where d.profile_id = auth.uid()
        )
    )
  );

comment on column public.monthly_closings.manager_invoice_notes is
  'Free-text notes from gestor for invoice emission (set on approve → closed).';
