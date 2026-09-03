-- Notificações — Fase 3 (Web Push)
-- Subscriptions por perfil + kill switch global.

alter table public.notification_settings
  add column if not exists web_push_enabled boolean not null default true;

create table if not exists public.notification_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint notification_push_subscriptions_endpoint_unique unique (endpoint),
  constraint notification_push_subscriptions_endpoint_not_empty
    check (length(trim(endpoint)) > 0),
  constraint notification_push_subscriptions_p256dh_not_empty
    check (length(trim(p256dh)) > 0),
  constraint notification_push_subscriptions_auth_not_empty
    check (length(trim(auth)) > 0)
);

create index if not exists notification_push_subscriptions_profile_id_idx
  on public.notification_push_subscriptions (profile_id);

create trigger notification_push_subscriptions_set_updated_at
before update on public.notification_push_subscriptions
for each row
execute function public.set_updated_at();

alter table public.notification_push_subscriptions enable row level security;

create policy "notification_push_subscriptions_select_own"
  on public.notification_push_subscriptions
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "notification_push_subscriptions_insert_own"
  on public.notification_push_subscriptions
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "notification_push_subscriptions_update_own"
  on public.notification_push_subscriptions
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "notification_push_subscriptions_delete_own"
  on public.notification_push_subscriptions
  for delete
  to authenticated
  using (profile_id = auth.uid());

grant select, insert, update, delete
  on public.notification_push_subscriptions
  to authenticated;
