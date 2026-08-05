-- Folha / fechamento financeiro (Phase 1). Separate from monthly_closings (productivity).

-- ---------------------------------------------------------------------------
-- Compensation: daily travel / meal allowances
-- ---------------------------------------------------------------------------

alter table public.developer_compensation
  add column if not exists daily_travel_amount numeric(12, 2) not null default 0
    check (daily_travel_amount >= 0);

alter table public.developer_compensation
  add column if not exists daily_meal_amount numeric(12, 2) not null default 0
    check (daily_meal_amount >= 0);

comment on column public.developer_compensation.daily_travel_amount is
  'Valor diário de deslocamento (presencial).';

comment on column public.developer_compensation.daily_meal_amount is
  'Valor diário de refeição (presencial).';

-- ---------------------------------------------------------------------------
-- Invoice issuers (empresas emissoras)
-- ---------------------------------------------------------------------------

create table if not exists public.invoice_issuers (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  cnpj text not null,
  state_registration text,
  municipal_registration text,
  address_street text,
  address_neighborhood text,
  address_cep text,
  address_city text,
  address_uf text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint invoice_issuers_cnpj_unique unique (cnpj)
);

comment on table public.invoice_issuers is
  'Empresas emissoras de NF usadas no fechamento financeiro (folha).';

create trigger invoice_issuers_set_updated_at
before update on public.invoice_issuers
for each row
execute function public.set_updated_at();

create index if not exists invoice_issuers_active_idx
  on public.invoice_issuers (is_active);

alter table public.invoice_issuers enable row level security;

create policy "invoice_issuers_select_authenticated"
  on public.invoice_issuers for select to authenticated using (true);

create policy "invoice_issuers_admin_gestor_write"
  on public.invoice_issuers for all to authenticated
  using (public.is_admin_or_gestor())
  with check (public.is_admin_or_gestor());

insert into public.invoice_issuers (
  legal_name,
  cnpj,
  state_registration,
  municipal_registration,
  address_street,
  address_neighborhood,
  address_cep,
  address_city,
  address_uf,
  email,
  is_active
)
values (
  'SISTEMA ATHOS EMPRESARIAL LTDA',
  '50.261.365/0001-48',
  '135.460.240.114',
  '7.665.834-1',
  'Rua Osaka, nº 599',
  'Jardim Japão',
  '02124-040',
  'São Paulo',
  'SP',
  null,
  true
)
on conflict (cnpj) do nothing;

-- ---------------------------------------------------------------------------
-- Payroll month closing (header)
-- ---------------------------------------------------------------------------

create table if not exists public.payroll_month_closings (
  id uuid primary key default gen_random_uuid(),
  year_month text not null,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'closed')),
  period_start date not null,
  period_end date not null,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint payroll_month_closings_year_month_format
    check (year_month ~ '^\d{4}-\d{2}$'),
  constraint payroll_month_closings_period_order
    check (period_end >= period_start),
  constraint payroll_month_closings_year_month_unique unique (year_month)
);

comment on table public.payroll_month_closings is
  'Cabeçalho do fechamento financeiro (folha) por mês. Domínio separado de monthly_closings.';

create trigger payroll_month_closings_set_updated_at
before update on public.payroll_month_closings
for each row
execute function public.set_updated_at();

alter table public.payroll_month_closings enable row level security;

create policy "payroll_month_closings_select_admin_gestor"
  on public.payroll_month_closings for select to authenticated
  using (public.is_admin_or_gestor());

create policy "payroll_month_closings_admin_gestor_write"
  on public.payroll_month_closings for all to authenticated
  using (public.is_admin_or_gestor())
  with check (public.is_admin_or_gestor());

-- ---------------------------------------------------------------------------
-- Payroll closing items (per person snapshot + editable amounts)
-- ---------------------------------------------------------------------------

