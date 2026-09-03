-- FASE 1 — normalização segura do ledger legado
-- Não endurece NOT NULL/checks finais e não remove colunas legadas.
-- Registros ambíguos ficam preservados como legacy_import até revisão manual.

alter table public.monthly_closings
  add column if not exists time_bank_posting_sequence integer not null default 0;

alter table public.developer_time_bank_entries
  add column if not exists entry_date date,
  add column if not exists entry_type text,
  add column if not exists source text,
  add column if not exists minutes_amount integer,
  add column if not exists description text,
  add column if not exists reversed_entry_id uuid references public.developer_time_bank_entries (id) on delete restrict,
  add column if not exists metadata_json jsonb,
  add column if not exists closing_sequence integer;

comment on column public.monthly_closings.time_bank_posting_sequence is
  'Sequência monotônica do posting do banco de horas para suportar refinalizações sem apagar histórico.';

comment on column public.developer_time_bank_entries.source is
  'Origem provisória: monthly_closing | manual_adjustment | reversal | legacy_import.';

alter table public.developer_time_bank_entries
  drop constraint if exists developer_time_bank_entries_source_check;

alter table public.developer_time_bank_entries
  add constraint developer_time_bank_entries_source_check
  check (
    source is null
    or source in ('monthly_closing', 'manual_adjustment', 'reversal', 'legacy_import')
  );

-- Registros legados confiáveis: possuem fechamento, competência válida e delta != 0.
update public.developer_time_bank_entries
set entry_date = coalesce(entry_date, created_at::date),
    entry_type = coalesce(
      entry_type,
      case
        when hours_delta > 0 then 'credit'
        when hours_delta < 0 then 'debit'
        else null
      end
    ),
    source = coalesce(source, 'monthly_closing'),
    minutes_amount = coalesce(
      minutes_amount,
      case
        when hours_delta is null or hours_delta = 0 then null
        else round(abs(hours_delta) * 60.0)::integer
      end
    ),
    description = coalesce(description, note),
    closing_sequence = coalesce(closing_sequence, 1),
    metadata_json = coalesce(
      metadata_json,
      jsonb_build_object(
        'backfill_phase', 1,
        'legacy_hours_delta', hours_delta,
        'legacy_note', note,
        'normalized_as', 'trusted_monthly_closing'
      )
    )
where monthly_closing_id is not null
  and year_month ~ '^\d{4}-\d{2}$'
  and hours_delta is not null
  and hours_delta <> 0;

-- Legado ambíguo: preserva a linha sem inventar origem de fechamento.
update public.developer_time_bank_entries
set entry_date = coalesce(entry_date, created_at::date),
    entry_type = coalesce(
      entry_type,
      case
        when hours_delta > 0 then 'credit'
        when hours_delta < 0 then 'debit'
        else null
      end
    ),
    source = coalesce(source, 'legacy_import'),
    minutes_amount = coalesce(
      minutes_amount,
      case
        when hours_delta is null or hours_delta = 0 then null
        else round(abs(hours_delta) * 60.0)::integer
      end
    ),
    description = coalesce(description, note),
    metadata_json = coalesce(
      metadata_json,
      jsonb_build_object(
        'backfill_phase', 1,
        'legacy_hours_delta', hours_delta,
        'legacy_note', note,
        'review_required', true
      )
    )
where (
  monthly_closing_id is not null
  and year_month ~ '^\d{4}-\d{2}$'
  and hours_delta is not null
  and hours_delta <> 0
) is distinct from true;

-- Alinha a sequência legada apenas para fechamentos já confiáveis.
update public.monthly_closings mc
set time_bank_posting_sequence = trusted.max_closing_sequence
from (
  select monthly_closing_id, max(closing_sequence) as max_closing_sequence
  from public.developer_time_bank_entries
  where source = 'monthly_closing'
    and monthly_closing_id is not null
    and closing_sequence is not null
  group by monthly_closing_id
) trusted
where trusted.monthly_closing_id = mc.id
  and mc.time_bank_posting_sequence < trusted.max_closing_sequence;

create index if not exists developer_time_bank_entries_developer_entry_date_idx
  on public.developer_time_bank_entries (developer_id, entry_date desc, created_at desc);

create index if not exists developer_time_bank_entries_developer_year_month_idx
  on public.developer_time_bank_entries (developer_id, year_month);

create index if not exists developer_time_bank_entries_closing_idx
  on public.developer_time_bank_entries (monthly_closing_id);

create or replace view public.time_bank_legacy_backfill_preview as
select
  count(*) as total_rows,
  count(*) filter (
    where monthly_closing_id is not null
      and year_month ~ '^\d{4}-\d{2}$'
      and hours_delta is not null
      and hours_delta <> 0
  ) as trusted_monthly_closing_rows,
  count(*) filter (
    where (
      monthly_closing_id is not null
      and year_month ~ '^\d{4}-\d{2}$'
      and hours_delta is not null
      and hours_delta <> 0
    ) is distinct from true
  ) as unresolved_legacy_rows,
  count(*) filter (where hours_delta = 0) as zero_delta_rows,
  count(*) filter (where monthly_closing_id is null) as rows_without_closing_id,
  count(*) filter (where year_month is null or year_month !~ '^\d{4}-\d{2}$') as rows_without_valid_year_month
from public.developer_time_bank_entries;

create or replace view public.time_bank_ledger_hardening_invalid_rows as
select
  id,
  developer_id,
  year_month,
  monthly_closing_id,
  entry_date,
  entry_type,
  source,
  minutes_amount,
  closing_sequence,
  reversed_entry_id,
  metadata_json
from public.developer_time_bank_entries
where
  source is null
  or source = 'legacy_import'
  or (source = 'monthly_closing' and (
    monthly_closing_id is null
    or year_month !~ '^\d{4}-\d{2}$'
    or entry_type not in ('credit', 'debit')
    or minutes_amount is null
    or minutes_amount <= 0
    or closing_sequence is null
  ))
  or (source = 'manual_adjustment' and (
    entry_type not in ('credit', 'debit')
    or minutes_amount is null
    or minutes_amount <= 0
  ))
  or (source = 'reversal' and (
    reversed_entry_id is null
    or entry_type not in ('credit', 'debit')
    or minutes_amount is null
    or minutes_amount <= 0
  ));

create or replace view public.time_bank_phase2_duplicate_monthly_closing_sequences as
select
  monthly_closing_id,
  closing_sequence,
  count(*) as total
from public.developer_time_bank_entries
where source = 'monthly_closing'
  and monthly_closing_id is not null
  and closing_sequence is not null
group by monthly_closing_id, closing_sequence
having count(*) > 1;
