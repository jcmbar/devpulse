-- Monthly closing foundation (Phase 1): entity per developer+month, snapshot items, event trail.

create table if not exists public.monthly_closings (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  year_month text not null,
  status text not null default 'open'
    check (status in ('open', 'in_review', 'closed', 'finalized')),
  period_start date not null,
  period_end date not null,
  source_mode text,
  import_id uuid references public.imports (id) on delete set null,
  snapshot_generated_at timestamptz,
  started_at timestamptz,
  submitted_at timestamptz,
  manager_approved_at timestamptz,
  closed_at timestamptz,
  finalized_at timestamptz,
  started_by_user_id uuid references public.profiles (id) on delete set null,
  submitted_by_user_id uuid references public.profiles (id) on delete set null,
  manager_approved_by_user_id uuid references public.profiles (id) on delete set null,
  finalized_by_user_id uuid references public.profiles (id) on delete set null,
  manager_invoice_notes text,
  jira_changed_after_finalized boolean not null default false,
  jira_changed_after_finalized_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint monthly_closings_year_month_format
    check (year_month ~ '^\d{4}-\d{2}$'),
  constraint monthly_closings_period_order
    check (period_end >= period_start)
);

create unique index if not exists monthly_closings_developer_month_uidx
  on public.monthly_closings (developer_id, year_month);

create index if not exists monthly_closings_status_idx
  on public.monthly_closings (status, year_month);

create index if not exists monthly_closings_team_status_idx
  on public.monthly_closings (team_id, status);

comment on table public.monthly_closings is
  'Monthly delivery closing per developer+year_month. Snapshot frozen on submit for gestor review.';

create trigger monthly_closings_set_updated_at
before update on public.monthly_closings
for each row
execute function public.set_updated_at();

-- Snapshot of cards included when developer submits for review.
create table if not exists public.monthly_closing_items (
  id uuid primary key default gen_random_uuid(),
  monthly_closing_id uuid not null
    references public.monthly_closings (id) on delete cascade,
  jira_card_id uuid references public.jira_cards (id) on delete set null,
  jira_key text not null,
  summary text,
  status_name text,
  estimate_hours numeric,
  actual_hours numeric,
  delay_days numeric,
  is_delayed boolean not null default false,
  is_rework boolean not null default false,
  rework_weight numeric not null default 0,
  due_on date,
  unit_test_delivery_on date,
  delay_justification_status text
    check (
      delay_justification_status is null
      or delay_justification_status in ('pending', 'accepted', 'rejected')
    ),
  delay_developer_note text,
  delay_manager_note text,
  rework_justification_status text
    check (
      rework_justification_status is null
      or rework_justification_status in ('pending', 'accepted', 'rejected')
    ),
  rework_developer_note text,
  rework_manager_note text,
  included_in_closing boolean not null default true,
  snapshot_payload_json jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists monthly_closing_items_closing_idx
  on public.monthly_closing_items (monthly_closing_id);

create index if not exists monthly_closing_items_jira_key_idx
  on public.monthly_closing_items (monthly_closing_id, jira_key);

comment on table public.monthly_closing_items is
  'Frozen card snapshot for a monthly closing at submit time. Immutable after finalized (enforced in app).';

-- Audit trail of status transitions and actions.
create table if not exists public.monthly_closing_events (
  id uuid primary key default gen_random_uuid(),
  monthly_closing_id uuid not null
    references public.monthly_closings (id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  actor_user_id uuid references public.profiles (id) on delete set null,
  payload_json jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists monthly_closing_events_closing_idx
  on public.monthly_closing_events (monthly_closing_id, created_at desc);

comment on table public.monthly_closing_events is
  'Event log for monthly closing lifecycle (start, submit, approve, finalize, jira drift, …).';

-- Phase 2 stub: attachments table ready; unused in Phase 1.
create table if not exists public.monthly_closing_attachments (
  id uuid primary key default gen_random_uuid(),
  monthly_closing_id uuid not null
    references public.monthly_closings (id) on delete cascade,
  type text not null check (type in ('invoice_pdf', 'boleto_pdf')),
  file_storage_key text not null,
  original_filename text not null,
  mime_type text not null,
  uploaded_at timestamptz not null default timezone('utc', now()),
  uploaded_by_user_id uuid references public.profiles (id) on delete set null,
  is_valid boolean,
  validated_at timestamptz,
  validated_by_user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint monthly_closing_attachments_one_type_per_closing
    unique (monthly_closing_id, type)
);

comment on table public.monthly_closing_attachments is
  'NF/boleto PDFs for monthly closing (Phase 2). One file per type per closing.';

-- RLS
alter table public.monthly_closings enable row level security;
alter table public.monthly_closing_items enable row level security;
alter table public.monthly_closing_events enable row level security;
alter table public.monthly_closing_attachments enable row level security;

create policy "monthly_closings_select_own_or_managers"
  on public.monthly_closings
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

create policy "monthly_closings_insert_own"
  on public.monthly_closings
  for insert
  to authenticated
  with check (
    developer_id in (
      select d.id from public.developers d where d.profile_id = auth.uid()
    )
    and status = 'open'
  );

create policy "monthly_closings_update_own_open"
  on public.monthly_closings
  for update
  to authenticated
  using (
    developer_id in (
      select d.id from public.developers d where d.profile_id = auth.uid()
    )
    and status in ('open', 'closed')
  )
  with check (
    developer_id in (
      select d.id from public.developers d where d.profile_id = auth.uid()
    )
  );

create policy "monthly_closings_managers_update"
  on public.monthly_closings
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

create policy "monthly_closing_items_select_own_or_managers"
  on public.monthly_closing_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.monthly_closings c
      where c.id = monthly_closing_id
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

create policy "monthly_closing_items_insert_own_open"
  on public.monthly_closing_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.monthly_closings c
      where c.id = monthly_closing_id
        and c.status = 'open'
        and c.developer_id in (
          select d.id from public.developers d where d.profile_id = auth.uid()
        )
    )
  );

create policy "monthly_closing_events_select_own_or_managers"
  on public.monthly_closing_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.monthly_closings c
      where c.id = monthly_closing_id
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

create policy "monthly_closing_events_insert_own_or_managers"
  on public.monthly_closing_events
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.monthly_closings c
      where c.id = monthly_closing_id
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

create policy "monthly_closing_attachments_select_own_or_managers"
  on public.monthly_closing_attachments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.monthly_closings c
      where c.id = monthly_closing_id
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

create policy "monthly_closing_attachments_insert_own_closed"
  on public.monthly_closing_attachments
  for insert
  to authenticated
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