create table if not exists public.payroll_closing_items (
  id uuid primary key default gen_random_uuid(),
  payroll_closing_id uuid not null
    references public.payroll_month_closings (id) on delete cascade,
  developer_id uuid not null
    references public.developers (id) on delete cascade,
  developer_name text not null,
  team_id uuid references public.teams (id) on delete set null,
  -- compensation snapshot at ensure/refresh
  base_amount numeric(12, 2) not null default 0 check (base_amount >= 0),
  base_type text not null default 'fixed'
    check (base_type in ('fixed', 'variable')),
  hourly_rate numeric(12, 4) check (hourly_rate is null or hourly_rate >= 0),
  contracted_hours_per_day numeric(6, 2) not null default 8
    check (contracted_hours_per_day > 0),
  contracted_hours_per_month numeric(8, 2) not null default 168
    check (contracted_hours_per_month > 0),
  daily_travel_amount numeric(12, 2) not null default 0
    check (daily_travel_amount >= 0),
  daily_meal_amount numeric(12, 2) not null default 0
    check (daily_meal_amount >= 0),
  presencial_days_count integer not null default 0
    check (presencial_days_count >= 0),
  -- editable amounts (defaults from calculation)
  differential_amount numeric(12, 2) not null default 0,
  discounts_amount numeric(12, 2) not null default 0 check (discounts_amount >= 0),
  travel_amount numeric(12, 2) not null default 0 check (travel_amount >= 0),
  meal_amount numeric(12, 2) not null default 0 check (meal_amount >= 0),
  invoice_amount numeric(12, 2) not null default 0,
  differential_manual boolean not null default false,
  travel_manual boolean not null default false,
  meal_manual boolean not null default false,
  invoice_issuer_id uuid references public.invoice_issuers (id) on delete set null,
  -- future workflow placeholders
  email_status text not null default 'pending'
    check (email_status in ('pending', 'sent', 'skipped')),
  invoice_status text not null default 'pending'
    check (invoice_status in ('pending', 'received', 'skipped')),
  finance_status text not null default 'pending'
    check (finance_status in ('pending', 'paid', 'skipped')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint payroll_closing_items_unique_person
    unique (payroll_closing_id, developer_id)
);

comment on table public.payroll_closing_items is
  'Linha do sintético mensal por pessoa. Snapshot de valores + overrides manuais.';

create trigger payroll_closing_items_set_updated_at
before update on public.payroll_closing_items
for each row
execute function public.set_updated_at();

create index if not exists payroll_closing_items_closing_idx
  on public.payroll_closing_items (payroll_closing_id);

create index if not exists payroll_closing_items_developer_idx
  on public.payroll_closing_items (developer_id);

alter table public.payroll_closing_items enable row level security;

create policy "payroll_closing_items_select_admin_gestor"
  on public.payroll_closing_items for select to authenticated
  using (public.is_admin_or_gestor());

create policy "payroll_closing_items_admin_gestor_write"
  on public.payroll_closing_items for all to authenticated
  using (public.is_admin_or_gestor())
  with check (public.is_admin_or_gestor());

-- ---------------------------------------------------------------------------
-- Attendance calendar (per person / day within a closing item)
-- ---------------------------------------------------------------------------

create table if not exists public.payroll_attendance_days (
  id uuid primary key default gen_random_uuid(),
  payroll_item_id uuid not null
    references public.payroll_closing_items (id) on delete cascade,
  day_on date not null,
  day_kind text not null
    check (day_kind in ('presencial', 'home', 'off', 'holiday', 'weekend')),
  hours numeric(6, 2) not null default 0 check (hours >= 0),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint payroll_attendance_days_unique unique (payroll_item_id, day_on)
);

comment on table public.payroll_attendance_days is
  'Calendário mensal de presença por pessoa no fechamento financeiro.';

create trigger payroll_attendance_days_set_updated_at
before update on public.payroll_attendance_days
for each row
execute function public.set_updated_at();

create index if not exists payroll_attendance_days_item_idx
  on public.payroll_attendance_days (payroll_item_id);

create index if not exists payroll_attendance_days_kind_idx
  on public.payroll_attendance_days (payroll_item_id, day_kind);

alter table public.payroll_attendance_days enable row level security;

create policy "payroll_attendance_days_select_admin_gestor"
  on public.payroll_attendance_days for select to authenticated
  using (public.is_admin_or_gestor());

create policy "payroll_attendance_days_admin_gestor_write"
  on public.payroll_attendance_days for all to authenticated
  using (public.is_admin_or_gestor())
  with check (public.is_admin_or_gestor());
