-- Optional additional context for an analyst task.

alter table public.analyst_tasks
  add column if not exists details text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'analyst_tasks_details_length'
      and conrelid = 'public.analyst_tasks'::regclass
  ) then
    alter table public.analyst_tasks
      add constraint analyst_tasks_details_length
      check (details is null or length(details) <= 2000);
  end if;
end
$$;
