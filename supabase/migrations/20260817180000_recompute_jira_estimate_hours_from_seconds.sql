-- Older Jira syncs stored timeoriginalestimate values < 1000 as hours
-- (1 minute = 60 seconds became 60h). Recompute from raw seconds.

update public.jira_issues
set estimate_hours = round(src.seconds / 3600.0, 2)
from (
  select
    id,
    (raw_payload #>> '{fields,timeoriginalestimate}')::numeric as seconds
  from public.jira_issues
  where raw_payload #>> '{fields,timeoriginalestimate}' ~ '^[0-9]+(\.[0-9]+)?$'
) src
where public.jira_issues.id = src.id;

comment on column public.jira_issues.estimate_hours is
  'Mapped original estimate in hours. Jira timeoriginalestimate is seconds (/3600).';
