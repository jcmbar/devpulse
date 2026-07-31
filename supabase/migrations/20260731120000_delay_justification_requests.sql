-- Delay justification / acceptance overlay (does not mutate Compilado card delay).

create table if not exists public.delay_justification_requests (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.imports (id) on delete cascade,
  jira_card_id uuid references public.jira_cards (id) on delete set null,
  jira_key text not null,
  developer_id uuid not null references public.developers (id) on delete cascade,
  kind text not null default 'delay' check (kind in ('delay')),
  due_on date,
  unit_test_delivery_on date,
  delay_days numeric,
  requester_profile_id uuid not null references public.profiles (id) on delete cascade,
  developer_note text not null,
  requested_at timestamptz not null default timezone('utc', now()),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  reviewer_profile_id uuid references public.profiles (id) on delete set null,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint delay_justification_developer_note_nonempty
    check (length(trim(developer_note)) > 0),
  constraint delay_justification_reviewer_note_when_decided
    check (
      status = 'pending'
      or (reviewer_note is not null and length(trim(reviewer_note)) > 0)
    )
);

create unique index if not exists delay_justification_one_pending_idx
  on public.delay_justification_requests (import_id, jira_key, developer_id)
  where status = 'pending';

create unique index if not exists delay_justification_one_accepted_idx
  on public.delay_justification_requests (import_id, jira_key, developer_id)
  where status = 'accepted';

create index if not exists delay_justification_import_status_idx
  on public.delay_justification_requests (import_id, status);

create index if not exists delay_justification_developer_idx
  on public.delay_justification_requests (developer_id, status);

create index if not exists delay_justification_jira_key_idx
  on public.delay_justification_requests (import_id, jira_key);

comment on table public.delay_justification_requests is
  'Audit trail for delay justifications: developer requests review; gestor accepts/rejects. Accepted delays are excluded from net Gestor ranking only.';

comment on column public.delay_justification_requests.import_id is
  'Compilado batch (snapshot). Rematerialize creates a new import_id — acceptances do not carry over.';

create trigger delay_justification_requests_set_updated_at
before update on public.delay_justification_requests
for each row
execute function public.set_updated_at();

alter table public.delay_justification_requests enable row level security;

-- Developers: read own requests (via linked developer profile).
create policy "delay_justification_select_own_or_managers"
  on public.delay_justification_requests
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
    or developer_id in (
      select d.id from public.developers d where d.profile_id = auth.uid()
    )
  );

-- Developers: create requests for themselves.
create policy "delay_justification_insert_own"
  on public.delay_justification_requests
  for insert
  to authenticated
  with check (
    requester_profile_id = auth.uid()
    and developer_id in (
      select d.id from public.developers d where d.profile_id = auth.uid()
    )
    and status = 'pending'
  );

-- Developers: edit own note while pending.
create policy "delay_justification_update_own_pending_note"
  on public.delay_justification_requests
  for update
  to authenticated
  using (
    status = 'pending'
    and developer_id in (
      select d.id from public.developers d where d.profile_id = auth.uid()
    )
  )
  with check (
    status = 'pending'
    and developer_id in (
      select d.id from public.developers d where d.profile_id = auth.uid()
    )
  );

-- Managers: decide (accept/reject).
create policy "delay_justification_managers_decide"
  on public.delay_justification_requests
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
