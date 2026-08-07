-- Phase 3: sensitive access audit log + storage DELETE policies.
-- Audit rows are written via service role from the app (never block main flows).

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

comment on function public.is_admin() is
  'True when the authenticated user has profiles.role = admin.';

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.sensitive_access_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  year_month text,
  result text not null
    check (result in ('success', 'denied', 'error', 'rate_limited')),
  error_code text,
  origin text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint sensitive_access_audit_logs_action_nonempty
    check (char_length(trim(action)) > 0),
  constraint sensitive_access_audit_logs_resource_type_nonempty
    check (char_length(trim(resource_type)) > 0)
);

comment on table public.sensitive_access_audit_logs is
  'Auditoria de acessos sensíveis (PDFs, backups, e-mails, roles). Sem conteúdo de arquivo, URL assinada, tokens ou senhas.';

comment on column public.sensitive_access_audit_logs.metadata is
  'Campos seguros apenas (ex.: attachment_type, send_type_code, role_from/to). Nunca storage_path, URL, PDF ou secrets.';

create index if not exists sensitive_access_audit_logs_created_at_idx
  on public.sensitive_access_audit_logs (created_at desc);

create index if not exists sensitive_access_audit_logs_actor_idx
  on public.sensitive_access_audit_logs (actor_user_id, created_at desc);

create index if not exists sensitive_access_audit_logs_action_idx
  on public.sensitive_access_audit_logs (action, created_at desc);

alter table public.sensitive_access_audit_logs enable row level security;

-- Authenticated users cannot insert/update/delete (app uses service role).
-- Only admins may read full logs.
create policy "sensitive_access_audit_logs_select_admin"
  on public.sensitive_access_audit_logs
  for select
  to authenticated
  using (public.is_admin());

-- Storage DELETE: closing attachments — owner (same rules as update) or managers.
create policy "monthly_closing_storage_delete_own_or_managers"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'monthly-closing-attachments'
    and exists (
      select 1
      from public.monthly_closings c
      where c.id::text = (storage.foldername(name))[1]
        and (
          public.is_admin_or_gestor()
          or (
            c.developer_id in (
              select d.id from public.developers d where d.profile_id = auth.uid()
            )
            and (
              c.status = 'closed'
              or (
                c.status = 'finalized'
                and name like '%/meal_pix_receipt.pdf'
              )
            )
          )
        )
    )
  );

-- Email backups: no authenticated DELETE (service role only). Explicit deny via absence of policy.
comment on table public.email_dispatch_attachment_backups is
  'Cópia arquivada dos PDFs enviados por e-mail (Financeiro/RH). Downloads via URL assinada curta após requireTeamAccess. Qualquer gestor/admin pode listar todos os backups (decisão de ops — não restringir por time sem alinhamento explícito).';
