-- Job title on developers + compensation history with vigência.

-- ---------------------------------------------------------------------------
-- developers.job_title (professional role, not profiles.role / auth)
-- ---------------------------------------------------------------------------

alter table public.developers
  add column if not exists job_title text not null default 'developer';

alter table public.developers
  drop constraint if exists developers_job_title_check;

alter table public.developers
  add constraint developers_job_title_check
  check (job_title in ('developer', 'analyst'));

comment on column public.developers.job_title is
  'Professional job title (developer, analyst, …). Distinct from profiles.role (auth privilege).';

create index if not exists developers_job_title_idx
  on public.developers (job_title);

-- ---------------------------------------------------------------------------
-- developer_compensation (current + historical rates)
-- ---------------------------------------------------------------------------

create table if not exists public.developer_compensation (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers (id) on delete cascade,
  base_amount numeric(12, 2) not null default 0
    check (base_amount >= 0),
  base_type text not null
    check (base_type in ('fixed', 'variable')),
  hourly_rate numeric(12, 4)
    check (hourly_rate is null or hourly_rate >= 0),
  contracted_hours_per_day numeric(6, 2) not null
    check (contracted_hours_per_day > 0),
  contracted_hours_per_month numeric(8, 2) not null
    check (contracted_hours_per_month > 0),
  currency text not null default 'BRL',
  effective_from date not null default (timezone('utc', now()))::date,
  effective_to date,
  is_current boolean not null default true,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint developer_compensation_effective_range_valid
    check (effective_to is null or effective_to >= effective_from)
);

comment on table public.developer_compensation is
  'Contracted pay and hours per person. is_current marks the active row; close+insert for reajustes.';

create trigger developer_compensation_set_updated_at
before update on public.developer_compensation
for each row
execute function public.set_updated_at();

create index if not exists developer_compensation_developer_idx
  on public.developer_compensation (developer_id);

create index if not exists developer_compensation_developer_from_idx
  on public.developer_compensation (developer_id, effective_from desc);

create unique index if not exists developer_compensation_one_current_per_developer_idx
  on public.developer_compensation (developer_id)
  where is_current;

-- ---------------------------------------------------------------------------
-- RLS (admin/gestor write; authenticated can read — same family as developers)
-- ---------------------------------------------------------------------------

alter table public.developer_compensation enable row level security;

create policy "developer_compensation_select_authenticated"
  on public.developer_compensation
  for select
  to authenticated
  using (true);

create policy "developer_compensation_admin_gestor_insert"
  on public.developer_compensation
  for insert
  to authenticated
  with check (public.is_admin_or_gestor());

create policy "developer_compensation_admin_gestor_update"
  on public.developer_compensation
  for update
  to authenticated
  using (public.is_admin_or_gestor())
  with check (public.is_admin_or_gestor());

create policy "developer_compensation_admin_gestor_delete"
  on public.developer_compensation
  for delete
  to authenticated
  using (public.is_admin_or_gestor());
