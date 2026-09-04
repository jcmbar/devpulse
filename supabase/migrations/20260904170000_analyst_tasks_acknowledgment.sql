-- Manager/admin acknowledgment ("ciente") on analyst tasks.

alter table public.analyst_tasks
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by uuid references public.profiles (id) on delete set null,
  add column if not exists acknowledged_by_name text;

alter table public.analyst_tasks
  drop constraint if exists analyst_tasks_ack_consistent;

alter table public.analyst_tasks
  add constraint analyst_tasks_ack_consistent
  check (
    (
      acknowledged_at is null
      and acknowledged_by is null
      and acknowledged_by_name is null
    )
    or (
      acknowledged_at is not null
      and acknowledged_by is not null
      and acknowledged_by_name is not null
      and length(trim(acknowledged_by_name)) > 0
    )
  );

create index if not exists analyst_tasks_acknowledged_at_idx
  on public.analyst_tasks (acknowledged_at desc)
  where deleted_at is null and acknowledged_at is not null;
