-- Central de notificações — Fase 1
-- Inbox in-app, campanhas manuais/automáticas e configurações do gestor.

create table if not exists public.notification_settings (
  id integer primary key default 1 check (id = 1),
  closing_pending_after_day integer not null default 25
    check (closing_pending_after_day between 1 and 28),
  holiday_reminder_days_before integer not null default 3
    check (holiday_reminder_days_before between 0 and 30),
  closing_pending_enabled boolean not null default true,
  justification_decision_enabled boolean not null default true,
  closing_status_enabled boolean not null default true,
  password_changed_enabled boolean not null default true,
  stg_status_enabled boolean not null default true,
  holiday_upcoming_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.notification_settings (id)
values (1)
on conflict (id) do nothing;

create trigger notification_settings_set_updated_at
before update on public.notification_settings
for each row
execute function public.set_updated_at();

create table if not exists public.notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  trigger_type text not null,
  title text not null,
  body text not null,
  href text,
  audience_type text not null,
  audience_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint notification_campaigns_source_valid
    check (source in ('manual', 'automatic')),
  constraint notification_campaigns_trigger_type_valid
    check (
      trigger_type in (
        'manual',
        'closing_pending',
        'justification_decided',
        'closing_status',
        'password_changed',
        'stg_status',
        'holiday_upcoming'
      )
    ),
  constraint notification_campaigns_audience_type_valid
    check (audience_type in ('all', 'team', 'users')),
  constraint notification_campaigns_title_not_empty
    check (length(trim(title)) between 1 and 160),
  constraint notification_campaigns_body_not_empty
    check (length(trim(body)) between 1 and 4000)
);

create index if not exists notification_campaigns_created_at_idx
  on public.notification_campaigns (created_at desc);

create index if not exists notification_campaigns_trigger_type_idx
  on public.notification_campaigns (trigger_type, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.notification_campaigns (id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  href text,
  trigger_type text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint notifications_title_not_empty
    check (length(trim(title)) between 1 and 160),
  constraint notifications_body_not_empty
    check (length(trim(body)) between 1 and 4000),
  constraint notifications_trigger_type_valid
    check (
      trigger_type in (
        'manual',
        'closing_pending',
        'justification_decided',
        'closing_status',
        'password_changed',
        'stg_status',
        'holiday_upcoming'
      )
    )
);

create index if not exists notifications_recipient_created_at_idx
  on public.notifications (recipient_profile_id, created_at desc);

create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_profile_id, created_at desc)
  where read_at is null;

create index if not exists notifications_campaign_id_idx
  on public.notifications (campaign_id);

alter table public.notification_settings enable row level security;
alter table public.notification_campaigns enable row level security;
alter table public.notifications enable row level security;

create policy "notification_settings_select_managers"
  on public.notification_settings
  for select
  to authenticated
  using (public.is_admin_or_gestor());

create policy "notification_settings_update_managers"
  on public.notification_settings
  for update
  to authenticated
  using (public.is_admin_or_gestor())
  with check (public.is_admin_or_gestor());

create policy "notification_campaigns_select_managers"
  on public.notification_campaigns
  for select
  to authenticated
  using (public.is_admin_or_gestor());

create policy "notification_campaigns_insert_managers"
  on public.notification_campaigns
  for insert
  to authenticated
  with check (public.is_admin_or_gestor());

create policy "notifications_select_own_or_managers"
  on public.notifications
  for select
  to authenticated
  using (
    public.is_admin_or_gestor()
    or recipient_profile_id = auth.uid()
  );

create policy "notifications_insert_managers"
  on public.notifications
  for insert
  to authenticated
  with check (public.is_admin_or_gestor());

create policy "notifications_update_own_read"
  on public.notifications
  for update
  to authenticated
  using (recipient_profile_id = auth.uid())
  with check (recipient_profile_id = auth.uid());

-- Gestores/admins recebem o módulo Notificações por padrão.
insert into public.profile_module_grants (
  profile_id,
  module,
  can_access,
  can_edit,
  can_delete
)
select
  p.id,
  'notificacoes',
  true,
  true,
  (p.role = 'admin')
from public.profiles p
where p.role in ('admin', 'gestor')
on conflict (profile_id, module) do nothing;
