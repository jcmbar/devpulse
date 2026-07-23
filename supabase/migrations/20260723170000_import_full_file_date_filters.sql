-- Full-file imports: period_* becomes detected delivery span metadata.
-- Query-time date filters replace mandatory upload period.

alter table public.imports
  alter column period_start drop not null;

alter table public.imports
  alter column period_end drop not null;

alter table public.imports
  drop constraint if exists imports_period_valid;

alter table public.imports
  add constraint imports_period_valid
  check (
    (period_start is null and period_end is null)
    or (
      period_start is not null
      and period_end is not null
      and period_end >= period_start
    )
  );

alter table public.imports
  add column if not exists cards_with_delivery_count integer not null default 0;

comment on column public.imports.period_start is
  'Detected minimum unit_test_delivery_on in the batch (legacy rows may still hold a manually entered start).';

comment on column public.imports.period_end is
  'Detected maximum unit_test_delivery_on in the batch (legacy rows may still hold a manually entered end).';

comment on column public.imports.cards_with_delivery_count is
  'Count of imported cards with a valid Compilado delivery date (unit_test_delivery_on).';

comment on table public.imports is
  'Import batches from JIRA/spreadsheet. Full file is stored; Compilado date filters apply at query time.';

update public.imports i
set cards_with_delivery_count = coalesce(
  (
    select count(*)::integer
    from public.jira_cards c
    where c.import_id = i.id
      and c.unit_test_delivery_on is not null
  ),
  0
);
