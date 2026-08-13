-- Time bank (banco de horas) + closing snapshot fields for new NF formula.
-- Historical safety: finalized/closed closings keep frozen money columns;
-- new formula applies only on new submit; ledger posts only on finalize going forward.

-- ── Compensation flag ──────────────────────────────────────────────────────
alter table public.developer_compensation
  add column if not exists time_bank_enabled boolean not null default false;

comment on column public.developer_compensation.time_bank_enabled is
  'Quando true, diferença Jira vs horas/mês contratadas vai ao banco de horas (sem ajuste monetário na NF).';

-- ── Closing snapshot (new formula transparency; null on pre-existing rows) ─
alter table public.monthly_closings
  add column if not exists contracted_hours_month_snapshot numeric(10, 2),
  add column if not exists time_bank_enabled_snapshot boolean,
  add column if not exists time_bank_hours_delta numeric(10, 2),
  add column if not exists jira_deficit_amount numeric(12, 2),
  add column if not exists presencial_extra_amount numeric(12, 2),
  add column if not exists time_bank_posted_at timestamptz;

comment on column public.monthly_closings.contracted_hours_month_snapshot is
  'Horas/mês contratadas no momento do submit (snapshot).';
comment on column public.monthly_closings.time_bank_enabled_snapshot is
  'Se banco de horas estava ativo no submit. NULL = fechamento anterior à feature.';
comment on column public.monthly_closings.time_bank_hours_delta is
  'Jira − contratado (positivo credita, negativo debita). Só monetiza se bank OFF.';
comment on column public.monthly_closings.jira_deficit_amount is
  'Desconto em R$ por déficit Jira no submit (0 se banco ON ou sem déficit).';
comment on column public.monthly_closings.presencial_extra_amount is
  'Excedente 2h/dia presencial (variável + 6h/dia) no submit.';
comment on column public.monthly_closings.time_bank_posted_at is
  'Quando o Δ foi lançado no ledger (finalize). Não backfill em fechamentos antigos.';

-- ── Folha: meal flag independent of travel (presencial) ────────────────────
alter table public.payroll_attendance_days
  add column if not exists charges_meal boolean not null default false;

comment on column public.payroll_attendance_days.charges_meal is
  'Quando true, o dia conta para refeição. Deslocamento = day_kind presencial.';

-- Backfill: existing presencial days charged meal (previous Folha behavior).
update public.payroll_attendance_days
set charges_meal = true
where day_kind = 'presencial'
  and charges_meal = false;

-- ── Time bank ledger ───────────────────────────────────────────────────────
create table if not exists public.developer_time_bank_entries (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers (id) on delete cascade,
  year_month text not null check (year_month ~ '^\d{4}-\d{2}$'),
  hours_delta numeric(10, 2) not null,
  monthly_closing_id uuid references public.monthly_closings (id) on delete set null,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint developer_time_bank_entries_closing_unique
    unique (monthly_closing_id)
);

create index if not exists developer_time_bank_entries_developer_idx
  on public.developer_time_bank_entries (developer_id, created_at desc);

create index if not exists developer_time_bank_entries_year_month_idx
  on public.developer_time_bank_entries (developer_id, year_month);

comment on table public.developer_time_bank_entries is
  'Lançamentos do banco de horas. Um por fechamento finalizado (quando habilitado). Sem backfill histórico.';

alter table public.developer_time_bank_entries enable row level security;

create policy "developer_time_bank_entries_select_own_or_managers"
  on public.developer_time_bank_entries
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

create policy "developer_time_bank_entries_write_managers"
  on public.developer_time_bank_entries
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
