-- Compilado rules support: delivery date, rework, capacity, richer snapshots.

-- ---------------------------------------------------------------------------
-- jira_cards: delivery for unit test + rework metadata
-- ---------------------------------------------------------------------------
alter table public.jira_cards
  add column if not exists unit_test_delivery_on date,
  add column if not exists is_rework boolean not null default false,
  add column if not exists rework_weight numeric(4, 2) not null default 0;

comment on column public.jira_cards.unit_test_delivery_on is
  'Entrega p/ Teste Unitário — used as period filter and delay endpoint.';
comment on column public.jira_cards.completed_on is
  'Optional completion/resolution date from other spreadsheet columns.';
comment on column public.jira_cards.delay_days is
  'Business-day delay between due_on and unit_test_delivery_on (NETWORKDAYS.INTL equivalent).';
comment on column public.jira_cards.is_rework is
  'True when categories contain Retrabalho / Retrabalho2x / Retrabalho3x.';
comment on column public.jira_cards.rework_weight is
  'Rework intensity: 0 none, 1 Retrabalho, 2 Retrabalho2x, 3 Retrabalho3x.';

create index if not exists jira_cards_unit_test_delivery_on_idx
  on public.jira_cards (unit_test_delivery_on);

create index if not exists jira_cards_is_rework_idx
  on public.jira_cards (is_rework);

-- Backfill delivery from completed_on when available (legacy imports).
update public.jira_cards
set unit_test_delivery_on = completed_on
where unit_test_delivery_on is null
  and completed_on is not null;

-- ---------------------------------------------------------------------------
-- capacity_weekday_hours: monthly hour target configuration (Mon=1 … Sun=7)
-- ---------------------------------------------------------------------------
create table if not exists public.capacity_weekday_hours (
  weekday smallint primary key check (weekday between 1 and 7),
  hours_per_day numeric(5, 2) not null check (hours_per_day >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.capacity_weekday_hours is
  'Default hours per weekday used to compute monthly capacity (ISO: 1=Mon … 7=Sun).';

insert into public.capacity_weekday_hours (weekday, hours_per_day)
values
  (1, 8), -- Mon
  (2, 8), -- Tue
  (3, 8), -- Wed
  (4, 6), -- Thu
  (5, 6), -- Fri
  (6, 0), -- Sat
  (7, 0)  -- Sun
on conflict (weekday) do nothing;

create trigger capacity_weekday_hours_set_updated_at
before update on public.capacity_weekday_hours
for each row
execute function public.set_updated_at();

-- Optional per-developer monthly override (replaces external Excel links).
create table if not exists public.developer_monthly_capacity (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers (id) on delete cascade,
  year integer not null check (year >= 2000),
  month integer not null check (month between 1 and 12),
  required_hours numeric(10, 2) not null check (required_hours >= 0),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint developer_monthly_capacity_unique unique (developer_id, year, month)
);

create index if not exists developer_monthly_capacity_developer_id_idx
  on public.developer_monthly_capacity (developer_id);

create trigger developer_monthly_capacity_set_updated_at
before update on public.developer_monthly_capacity
for each row
execute function public.set_updated_at();

comment on table public.developer_monthly_capacity is
  'Optional developer-specific monthly hour target. Falls back to weekday defaults.';

-- ---------------------------------------------------------------------------
-- productivity_snapshots: Compilado-aligned metrics
-- ---------------------------------------------------------------------------
alter table public.productivity_snapshots
  add column if not exists on_time_cards_count integer not null default 0,
  add column if not exists rework_cards_count integer not null default 0,
  add column if not exists rework_weight_total numeric(12, 2) not null default 0,
  add column if not exists avg_delay_days numeric(12, 2),
  add column if not exists max_delay_days numeric(12, 2),
  add column if not exists utilization_rate numeric(8, 6),
  add column if not exists required_hours numeric(12, 2);

-- Align legacy completed_cards_count with on_time semantics when empty.
update public.productivity_snapshots
set on_time_cards_count = completed_cards_count
where on_time_cards_count = 0
  and completed_cards_count > 0;

comment on column public.productivity_snapshots.on_time_cards_count is
  'Cards with delay_days <= 0 in the period.';
comment on column public.productivity_snapshots.utilization_rate is
  'Aproveitamento = (on_time_cards_count - rework_cards_count) / cards_count.';
comment on column public.productivity_snapshots.required_hours is
  'Monthly capacity/meta in hours for the snapshot period.';

-- ---------------------------------------------------------------------------
-- RLS for new tables (admin/gestor manage; authenticated read capacity defaults)
-- ---------------------------------------------------------------------------
alter table public.capacity_weekday_hours enable row level security;
alter table public.developer_monthly_capacity enable row level security;

create policy "capacity_weekday_hours_select_authenticated"
  on public.capacity_weekday_hours
  for select
  to authenticated
  using (true);

create policy "capacity_weekday_hours_admin_gestor_write"
  on public.capacity_weekday_hours
  for all
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

create policy "developer_monthly_capacity_select_own_or_managers"
  on public.developer_monthly_capacity
  for select
  to authenticated
  using (
    exists (
      select 1 from public.developers d
      where d.id = developer_id and d.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "developer_monthly_capacity_admin_gestor_write"
  on public.developer_monthly_capacity
  for all
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

-- Snapshots: developers read own; managers read all; managers write.
create policy "productivity_snapshots_select_own_or_managers"
  on public.productivity_snapshots
  for select
  to authenticated
  using (
    exists (
      select 1 from public.developers d
      where d.id = developer_id and d.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

create policy "productivity_snapshots_admin_gestor_write"
  on public.productivity_snapshots
  for all
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
