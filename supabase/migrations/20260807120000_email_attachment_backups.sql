-- Backup copies of PDFs attached to Financeiro/RH operational emails.
-- Hosted storage (not a Mac folder): path YYYY/YYYY-MM/Financeiro|RH/<friendly>.pdf

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'email-attachment-backups',
  'email-attachment-backups',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update
set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Reads for admin/gestor only. Writes go through service role (createAdminClient).
create policy "email_attachment_backups_select_admin_gestor"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'email-attachment-backups'
    and public.is_admin_or_gestor()
  );

create table if not exists public.email_dispatch_attachment_backups (
  id uuid primary key default gen_random_uuid(),
  email_dispatch_id uuid not null
    references public.email_dispatches (id) on delete cascade,
  monthly_closing_id uuid not null
    references public.monthly_closings (id) on delete cascade,
  developer_id uuid not null
    references public.developers (id) on delete cascade,
  send_type_code text not null
    check (send_type_code in ('financeiro', 'rh')),
  attachment_type text not null
    check (attachment_type in ('invoice_pdf', 'boleto_pdf', 'meal_pix_receipt')),
  year_month text not null,
  storage_path text not null,
  filename text not null,
  mime_type text not null default 'application/pdf',
  byte_size integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint email_dispatch_attachment_backups_dispatch_type_unique
    unique (email_dispatch_id, attachment_type),
  constraint email_dispatch_attachment_backups_storage_path_unique
    unique (storage_path)
);

comment on table public.email_dispatch_attachment_backups is
  'Cópia arquivada dos PDFs enviados por e-mail (Financeiro/RH), com nome amigável.';

create index if not exists email_dispatch_attachment_backups_month_audience_idx
  on public.email_dispatch_attachment_backups (year_month, send_type_code);

create index if not exists email_dispatch_attachment_backups_closing_idx
  on public.email_dispatch_attachment_backups (monthly_closing_id);

create trigger email_dispatch_attachment_backups_set_updated_at
before update on public.email_dispatch_attachment_backups
for each row
execute function public.set_updated_at();

alter table public.email_dispatch_attachment_backups enable row level security;

create policy "email_dispatch_attachment_backups_select_admin_gestor"
  on public.email_dispatch_attachment_backups
  for select
  to authenticated
  using (public.is_admin_or_gestor());

create policy "email_dispatch_attachment_backups_all_admin_gestor"
  on public.email_dispatch_attachment_backups
  for all
  to authenticated
  using (public.is_admin_or_gestor())
  with check (public.is_admin_or_gestor());
