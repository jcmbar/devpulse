-- Allow pausing in-progress analyst tasks (multi pause/resume until complete).

alter table public.analyst_tasks
  add column if not exists paused_at timestamptz,
  add column if not exists total_paused_ms bigint not null default 0;

alter table public.analyst_tasks
  drop constraint if exists analyst_tasks_status_valid;

alter table public.analyst_tasks
  add constraint analyst_tasks_status_valid
  check (status in ('running', 'paused', 'completed'));

alter table public.analyst_tasks
  drop constraint if exists analyst_tasks_status_time_consistent;

alter table public.analyst_tasks
  add constraint analyst_tasks_status_time_consistent
  check (
    (status = 'running' and ended_at is null and paused_at is null)
    or (status = 'paused' and ended_at is null and paused_at is not null)
    or (status = 'completed' and ended_at is not null and paused_at is null)
  );

alter table public.analyst_tasks
  drop constraint if exists analyst_tasks_paused_ms_nonneg;

alter table public.analyst_tasks
  add constraint analyst_tasks_paused_ms_nonneg
  check (total_paused_ms >= 0);

create index if not exists analyst_tasks_active_by_developer_idx
  on public.analyst_tasks (developer_id, started_at desc)
  where deleted_at is null and status in ('running', 'paused');
