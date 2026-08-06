-- Developer/analyst values declared when submitting monthly closing for review.
-- Separate from Folha attendance; frozen at submit for gestor review.

alter table public.monthly_closings
  add column if not exists travel_presencial_days integer,
  add column if not exists meal_presencial_days integer,
  add column if not exists travel_amount numeric(12, 2),
  add column if not exists meal_amount numeric(12, 2),
  add column if not exists differential_amount numeric(12, 2),
  add column if not exists invoice_amount numeric(12, 2),
  add column if not exists compensation_base_amount numeric(12, 2),
  add column if not exists compensation_base_type text
    check (
      compensation_base_type is null
      or compensation_base_type in ('fixed', 'variable')
    ),
  add column if not exists compensation_hourly_rate numeric(12, 4),
  add column if not exists compensation_daily_travel_amount numeric(12, 2),
  add column if not exists compensation_daily_meal_amount numeric(12, 2),
  add column if not exists worked_hours_snapshot numeric(10, 2),
  add column if not exists developer_values_notes text,
  add column if not exists values_submitted_at timestamptz;

comment on column public.monthly_closings.travel_presencial_days is
  'Count of presencial/travel days declared by developer at submit.';
comment on column public.monthly_closings.meal_presencial_days is
  'Count of meal presencial days declared by developer at submit.';
comment on column public.monthly_closings.differential_amount is
  'Folha-aligned differential at submit (variable: worked×rate − base; fixed: 0).';
comment on column public.monthly_closings.invoice_amount is
  'Folha-aligned NF total at submit: base + differential + travel + meal (discounts 0).';
comment on column public.monthly_closings.developer_values_notes is
  'Optional free-text notes from developer when submitting values (variable compensation).';

create table if not exists public.monthly_closing_presence_days (
  id uuid primary key default gen_random_uuid(),
  monthly_closing_id uuid not null
    references public.monthly_closings (id) on delete cascade,
  kind text not null check (kind in ('travel', 'meal')),
  day_on date not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint monthly_closing_presence_days_unique
    unique (monthly_closing_id, kind, day_on)
);

create index if not exists monthly_closing_presence_days_closing_idx
  on public.monthly_closing_presence_days (monthly_closing_id, kind);

comment on table public.monthly_closing_presence_days is
  'Day selections for travel/meal presence declared at monthly closing submit.';

alter table public.monthly_closing_presence_days enable row level security;

create policy "monthly_closing_presence_days_select_own_or_managers"
  on public.monthly_closing_presence_days
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

create policy "monthly_closing_presence_days_insert_own_open_or_rejected"
  on public.monthly_closing_presence_days
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.monthly_closings c
      where c.id = monthly_closing_id
        and c.status in ('open', 'rejected')
        and c.developer_id in (
          select d.id from public.developers d where d.profile_id = auth.uid()
        )
    )
  );

create policy "monthly_closing_presence_days_delete_own_open_or_rejected"
  on public.monthly_closing_presence_days
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.monthly_closings c
      where c.id = monthly_closing_id
        and c.status in ('open', 'rejected')
        and c.developer_id in (
          select d.id from public.developers d where d.profile_id = auth.uid()
        )
    )
  );

-- Keep finalized lock covering the new value columns.
create or replace function public.prevent_finalized_monthly_closing_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'finalized' then
    if new.status is distinct from old.status
       and new.status in ('open', 'in_review', 'rejected', 'closed') then
      return new;
    end if;

    if (
      new.status is distinct from old.status
      or new.manager_invoice_notes is distinct from old.manager_invoice_notes
      or new.snapshot_generated_at is distinct from old.snapshot_generated_at
      or new.import_id is distinct from old.import_id
      or new.submitted_at is distinct from old.submitted_at
      or new.closed_at is distinct from old.closed_at
      or new.finalized_at is distinct from old.finalized_at
      or new.manager_approved_at is distinct from old.manager_approved_at
      or new.travel_presencial_days is distinct from old.travel_presencial_days
      or new.meal_presencial_days is distinct from old.meal_presencial_days
      or new.travel_amount is distinct from old.travel_amount
      or new.meal_amount is distinct from old.meal_amount
      or new.differential_amount is distinct from old.differential_amount
      or new.invoice_amount is distinct from old.invoice_amount
      or new.developer_values_notes is distinct from old.developer_values_notes
    ) then
      if new.jira_changed_after_finalized is not distinct from old.jira_changed_after_finalized
         and new.jira_changed_after_finalized_at is not distinct from old.jira_changed_after_finalized_at then
        raise exception 'Fechamento finalizado não pode ser alterado.';
      end if;

      if new.status is distinct from old.status
         or new.manager_invoice_notes is distinct from old.manager_invoice_notes
         or new.snapshot_generated_at is distinct from old.snapshot_generated_at
         or new.import_id is distinct from old.import_id
         or new.submitted_at is distinct from old.submitted_at
         or new.closed_at is distinct from old.closed_at
         or new.finalized_at is distinct from old.finalized_at
         or new.manager_approved_at is distinct from old.manager_approved_at
         or new.travel_presencial_days is distinct from old.travel_presencial_days
         or new.meal_presencial_days is distinct from old.meal_presencial_days
         or new.travel_amount is distinct from old.travel_amount
         or new.meal_amount is distinct from old.meal_amount
         or new.differential_amount is distinct from old.differential_amount
         or new.invoice_amount is distinct from old.invoice_amount
         or new.developer_values_notes is distinct from old.developer_values_notes then
        raise exception 'Fechamento finalizado não pode ser alterado.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_finalized_monthly_closing_presence_mutation()
returns trigger
language plpgsql
as $$
declare
  closing_status text;
begin
  select status into closing_status
  from public.monthly_closings
  where id = coalesce(new.monthly_closing_id, old.monthly_closing_id);

  if closing_status = 'finalized' then
    raise exception 'Presenças de fechamento finalizado não podem ser alteradas.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists monthly_closing_presence_prevent_finalized_mutation
  on public.monthly_closing_presence_days;

create trigger monthly_closing_presence_prevent_finalized_mutation
before insert or update or delete on public.monthly_closing_presence_days
for each row
execute function public.prevent_finalized_monthly_closing_presence_mutation();
