-- Allow analysts to track multiple running tasks at the same time.

drop index if exists public.analyst_tasks_one_open_per_developer_idx;

create index if not exists analyst_tasks_running_by_developer_idx
  on public.analyst_tasks (developer_id, started_at desc)
  where status = 'running' and deleted_at is null;
